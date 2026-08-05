import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  type Job,
  type WorkType,
  GREENHOUSE_BOARDS,
  LEVER_BOARDS,
  ASHBY_BOARDS,
  LOCATIONS,
  LOCATION_ALIASES,
  INDUSTRY_KEYWORDS,
  finalize,
  FALLBACK_JOBS,
  fetchGreenhouseJobs,
  fetchLeverJobs,
  fetchAshbyJobs,
  fetchRemoteOkJobs,
} from "@/lib/jobSources";

export const runtime = "nodejs";

// Job Search is an entirely Pro-gated page in the UI (see
// app/[locale]/dashboard/jobs/page.tsx), but this API route itself has no
// auth requirement — anyone who found the URL could otherwise call it
// directly and burn through the paid/keyed sources (SerpApi's free tier in
// particular is capped at 250 searches/month, shared across every user).
// DAILY_SEARCH_LIMIT caps how many times a single signed-in Pro user can
// trigger a real search per day; requires supabase/job-search-rate-limit.sql
// to actually enforce (fails open — no limiting at all — if that migration
// hasn't been run, same as every other optional migration in this repo).
// Note: app/[locale]/dashboard/reports/page.tsx also calls this same route
// for its job-market snapshot, so those calls share this same daily quota.
const DAILY_SEARCH_LIMIT = 10;


type JoobleJob = {
  id?: string | number;
  title?: string;
  company?: string;
  location?: string;
  link?: string;
};

