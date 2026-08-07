// Shared, self-hosted cache of the metered/paid job sources (Jooble,
// Careerjet, SerpApi) in public.retrieved_jobs.
//
// The whole point: SerpApi's free tier is capped at 250 searches/month
// TOTAL, shared across every user of this app. Previously, every single
// user search spent real quota (see app/api/jobs/search/route.ts's git
// history). Now, only refreshGlobalJobCacheIfStale() below ever calls those
// APIs — on a shared schedule, not per user-search — and every real search
// (and Auto Apply run) just reads whatever is currently cached. A user
// searching the cache costs nothing extra no matter how many times a day it
// happens.
//
// Trigger points for a refresh attempt (see app/api/jobs/refresh-cache/route.ts):
//  1. Client-side, once per dashboard session, right after a user logs in
//     (components/DashboardShell.tsx).
//  2. A daily Vercel Cron (vercel.json) as a backstop, so the cache still
//     refreshes even during a stretch with no logins at all.
// Either path is safe to call as often as you like — refreshGlobalJobCacheIfStale
// itself is a no-op unless the cache is actually older than
// JOB_CACHE_REFRESH_HOURS, so a burst of logins can't accidentally multiply
// API spend.

import type { SupabaseClient } from "@supabase/supabase-js";
import { type Job, type WorkType, LOCATIONS, LOCATION_ALIASES, isRegionLocation } from "@/lib/jobSources";
import { fetchJoobleJobsPage, fetchCareerjetJobs, fetchSerpApiJobs } from "@/lib/paidJobSources";

// How long a refresh stays "fresh" before the next trigger is allowed to
// spend real API quota again. This refresh makes AT MOST ONE call per
// source (Jooble/Careerjet/SerpApi) every time it actually runs — not one
// per location — so refreshing once a day is exactly 1 SerpApi
// call/day (≈30/month), nowhere close to the 250/month free-tier ceiling.
// Raise this via the JOB_CACHE_REFRESH_HOURS env var in Vercel if you want
// even more headroom.
const REFRESH_INTERVAL_HOURS = Number(process.env.JOB_CACHE_REFRESH_HOURS) || 24;

// Careerjet needs one of its 5 supported Gulf locale codes, not a country
// name — only used on the (roughly 5-in-9) days todaysLocation() lands on a
// country it actually covers; skipped entirely on the other days rather
// than falling back to a second call.
const COUNTRY_TO_CAREERJET_LOCALE: Record<string, string> = {
  "United Arab Emirates": "en_AE",
  "Saudi Arabia": "en_SA",
  Kuwait: "en_KW",
  Oman: "en_OM",
  Qatar: "en_QA",
};

// Rotates through one Gulf/Levant location per calendar day (UTC) instead
// of fanning out to all 9 on every refresh — that's what keeps this to
// exactly 1 API call per source per day. Full 9-location coverage still
// builds up over roughly a week+ as each day's results accumulate in
// retrieved_jobs (rows aren't overwritten, just added to / refreshed by
// apply_url — see the upsert below), and cycles back around every 9 days
// after that.
function todaysLocation(): string {
  const dayIndex = Math.floor(Date.now() / (24 * 60 * 60 * 1000)) % LOCATIONS.length;
  return LOCATIONS[dayIndex];
}

