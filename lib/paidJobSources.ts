// Fetchers for the metered/paid job sources (Jooble, Careerjet, SerpApi).
//
// IMPORTANT: nothing in this app should call these functions directly from a
// user-facing request anymore. They are only ever called from
// lib/jobCache.ts's refreshGlobalJobCacheIfStale(), which runs on a shared
// schedule (see app/api/jobs/refresh-cache/route.ts) and writes results into
// the public.retrieved_jobs table. Every real user search (app/api/jobs/search/route.ts)
// and Auto Apply (lib/autoApplyRun.ts's callers) read from that cached table
// instead — that's what lets a handful of scheduled/shared calls here serve
// an unlimited number of user searches without ever touching SerpApi's
// 250-searches/month free-tier ceiling per search.
//
// Extracted unchanged (aside from being made reusable/exported) from what
// used to live inline in app/api/jobs/search/route.ts.

import { type Job, finalize } from "@/lib/jobSources";

type JoobleJob = {
  id?: string | number;
  title?: string;
  company?: string;
  location?: string;
  link?: string;
  // Jooble's own brief description snippet — never displayed in this app,
  // but the free-text description a genuinely remote/hybrid Gulf listing is
  // far more likely to actually say so in, since Jooble's `location` field
  // for a country-scoped search is otherwise just the plain country name
  // (see inferWorkType's comment in lib/jobSources.ts).
  snippet?: string;
};

export async function fetchJoobleJobsPage(
  apiKey: string,
  keywords: string,
  location: string,
  page: number
): Promise<Job[]> {
  try {
    const res = await fetch(`https://jooble.org/api/${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // ResultOnPage raised from 25 to 100 — this is still exactly ONE HTTP
      // call, just asking Jooble for a bigger page of results in that one
      // call, so a single daily refresh pulls more volume without spending
      // any extra quota.
      body: JSON.stringify({ keywords, location, ResultOnPage: 100, page }),
      next: { revalidate: 1800 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const jobs: JoobleJob[] = data.jobs ?? [];
    return jobs.map((j, idx) =>
      finalize(
        {
          id: `jooble-${location}-p${page}-${j.id ?? idx}`,
          title: j.title ?? "Untitled role",
          company: j.company || "—",
          location: j.location || location,
          applyUrl: j.link ?? "#",
          applyType: "external" as const,
        },
        j.snippet
      )
    );
  } catch {
    return [];
  }
}

// Deliberately no multi-page/multi-call Jooble helper here anymore — the
// whole point of lib/jobCache.ts is exactly ONE call per source per
// refresh. fetchJoobleJobsPage(apiKey, keywords, location, 1) is that one
// call; a second page would be a second call, same mistake as the old
// "9 locations" bug, just in a different shape.

type CareerjetJob = {
  url?: string;
  title?: string;
  company?: string;
  locations?: string;
};

// Careerjet v4 API, authenticated with HTTP Basic Auth (the API key as the
// username, empty password). Env var: CAREERJET_API_KEY.
export async function fetchCareerjetJobs(apiKey: string, keywords: string, locale: string): Promise<Job[]> {
  try {
    const params = new URLSearchParams({
      keywords,
      user_ip: "0.0.0.0",
      user_agent: "Mozilla/5.0 (GulfJobCopilot server-side job search)",
      locale_code: locale,
      // Raised from 25 to 100, same reasoning as Jooble's ResultOnPage
      // above — still exactly one HTTP call, just requesting a bigger page.
      page_size: "100",
    });
    const res = await fetch(`https://search.api.careerjet.net/v4/query?${params.toString()}`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
      },
      next: { revalidate: 1800 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const jobs: CareerjetJob[] = data.jobs ?? [];
    return jobs.map((j, idx) =>
      finalize({
        id: `careerjet-${locale}-${idx}`,
        title: j.title ?? "Untitled role",
        company: j.company || "—",
        location: j.locations || locale,
        applyUrl: j.url ?? "#",
        applyType: "external" as const,
      })
    );
  } catch {
    return [];
  }
}

// Careerjet locale codes with confirmed Gulf coverage (en_AE, en_SA, en_KW,
// en_OM, en_QA) — Bahrain, Lebanon, Jordan, and Egypt aren't in Careerjet's
// locale list, so those keep relying on Jooble + the curated fallback list.
export const CAREERJET_LOCALES = ["en_AE", "en_SA", "en_KW", "en_OM", "en_QA"];

type SerpApiJobResult = {
  job_id?: string;
  title?: string;
  company_name?: string;
  location?: string;
  via?: string;
  apply_options?: { title?: string; link?: string }[];
  share_link?: string;
  // Google Jobs' own remote-work signal — much more reliable than scanning
  // `location` text, since Google derives it from the actual posting rather
  // than us guessing from a country-scoped search's location string. Not
  // present on every result (SerpApi's own extraction of it is imperfect),
  // so this is a bonus signal layered on top of the title/location check in
  // inferWorkType, never the only one relied on.
  detected_extensions?: { work_from_home?: boolean; schedule_type?: string };
  // Human-readable labels mirroring detected_extensions (e.g. "Work from
  // home") — checked as free text too, since it can carry a signal even
  // when detected_extensions.work_from_home itself is missing.
  extensions?: string[];
};

export type SerpApiPageResult = { jobs: Job[]; nextPageToken?: string };

// SerpApi's Google Jobs engine. Returns both the jobs AND a nextPageToken
// (when SerpApi's response includes one) — Google Jobs only supports going
// deeper than page 1 via serpapi_pagination.next_page_token (the old
// numeric `start` offset is deprecated/unsupported), so callers that want a
// 2nd page pass the token they got back from the 1st call in as
// `nextPageToken` here.
export async function fetchSerpApiJobs(
  apiKey: string,
  keywords: string,
  location: string,
  nextPageToken?: string
): Promise<SerpApiPageResult> {
  try {
    const params = new URLSearchParams({
      engine: "google_jobs",
      q: keywords ? `${keywords} jobs in ${location}` : `jobs in ${location}`,
      location,
      api_key: apiKey,
      hl: "en",
    });
    if (nextPageToken) {
      params.set("next_page_token", nextPageToken);
    }
    const res = await fetch(`https://serpapi.com/search.json?${params.toString()}`, {
      next: { revalidate: 1800 },
    });
    if (!res.ok) return { jobs: [] };
    const data = await res.json();
    const results: SerpApiJobResult[] = data.jobs_results ?? [];
    const jobs = results.map((j, idx) => {
      const applyUrl = j.apply_options?.[0]?.link ?? j.share_link ?? "#";
      const sourceBoard = j.via?.replace(/^via\s+/i, "").trim();
      // Google's own detection beats a keyword scan when it's present —
      // fold it into plain text alongside the extensions labels so
      // inferWorkType's single regex pass picks it up the same way it
      // would pick up "remote" appearing anywhere else.
      const extraText = [
        j.detected_extensions?.work_from_home ? "remote work from home" : "",
        ...(j.extensions ?? []),
      ].join(" ");
      return finalize(
        {
          id: `serpapi-${location}-${nextPageToken ? "p2-" : ""}${j.job_id ?? idx}`,
          title: j.title ?? "Untitled role",
          company: (j.company_name || sourceBoard) || "—",
          location: j.location || location,
          applyUrl,
          applyType: "external" as const,
        },
        extraText
      );
    });
    const token: string | undefined = data.serpapi_pagination?.next_page_token;
    return { jobs, nextPageToken: token };
  } catch {
    return { jobs: [] };
  }
}
