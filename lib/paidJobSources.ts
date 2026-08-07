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
      body: JSON.stringify({ keywords, location, ResultOnPage: 25, page }),
      next: { revalidate: 1800 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const jobs: JoobleJob[] = data.jobs ?? [];
    return jobs.map((j, idx) =>
      finalize({
        id: `jooble-${location}-p${page}-${j.id ?? idx}`,
        title: j.title ?? "Untitled role",
        company: j.company || "—",
        location: j.location || location,
        applyUrl: j.link ?? "#",
        applyType: "external" as const,
      })
    );
  } catch {
    return [];
  }
}

// Jooble supports a documented `page` parameter for pagination, on top of
// `ResultOnPage` — pulling 2 pages per (keyword × location) combination
// roughly doubles Jooble's yield (up to 50 per location instead of 25).
export async function fetchJoobleJobs(apiKey: string, keywords: string, location: string): Promise<Job[]> {
  const [page1, page2] = await Promise.all([
    fetchJoobleJobsPage(apiKey, keywords, location, 1),
    fetchJoobleJobsPage(apiKey, keywords, location, 2),
  ]);
  return [...page1, ...page2];
}

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
      page_size: "25",
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
};

// SerpApi's Google Jobs engine.
export async function fetchSerpApiJobs(apiKey: string, keywords: string, location: string): Promise<Job[]> {
  try {
    const params = new URLSearchParams({
      engine: "google_jobs",
      q: keywords ? `${keywords} jobs in ${location}` : `jobs in ${location}`,
      location,
      api_key: apiKey,
      hl: "en",
    });
    const res = await fetch(`https://serpapi.com/search.json?${params.toString()}`, {
      next: { revalidate: 1800 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const results: SerpApiJobResult[] = data.jobs_results ?? [];
    return results.map((j, idx) => {
      const applyUrl = j.apply_options?.[0]?.link ?? j.share_link ?? "#";
      const sourceBoard = j.via?.replace(/^via\s+/i, "").trim();
      return finalize({
        id: `serpapi-${location}-${j.job_id ?? idx}`,
        title: j.title ?? "Untitled role",
        company: (j.company_name || sourceBoard) || "—",
        location: j.location || location,
        applyUrl,
        applyType: "external" as const,
      });
    });
  } catch {
    return [];
  }
}