// Broad job categories used ONLY by the one-time bulk seed below (never by
// the daily refresh) — each source's free tier returns one page of results
// per (keyword × location) call, so a single blank-keyword call per
// location tops out in the low hundreds. Searching across a handful of
// real categories multiplies that without touching the daily habit at all.
const SEED_KEYWORDS = [
  "",
  "engineer",
  "marketing",
  "finance",
  "sales",
  "operations",
  "customer service",
  "hr",
  "design",
  // Added on request to deepen tech-role coverage specifically — these are
  // common enough job titles that they turn up meaningfully different
  // results than the generic "engineer"/blank searches above (a "software
  // developer" or "QA engineer" posting doesn't always surface under a bare
  // "engineer" query, and "project manager"/"scrum master" postings mostly
  // wouldn't show up under any of the categories above at all).
  "project manager",
  "scrum master",
  "qa",
  "developer",
  "software",
  // Added for a second seed pass — more specific multi-word tech titles
  // than the broad "engineer"/"developer"/"software" categories above.
  // Each of these is a distinct search query to Jooble/Careerjet, so it
  // returns a genuinely different results page (different ranking, often
  // different postings entirely) rather than just re-finding what the
  // broader terms already caught — that's why the first round of added
  // keywords only produced ~125 net-new rows out of 1,720 processed: most
  // of what "developer"/"software"/"qa" surfaced was already caught by
  // "engineer" or the blank/default search.
  "backend developer",
  "frontend developer",
  "full stack developer",
  "mobile developer",
  "ios developer",
  "android developer",
  "data engineer",
  "devops engineer",
  "machine learning engineer",
  "product owner",
  "business analyst",
  "technical project manager",
];

// Runs `fn` over `items` with at most `limit` in flight at once — plain
// job-board APIs on free tiers tend to rate-limit a burst of dozens of
// simultaneous requests, so the bulk seed below chunks its ~80 calls per
// source through this instead of firing them all via one Promise.all.
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// Note on TTL: each row's expires_at is set ONCE, by the column default in
// supabase/job-cache.sql (now() + 30 days), at the moment it's first
// inserted — see the upsert below, which deliberately omits expires_at so a
// job that keeps showing up in later daily refreshes does NOT get its
// 30-day clock reset. "Lives for 1 month from when it was first retrieved,
// then gets deleted" — not "1 month since last seen."

type JobRow = {
  id: string;
  title: string;
  company: string;
  location: string;
  apply_url: string;
  apply_type: string;
  industry: string;
  work_type: string;
};

function rowToJob(row: JobRow): Job {
  return {
    id: row.id,
    title: row.title,
    company: row.company,
    location: row.location,
    applyUrl: row.apply_url,
    applyType: row.apply_type === "one_click" ? "one_click" : "external",
    industry: row.industry || "Other",
    workType: (row.work_type === "remote" || row.work_type === "hybrid" ? row.work_type : "onsite") as WorkType,
  };
}

// Supabase/PostgREST caps a single request at 1000 rows by default
// regardless of what .limit() asks for, so a plain single-page select was
// silently truncating the cache well below its real size once it grew past
// 1000 (it hit ~2,510 active rows and only ever surfaced 1000, or fewer
// still once combined with other filtering upstream). Page through with
// .range() instead so every cached job — however many there are — actually
// reaches search/Auto Apply. PAGE_CAP is just a sane upper bound (50k rows)
// so a pathological/unbounded table can't turn one request into an infinite
// loop; the cache is nowhere near that today.
const CACHE_PAGE_SIZE = 1000;
const CACHE_PAGE_CAP = 50;

// Optional server-side pre-filters for getCachedJobs — `location` is a
// country name (matched the same loose way as the rest of the app: the
// country itself plus any LOCATION_ALIASES, e.g. "UAE" for "United Arab
// Emirates") rather than a raw SQL pattern, so callers pass the same values
// they'd pass to the app's own location dropdown.
type CachedJobFilters = { location?: string; industry?: string; workType?: WorkType };

/**
 * Reads ONLY the local cache — never touches Jooble/Careerjet/SerpApi. This
 * is what every real user search (and, since it's free to read, Auto Apply
 * too) should call instead of hitting those APIs directly.
 *
 * Filters are optional and additive to the always-applied expires_at check
 * — when given, they're pushed down into the query (backed by the
 * industry/work_type btree indexes and the location trigram index) instead
 * of always pulling the full cache and filtering it in JS. A filtered
 * search only transfers the rows that can actually match, which matters
 * more as the table keeps growing from the ongoing seed work. Callers that
 * want the whole pool (e.g. Auto Apply, which matches against a resume
 * rather than a location/industry pick) just omit the filters, same as
 * before.
 */
