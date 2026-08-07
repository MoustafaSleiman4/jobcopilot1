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
  FALLBACK_JOBS,
  fetchGreenhouseJobs,
  fetchLeverJobs,
  fetchAshbyJobs,
  fetchRemoteOkJobs,
} from "@/lib/jobSources";
import { getCachedJobs } from "@/lib/jobCache";

export const runtime = "nodejs";

// Job Search is an entirely Pro-gated page in the UI (see
// app/[locale]/dashboard/jobs/page.tsx), but this API route itself has no
// auth requirement — anyone who found the URL could otherwise call it
// directly. That used to matter for quota reasons (SerpApi's free tier is
// capped at 250 searches/month, shared across every user) but this route no
// longer calls SerpApi/Jooble/Careerjet at all — see lib/jobCache.ts. Those
// paid sources are only ever fetched by a single shared daily refresh
// (app/api/jobs/refresh-cache/route.ts); every real search here just reads
// the cached public.retrieved_jobs table, which costs nothing no matter how
// often it's called. DAILY_SEARCH_LIMIT is kept as a lightweight per-user
// usage indicator (the "N searches left today" UI) rather than a
// quota-protection measure now that reads are free.
const DAILY_SEARCH_LIMIT = 10;

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

  // Paid sources (Jooble/Careerjet/SerpApi) no longer get called here at
  // all — this reads the shared local cache instead (see lib/jobCache.ts),
  // which is populated once a day for everyone by
  // app/api/jobs/refresh-cache/route.ts. skipPaidSources still gates this
  // the same way it gated the old live calls: only a signed-in, under-quota
  // Pro user gets the cached paid-source listings blended in.
  if (!skipPaidSources) {
    try {
      const admin = createAdminClient();
      const cached = await getCachedJobs(admin);
      realJobs = realJobs.concat(cached);
    } catch {
      // supabase/job-cache.sql not migrated yet, or admin client not
      // configured — fall through to the always-free sources below.
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
    // Match every word in the query, not the exact phrase — searching
    // "project manager" used to require that literal substring, so a real
    // listing titled "Programme Manager" or "Senior Project Manager –
    // Applied AI" (word order/extra words) could silently fail to match
    // even though it's exactly the kind of role being searched for. Now
    // every word just has to appear somewhere across title/company/
    // location, in any order.
    const words = q.split(/\s+/).filter(Boolean);
    jobs = jobs.filter((j) => {
      const haystack = `${j.title} ${j.company} ${j.location}`.toLowerCase();
      return words.every((w) => haystack.includes(w));
    });
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