async function fetchJoobleJobsPage(
  apiKey: string,
  keywords: string,
  location: string,
  page: number
): Promise<Job[]> {
  try {
    const res = await fetch(`https://jooble.org/api/${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // ResultOnPage explicitly asks Jooble for more results per call — this
      // used to rely on whatever Jooble's unstated default page size is and
      // then truncate to 8, which meant the single biggest real source of
      // volume in this whole route was capped well below what it could
      // actually return. 25 per (query × location) combination, across up
      // to 9 locations, is the main lever for going from "a handful of
      // jobs" to genuinely broad Gulf/Levant coverage once JOOBLE_API_KEY
      // is configured.
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
        // Jooble is an aggregator: the link goes to the original posting (its
        // own site or the employer's), so this is always a smart-apply deep
        // link, never an in-app auto-submit.
        applyType: "external" as const,
      })
    );
  } catch {
    return [];
  }
}

// Jooble supports a documented `page` parameter for pagination, on top of
// `ResultOnPage` — pulling 2 pages per (keyword × location) combination
// roughly doubles Jooble's yield (up to 50 per location instead of 25)
// without needing an undocumented, unverified ResultOnPage ceiling. This is
// the single biggest source of real volume in this whole route once
// JOOBLE_API_KEY is actually set.
async function fetchJoobleJobs(apiKey: string, keywords: string, location: string): Promise<Job[]> {
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

// Careerjet is a second, independent job aggregator (separate company from
// Jooble, sourcing from a different mix of boards/employers) with confirmed
// locale support for the UAE, Saudi Arabia, Kuwait, Oman, and Qatar — real
// redundancy rather than being 100% dependent on Jooble alone.
//
// Corrected this session: Careerjet has retired the old affid-based
// `public.api.careerjet.net/search` endpoint this integration was originally
// built against (that older client-library pattern is no longer what their
// own partner API page documents) in favor of a v4 API at
// `search.api.careerjet.net/v4/query`, authenticated with HTTP Basic Auth
// (the API key as the username, empty password) rather than an `affid` query
// param — confirmed directly against careerjet.com/partners/api. The env var
// is now CAREERJET_API_KEY (a free key from the same signup page), not
// CAREERJET_AFFID. Still gracefully does nothing until that's set, same
// no-op-until-configured pattern as Jooble/SerpApi. NOTE: still not
// live-tested end to end (this sandbox's network policy blocks
// careerjet.net), so verify a real response shape once CAREERJET_API_KEY is
// set, before relying on this as a primary source.
async function fetchCareerjetJobs(apiKey: string, keywords: string, locale: string): Promise<Job[]> {
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
        // Base64("<api-key>:") — Careerjet's v4 API uses the key as the Basic
        // Auth username with an empty password, not a bearer token.
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
const CAREERJET_LOCALES = ["en_AE", "en_SA", "en_KW", "en_OM", "en_QA"];

type SerpApiJobResult = {
  job_id?: string;
  title?: string;
  company_name?: string;
  location?: string;
  via?: string; // e.g. "via LinkedIn", "via Indeed" — the original source board
  apply_options?: { title?: string; link?: string }[];
  share_link?: string;
};

// SerpApi's Google Jobs engine — the source that lets a Gulf/MEA job seeker
// see real, live postings (including ones Google has indexed from LinkedIn)
// as native cards on our own jobs page, with no navigation to linkedin.com
// required just to see what's out there. Clicking "Apply" still goes to
// wherever the original posting actually lives (LinkedIn, the employer's own
// site, Indeed, etc.) — same as every other source in this file — because
// actually submitting an application on a third-party site can only happen
// on that site; this route only ever fetches indexed search results, never
// authenticated or account-specific data.
async function fetchSerpApiJobs(apiKey: string, keywords: string, location: string): Promise<Job[]> {
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
      // Prefer a direct apply link if SerpApi surfaced one; fall back to the
      // Google Jobs share link (still a real, working destination) rather
      // than a dead "#" — every other source in this file always resolves
      // to a real URL, so this one should too.
      const applyUrl = j.apply_options?.[0]?.link ?? j.share_link ?? "#";
      // "via" comes back as "via LinkedIn" / "via Indeed" / etc. — stripped
      // down to just the board name so it can be shown as a small source
      // badge on the card without the leading "via ".
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

export async function GET(request: NextRequest) {
  const qRaw = request.nextUrl.searchParams.get("q") ?? "";
  const q = qRaw.toLowerCase();
  const locationFilter = request.nextUrl.searchParams.get("location") ?? "";
  const industryFilter = request.nextUrl.searchParams.get("industry") ?? "";
  const workTypeParam = request.nextUrl.searchParams.get("workType") ?? "";
  const workTypeFilter: WorkType | "" =
    workTypeParam === "remote" || workTypeParam === "hybrid" || workTypeParam === "onsite"
      ? workTypeParam
      : "";

  // --- Auth + daily quota (see DAILY_SEARCH_LIMIT above) ---
  // `quota` is only populated for a signed-in Pro user with the migration
  // applied — it's what the client shows as "N searches left today".
  // `skipPaidSources` gates Jooble/Careerjet/SerpApi specifically: it's true
  // whenever the caller isn't a verified, under-quota Pro user, so an
  // unauthenticated or free-plan request (bypassing the UI's Pro gate
  // directly) never spends any of the paid/keyed quota, and a Pro user past
  // today's limit still gets real results — just from the always-free
  // Greenhouse/Lever/Ashby boards and the curated fallback list, not a hard
  // error.
  let quota: { used: number; limit: number; remaining: number } | null = null;
  let skipPaidSources = true;
  try {
    const supabase = await createServerSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("plan")
        .eq("id", user.id)
        .single();

      if (profile?.plan === "pro") {
        const admin = createAdminClient();
        const { data: usedToday, error: usageError } = await admin.rpc(
          "increment_job_search_usage",
          { p_user_id: user.id }
        );
        if (!usageError && typeof usedToday === "number") {
          quota = {
            used: usedToday,
            limit: DAILY_SEARCH_LIMIT,
            remaining: Math.max(0, DAILY_SEARCH_LIMIT - usedToday),
          };
          skipPaidSources = usedToday > DAILY_SEARCH_LIMIT;
        } else {
          // supabase/job-search-rate-limit.sql hasn't been run yet (or some
          // other RPC failure) — fail open on the LIMIT (don't block a real
          // Pro user over a missing migration), but we still can't show a
          // quota, and there's no enforcement happening either way.
          skipPaidSources = false;
        }
      }
    }
  } catch {
    // Supabase not configured, or the lookup failed for some other reason —
    // leave skipPaidSources at its default `true`. Never block the request
    // entirely over this; the curated + free-board sources still return.
  }

  let realJobs: Job[] = [];

  // When the user picked a specific location, only query Jooble for that
  // one instead of all nine — faster, and the results are more targeted
  // than fetching everything and post-filtering.
  const joobleLocations = locationFilter
    ? LOCATIONS.filter((l) => l === locationFilter)
    : LOCATIONS;

  const joobleKey = process.env.JOOBLE_API_KEY;
  if (joobleKey && !skipPaidSources) {
    try {
      const results = await Promise.all(
        joobleLocations.map((loc) => fetchJoobleJobs(joobleKey, qRaw, loc))
      );
      realJobs = realJobs.concat(results.flat());
    } catch {
      // ignore — fall through to other sources
    }
  }

  const careerjetApiKey = process.env.CAREERJET_API_KEY;
  if (careerjetApiKey && !skipPaidSources) {
    // Country name -> Careerjet locale code, so the same locationFilter used
    // for Jooble/curated filtering also narrows which Careerjet locales get
    // queried.
    const COUNTRY_TO_CAREERJET_LOCALE: Record<string, string> = {
      "United Arab Emirates": "en_AE",
      "Saudi Arabia": "en_SA",
      Kuwait: "en_KW",
      Oman: "en_OM",
      Qatar: "en_QA",
    };
    const careerjetLocales = locationFilter
      ? [COUNTRY_TO_CAREERJET_LOCALE[locationFilter]].filter(Boolean)
      : CAREERJET_LOCALES;
    try {
      const results = await Promise.all(
        careerjetLocales.map((locale) => fetchCareerjetJobs(careerjetApiKey, qRaw, locale))
      );
      realJobs = realJobs.concat(results.flat());
    } catch {
      // ignore — fall through to other sources
    }
  }

  const serpApiKey = process.env.SERPAPI_KEY;
  if (serpApiKey && !skipPaidSources) {
    // Same locationFilter-narrowing logic as Jooble above: if the user picked
    // one country, only spend one SerpApi call on it instead of nine.
    const serpApiLocations = locationFilter ? [locationFilter] : LOCATIONS;
    try {
      const results = await Promise.all(
        serpApiLocations.map((loc) => fetchSerpApiJobs(serpApiKey, qRaw, loc))
      );
      realJobs = realJobs.concat(results.flat());
    } catch {
      // ignore — fall through to other sources
    }
  }

  try {
    const [greenhouseResults, leverResults, ashbyResults, remoteOkResults] = await Promise.all([
      Promise.all(GREENHOUSE_BOARDS.map((b) => fetchGreenhouseJobs(b.slug, b.host))),
      Promise.all(LEVER_BOARDS.map((b) => fetchLeverJobs(b.slug, b.company))),
      Promise.all(ASHBY_BOARDS.map((b) => fetchAshbyJobs(b.slug, b.company))),
      fetchRemoteOkJobs(),
    ]);
    realJobs = realJobs.concat(
      greenhouseResults.flat(),
      leverResults.flat(),
      ashbyResults.flat(),
      remoteOkResults
    );
  } catch {
    // ignore — fall through to other sources
  }

  // Always blend in the curated Gulf/Levant fallback list alongside whatever
  // real listings came back, rather than replacing it — a handful of
  // unrelated Greenhouse results (generic global tech companies) shouldn't
  // silently push out every relevant curated listing.
  let jobs = [...realJobs, ...FALLBACK_JOBS];

  // De-dupe by apply URL (Jooble in particular can return the same posting
  // more than once across nearby locations, and a real listing could in
  // theory collide with a fallback one).
  const seen = new Set<string>();
  jobs = jobs.filter((j) => {
    if (seen.has(j.applyUrl)) return false;
    seen.add(j.applyUrl);
    return true;
  });

  if (q) {
    // Include location in the match, not just title/company — otherwise
    // typing a place name like "Lebanon" or "Beirut" returned zero results
    // even when Lebanon-based listings were present.
    jobs = jobs.filter(
      (j) =>
        j.title.toLowerCase().includes(q) ||
        j.company.toLowerCase().includes(q) ||
        j.location.toLowerCase().includes(q)
    );
  }

  if (locationFilter) {
    // Match against the country name loosely (job.location is usually
    // "City, Country" or "City, Country (Remote)") rather than requiring an
    // exact string match against the full location — and also check known
    // abbreviations (see LOCATION_ALIASES) since real listings frequently
    // use "UAE" instead of the full country name.
    const needles = [locationFilter.toLowerCase(), ...(LOCATION_ALIASES[locationFilter] ?? [])];
    jobs = jobs.filter((j) => {
      const loc = j.location.toLowerCase();
      return needles.some((n) => loc.includes(n));
    });
  }

  if (industryFilter) {
    jobs = jobs.filter((j) => j.industry === industryFilter);
  }

  if (workTypeFilter) {
    jobs = jobs.filter((j) => j.workType === workTypeFilter);
  }

  return NextResponse.json({
    // Raised from 60 now that real sources (Jooble pagination, more verified
    // ATS boards, Careerjet) can genuinely return enough volume to make a
    // higher cap meaningful — 60 was leaving real results on the table
    // whenever more than one source returned a healthy number of jobs.
    jobs: jobs.slice(0, 120),
    industries: INDUSTRY_KEYWORDS.map(([name]) => name).concat("Other"),
    locations: LOCATIONS,
    workTypes: ["remote", "hybrid", "onsite"] satisfies WorkType[],
    // Only set for a signed-in Pro user once supabase/job-search-rate-limit.sql
    // has been run — null otherwise (not signed in, not Pro, or the
    // migration hasn't been applied yet), which the client treats as "don't
    // show a quota indicator at all" rather than as "0 remaining".
    meta: quota,
  });
}