export async function getCachedJobs(admin: SupabaseClient, filters: CachedJobFilters = {}): Promise<Job[]> {
  const rows: JobRow[] = [];
  for (let page = 0; page < CACHE_PAGE_CAP; page++) {
    const from = page * CACHE_PAGE_SIZE;
    const to = from + CACHE_PAGE_SIZE - 1;
    let query = admin
      .from("retrieved_jobs")
      .select("id, title, company, location, apply_url, apply_type, industry, work_type")
      .gt("expires_at", new Date().toISOString());

    if (filters.industry) query = query.eq("industry", filters.industry);
    if (filters.workType) query = query.eq("work_type", filters.workType);
    if (filters.location) {
      const needles = [filters.location.toLowerCase(), ...(LOCATION_ALIASES[filters.location] ?? [])];
      // PostgREST .or() filter string — safe to build directly since every
      // needle here comes from LOCATIONS/LOCATION_ALIASES (fixed, known
      // strings), never straight from the request's raw query params.
      query = query.or(needles.map((n) => `location.ilike.%${n}%`).join(","));
    }

    const { data, error } = await query.range(from, to);

    if (error || !data) break;
    rows.push(...(data as JobRow[]));
    if (data.length < CACHE_PAGE_SIZE) break; // last page
  }
  return rows.map(rowToJob);
}

/**
 * The ONLY function in this app allowed to call Jooble/Careerjet/SerpApi.
 * No-ops (cheaply — one UPDATE statement) unless the shared cache is older
 * than REFRESH_INTERVAL_HOURS.
 *
 * Uses a conditional UPDATE on the public.job_cache_meta singleton row as a
 * lightweight claim/lock: only the caller whose UPDATE actually matches a
 * stale (or never-set) row proceeds to spend API quota, so many users
 * logging in around the same moment can't each trigger their own refresh.
 */
export async function refreshGlobalJobCacheIfStale(
  admin: SupabaseClient
): Promise<{ refreshed: boolean; stored?: number }> {
  const nowIso = new Date().toISOString();
  const staleBefore = new Date(Date.now() - REFRESH_INTERVAL_HOURS * 60 * 60 * 1000).toISOString();

  const { data: claimed, error: claimError } = await admin
    .from("job_cache_meta")
    .update({ last_refreshed_at: nowIso })
    .eq("id", true)
    .or(`last_refreshed_at.is.null,last_refreshed_at.lt.${staleBefore}`)
    .select("id");

  if (claimError || !claimed || claimed.length === 0) {
    // supabase/job-cache.sql hasn't been run yet, or (far more likely)
    // someone else already refreshed within the last REFRESH_INTERVAL_HOURS.
    // Either way: nothing to do, and definitely don't spend any quota.
    return { refreshed: false };
  }

  const joobleKey = process.env.JOOBLE_API_KEY;
  const careerjetApiKey = process.env.CAREERJET_API_KEY;
  const serpApiKey = process.env.SERPAPI_KEY;

  const jobs: Job[] = [];
  const location = todaysLocation();

  // Empty keywords ("") on purpose — this is the one *global* search this
  // whole app now does, rather than one specific user's query, so the
  // cache serves every possible future search instead of just the one that
  // happened to trigger it. Exactly ONE call per source below (not one per
  // location) — see todaysLocation().
  try {
    if (joobleKey) {
      // Single page, not the 2-page fetchJoobleJobs helper — 1 real call,
      // same "exactly one search" rule as the other two sources.
      const results = await fetchJoobleJobsPage(joobleKey, "", location, 1);
      jobs.push(...results);
    }
  } catch {
    // ignore — a partial refresh is still useful
  }

  try {
    if (careerjetApiKey) {
      const locale = COUNTRY_TO_CAREERJET_LOCALE[location];
      if (locale) {
        const results = await fetchCareerjetJobs(careerjetApiKey, "", locale);
        jobs.push(...results);
      }
      // No locale for today's location (Bahrain/Lebanon/Jordan/Egypt) —
      // skip Careerjet entirely today rather than calling it for a
      // different location than the other two sources.
    }
  } catch {
    // ignore
  }

  try {
    if (serpApiKey) {
      const result = await fetchSerpApiJobs(serpApiKey, "", location);
      jobs.push(...result.jobs);
    }
  } catch {
    // ignore
  }

  const stored = await storeJobs(admin, jobs);
  return { refreshed: true, stored };
}

