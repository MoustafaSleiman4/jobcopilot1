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
import { type Job, type WorkType, LOCATIONS } from "@/lib/jobSources";
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

/**
 * Reads ONLY the local cache — never touches Jooble/Careerjet/SerpApi. This
 * is what every real user search (and, since it's free to read, Auto Apply
 * too) should call instead of hitting those APIs directly.
 */
export async function getCachedJobs(admin: SupabaseClient): Promise<Job[]> {
  const { data, error } = await admin
    .from("retrieved_jobs")
    .select("id, title, company, location, apply_url, apply_type, industry, work_type")
    .gt("expires_at", new Date().toISOString())
    .limit(1000);

  if (error || !data) return [];
  return (data as JobRow[]).map(rowToJob);
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
      const results = await fetchSerpApiJobs(serpApiKey, "", location);
      jobs.push(...results);
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
 * A ONE-TIME bulk pull across every Gulf/Levant location (and every
 * Careerjet locale), meant to seed public.retrieved_jobs with real volume
 * immediately instead of waiting ~9 days for the 1-location/day rotation in
 * refreshGlobalJobCacheIfStale() to build up full coverage on its own.
 *
 * Unlike that function, this DOES fan out to all 9 locations in one go —
 * that's 9 SerpApi calls, not 1. Safe to run once (a fresh 250/month
 * SerpApi key barely notices 9 calls), but this must never run
 * automatically or repeatedly: job_cache_meta.last_seeded_at gates it to
 * exactly once unless `force` is explicitly passed (e.g. re-seeding after
 * changing which sources are configured).
 */
export async function seedGlobalJobCacheOnce(
  admin: SupabaseClient,
  options: { force?: boolean } = {}
): Promise<{ seeded: boolean; stored?: number }> {
  const nowIso = new Date().toISOString();

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

  try {
    if (joobleKey) {
      const results = await Promise.all(LOCATIONS.map((loc) => fetchJoobleJobsPage(joobleKey, "", loc, 1)));
      jobs.push(...results.flat());
    }
  } catch {
    // ignore — a partial seed is still useful
  }

  try {
    if (careerjetApiKey) {
      const results = await Promise.all(
        Object.values(COUNTRY_TO_CAREERJET_LOCALE).map((locale) => fetchCareerjetJobs(careerjetApiKey, "", locale))
      );
      jobs.push(...results.flat());
    }
  } catch {
    // ignore
  }

  try {
    if (serpApiKey) {
      const results = await Promise.all(LOCATIONS.map((loc) => fetchSerpApiJobs(serpApiKey, "", loc)));
      jobs.push(...results.flat());
    }
  } catch {
    // ignore
  }

  const stored = await storeJobs(admin, jobs);

  // Also stamp last_refreshed_at so the daily 1-location rotation doesn't
  // immediately consider itself stale and fire again right after this.
  await admin.from("job_cache_meta").update({ last_refreshed_at: nowIso }).eq("id", true);

  return { seeded: true, stored };
}