// Shared by both refreshGlobalJobCacheIfStale (1 location/day) and
// seedGlobalJobCacheOnce (all locations, one-time) — dedupes by apply URL,
// upserts into retrieved_jobs, and self-prunes anything past its 30-day
// TTL. expires_at is intentionally never included in the upsert payload:
// new rows get it from the column default (now() + 30 days); existing rows
// (matched on apply_url) keep whatever they were first assigned, so the
// 1-month lifespan counts from first-seen, not last-seen.
async function storeJobs(admin: SupabaseClient, jobs: Job[]): Promise<number> {
  if (jobs.length === 0) return 0;

  const seen = new Set<string>();
  const rows = jobs
    .filter((j) => {
      if (!j.applyUrl || j.applyUrl === "#" || seen.has(j.applyUrl)) return false;
      // Gulf/Levant/Egypt-only, per the app's scope — a search made "in
      // Saudi Arabia" can still come back with a US-based listing Google
      // happened to index under that query, so this checks the job's own
      // returned location text rather than trusting the search parameter.
      if (!isRegionLocation(j.location)) return false;
      seen.add(j.applyUrl);
      return true;
    })
    .map((j) => ({
      source: j.id.split("-")[0] || "unknown",
      source_job_id: j.id,
      title: j.title,
      company: j.company,
      location: j.location,
      apply_url: j.applyUrl,
      apply_type: j.applyType,
      industry: j.industry,
      work_type: j.workType,
    }));

  await admin.from("retrieved_jobs").upsert(rows, { onConflict: "apply_url" });
  await admin.from("retrieved_jobs").delete().lt("expires_at", new Date().toISOString());

  return rows.length;
}

/**
 * A ONE-TIME bulk pull across every Gulf/Levant location × every category
 * in SEED_KEYWORDS (and every Careerjet locale), meant to seed
 * public.retrieved_jobs with real volume immediately instead of waiting
 * ~9 days for the 1-location/day rotation in refreshGlobalJobCacheIfStale()
 * to build up full coverage on its own.
 *
 * Unlike that function, this DOES fan out widely in one go: 9 locations x
 * 9 keyword categories = up to 81 SerpApi calls for page 1, plus up to
 * another 81 for page 2 on combos that have more results (~120-160 SerpApi
 * calls total in practice; same 81 for Jooble; Careerjet is 5 locales x 9
 * categories = up to 45). Safe to run once — well within a fresh
 * 250/month SerpApi key's budget — but this must never run
 * automatically or repeatedly: job_cache_meta.last_seeded_at gates it to
 * exactly once unless `force` is explicitly passed (e.g. re-seeding after
 * changing which sources are configured).
 */
type SeedSource = "jooble" | "careerjet" | "serpapi";
const ALL_SEED_SOURCES: SeedSource[] = ["jooble", "careerjet", "serpapi"];

export async function seedGlobalJobCacheOnce(
  admin: SupabaseClient,
  options: { force?: boolean; sources?: SeedSource[] } = {}
): Promise<{ seeded: boolean; stored?: number; bySource?: Record<string, number> }> {
  const nowIso = new Date().toISOString();
  // Lets a caller skip a specific source for this run — added so a second
  // seed pass can lean on Jooble/Careerjet (which had plenty of headroom
  // last time: 2,835 and unlimited-so-far raw results) without touching
  // SerpApi again, since SerpApi's 250/month free-tier quota is shared with
  // the daily refresh and a prior run may have already spent most of it.
  // Defaults to all three, same as before, when not specified.
  const sources = new Set(options.sources ?? ALL_SEED_SOURCES);

  if (!options.force) {
    const { data: claimed, error: claimError } = await admin
      .from("job_cache_meta")
      .update({ last_seeded_at: nowIso })
      .eq("id", true)
      .is("last_seeded_at", null)
      .select("id");

    if (claimError || !claimed || claimed.length === 0) {
      // Already seeded before (or the migration adding last_seeded_at
      // hasn't run yet) — refuse rather than silently re-spending a big
      // batch of API calls. Pass { force: true } to override deliberately.
      return { seeded: false };
    }
  } else {
    await admin.from("job_cache_meta").update({ last_seeded_at: nowIso }).eq("id", true);
  }

  const joobleKey = process.env.JOOBLE_API_KEY;
  const careerjetApiKey = process.env.CAREERJET_API_KEY;
  const serpApiKey = process.env.SERPAPI_KEY;

  const jobs: Job[] = [];
  // Concurrency capped at 8 in-flight requests per source — see
  // mapWithConcurrency's comment above for why (avoiding free-tier rate
  // limits on a burst of dozens of simultaneous calls).
  const CONCURRENCY = 8;

  try {
    if (joobleKey && sources.has("jooble")) {
      const combos = SEED_KEYWORDS.flatMap((kw) => LOCATIONS.map((loc) => ({ kw, loc })));
      const results = await mapWithConcurrency(combos, CONCURRENCY, ({ kw, loc }) =>
        fetchJoobleJobsPage(joobleKey, kw, loc, 1)
      );
      jobs.push(...results.flat());
    }
  } catch {
    // ignore — a partial seed is still useful
  }

  try {
    if (careerjetApiKey && sources.has("careerjet")) {
      const combos = SEED_KEYWORDS.flatMap((kw) => Object.values(COUNTRY_TO_CAREERJET_LOCALE).map((locale) => ({ kw, locale })));
      const results = await mapWithConcurrency(combos, CONCURRENCY, ({ kw, locale }) =>
        fetchCareerjetJobs(careerjetApiKey, kw, locale)
      );
      jobs.push(...results.flat());
    }
  } catch {
    // ignore
  }

  try {
    if (serpApiKey && sources.has("serpapi")) {
      // 2 pages per (keyword × location) combo here — deliberately, and
      // ONLY in this one-time seed (never the daily refresh) — roughly
      // doubles SerpApi's contribution since Google Jobs caps a single
      // page around ~10 results. next_page_token comes back from page 1;
      // if a combo has no further results, page 2 is just skipped.
      const combos = SEED_KEYWORDS.flatMap((kw) => LOCATIONS.map((loc) => ({ kw, loc })));
      const page1Results = await mapWithConcurrency(combos, CONCURRENCY, ({ kw, loc }) =>
        fetchSerpApiJobs(serpApiKey, kw, loc)
      );
      jobs.push(...page1Results.flatMap((r) => r.jobs));

      const page2Combos = combos
        .map((combo, i) => ({ ...combo, token: page1Results[i].nextPageToken }))
        .filter((c): c is typeof c & { token: string } => Boolean(c.token));
      const page2Results = await mapWithConcurrency(page2Combos, CONCURRENCY, ({ kw, loc, token }) =>
        fetchSerpApiJobs(serpApiKey, kw, loc, token)
      );
      jobs.push(...page2Results.flatMap((r) => r.jobs));
    }
  } catch {
    // ignore
  }

  // Per-source tally BEFORE dedup, so the JSON response is a useful
  // diagnostic (e.g. "careerjet: 0" immediately points at a missing/broken
  // CAREERJET_API_KEY) without needing a separate DB query to check.
  const bySource: Record<string, number> = {};
  for (const j of jobs) {
    const src = j.id.split("-")[0] || "unknown";
    bySource[src] = (bySource[src] ?? 0) + 1;
  }

  const stored = await storeJobs(admin, jobs);

  // Also stamp last_refreshed_at so the daily 1-location rotation doesn't
  // immediately consider itself stale and fire again right after this.
  await admin.from("job_cache_meta").update({ last_refreshed_at: nowIso }).eq("id", true);

  return { seeded: true, stored, bySource };
}
