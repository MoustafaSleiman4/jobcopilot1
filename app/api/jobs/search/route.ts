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
import { getActiveCompanyJobs } from "@/lib/companyJobs";
import { scoreJob } from "@/lib/autoApplyRun";
import type { StructuredResume } from "@/lib/resume-types";

export const runtime = "nodejs";

// Extends the shared Job shape with an optional match score (0-100), added
// below for a signed-in user with a usable resume — reuses the exact same
// deterministic scoreJob() heuristic Auto Apply already uses, so a job that
// shows "75% match" here and in the Auto Apply queue means the same thing in
// both places. Left undefined (not 0) for anyone without a resume on file,
// so the client can tell "no signal" apart from "scored zero".
type JobWithScore = Job & { matchScore?: number };

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

// Real pagination instead of a hard 120-result cap — the client requests
// PAGE_SIZE at a time via `offset`, with a "Load more" button appending the
// next page, and `total` (the full filtered count, not just what's on this
// page) tells the client the real number to show and when to stop offering
// more.
const PAGE_SIZE = 24;

export async function GET(request: NextRequest) {
  const qRaw = request.nextUrl.searchParams.get("q") ?? "";
  const q = qRaw.toLowerCase().trim();
  // Off by default (see the any-word OR matching below, which is what most
  // people typing a few role titles at once actually want) — but some
  // searches genuinely need the literal phrase ("site reliability engineer"
  // as one exact string, not any job matching "site" OR "reliability" OR
  // "engineer"), so a checkbox in the UI can opt into it per-search via
  // ?exact=1.
  const exactPhrase = request.nextUrl.searchParams.get("exact") === "1";
  const locationFilter = request.nextUrl.searchParams.get("location") ?? "";
  const industryFilter = request.nextUrl.searchParams.get("industry") ?? "";
  const workTypeParam = request.nextUrl.searchParams.get("workType") ?? "";
  const workTypeFilter: WorkType | "" =
    workTypeParam === "remote" || workTypeParam === "hybrid" || workTypeParam === "onsite"
      ? workTypeParam
      : "";
  const offsetRaw = Number(request.nextUrl.searchParams.get("offset") ?? "0");
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0;

  // --- Auth + daily quota (see DAILY_SEARCH_LIMIT above) ---
  // `quota` is only populated for a signed-in Pro user with the migration
  // applied — it's what the client shows as "N searches left today". It's
  // purely an informational counter now (see the note by getCachedJobs()
  // below) — it no longer gates which jobs come back, for anyone.
  let quota: { used: number; limit: number; remaining: number } | null = null;
  // Job Search is no longer a whole-page Pro gate (see app/[locale]/
  // dashboard/jobs/page.tsx) — free/logged-out visitors can browse results
  // now too, just without the company location or the real apply link (see
  // the masking below), and with Apply disabled client-side. `isPro` is
  // what decides that masking, checked server-side so a free user can't get
  // the real location/applyUrl just by inspecting/editing client state.
  let isPro = false;
  // Populated for any signed-in user with a usable resume on file — used
  // below to attach a per-job matchScore, the same scoreJob() heuristic
  // Auto Apply already uses. Not gated to Pro; a free user's resume still
  // scores against the (masked) results they can see.
  let structuredResume: StructuredResume | null = null;
  try {
    const supabase = await createServerSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;

    if (user) {
      // RLS-scoped to the signed-in user's own resumes (this uses the
      // request-bound server client, not the admin client) — same
      // primary-first, most-recently-updated ordering as the Job Search
      // page's own client-side resume lookup, so the score shown here
      // matches whichever resume the page itself would use for cover
      // letters.
      const { data: resumeRow } = await supabase
        .from("resumes")
        .select("content")
        .eq("user_id", user.id)
        .order("is_primary", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      structuredResume =
        (resumeRow?.content as { structured?: StructuredResume } | null)?.structured ?? null;

      const { data: profile } = await supabase
        .from("profiles")
        .select("plan")
        .eq("id", user.id)
        .single();

      if (profile?.plan === "pro") {
        isPro = true;
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
        }
        // supabase/job-search-rate-limit.sql hasn't been run yet (or some
        // other RPC failure)? We still just can't show a quota — there's no
        // enforcement happening either way, and it never blocked results.
      }
    }
  } catch {
    // Supabase not configured, or the lookup failed for some other reason —
    // never block the request entirely over this; the cached + free-board +
    // curated sources below still return regardless of auth state.
  }

  let realJobs: Job[] = [];

  // Reads the shared local cache (public.retrieved_jobs), populated once a
  // day for everyone by app/api/jobs/refresh-cache/route.ts plus the
  // one-time/forced bulk seed — this is a plain DB read with no live
  // Jooble/Careerjet/SerpApi call attached, so it costs nothing no matter
  // how often or by whom it's called. Every visitor gets the full result
  // pool from it, Pro or free/logged-out alike; only the location/applyUrl
  // fields get stripped for non-Pro further down, never the set of jobs
  // itself. (This used to be gated to Pro-only, which was silently limiting
  // free/logged-out users to just the ~15 Greenhouse/Lever/Ashby boards
  // plus the curated fallback list — a couple hundred jobs instead of the
  // full cached pool.)
  try {
    const admin = createAdminClient();
    // Push the location/industry/workType filters down to the query itself
    // (see getCachedJobs' comment) rather than always pulling the whole
    // cache — a filtered search only transfers the rows that can actually
    // match. The `q` text search still has to happen in JS below (it scores
    // relevance across title/company/location together, which isn't a
    // simple column filter), so this only trims what's read for the filters
    // that already ARE plain column matches.
    const cached = await getCachedJobs(admin, {
      location: locationFilter || undefined,
      industry: industryFilter || undefined,
      workType: workTypeFilter || undefined,
    });
    realJobs = realJobs.concat(cached);
  } catch {
    // supabase/job-cache.sql not migrated yet, or admin client not
    // configured — fall through to the always-free sources below.
  }

  try {
    // Free employer-posted jobs (see the new "For Employers" portal) —
    // always included alongside every other source, Pro or free/logged-out
    // alike, same as the rest of realJobs below.
    const admin = createAdminClient();
    realJobs = realJobs.concat(await getActiveCompanyJobs(admin));
  } catch {
    // supabase/employer-companies.sql not migrated yet, or admin client not
    // configured — fall through; every other source below still returns.
  }

  try {
    const [greenhouseResults, leverResults, ashbyResults, remoteOkResults] = await Promise.all([
      Promise.all(GREENHOUSE_BOARDS.map((b) => fetchGreenhouseJobs(b.slug, b.host, b.company))),
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

  if (q && exactPhrase) {
    // "Exact phrase" checkbox, checked: the whole query has to appear
    // verbatim (case-insensitive) in the job's title/company/location, same
    // as putting it in quotes on most job boards — no relevance ranking
    // needed since it's a plain include/exclude match.
    jobs = jobs.filter((j) => `${j.title} ${j.company} ${j.location}`.toLowerCase().includes(q));
  } else if (q) {
    // Default (unchecked): match ANY of the entered words, not every one of
    // them and not the exact phrase — searching "developer software engineer
    // project manager" used to require ALL five words present somewhere,
    // which almost nothing matches; someone typing several role titles into
    // one box means "show me jobs for any of these", not "show me the one
    // job whose text happens to contain every word". A job matching more of
    // the words is still more relevant than one matching just one, so
    // results are ranked by match count (most matched words first) rather
    // than left in whatever order the underlying sources returned.
    const words = q.split(/\s+/).filter(Boolean);
    jobs = jobs
      .map((j) => {
        const haystack = `${j.title} ${j.company} ${j.location}`.toLowerCase();
        const matchCount = words.reduce((n, w) => (haystack.includes(w) ? n + 1 : n), 0);
        return { job: j, matchCount };
      })
      .filter((x) => x.matchCount > 0)
      .sort((a, b) => b.matchCount - a.matchCount)
      .map((x) => x.job);
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

  // Attach a match score per job when we have a usable resume — cheap, pure
  // keyword-overlap scoring (see scoreJob in lib/autoApplyRun.ts), same
  // function Auto Apply uses, so the "%match" shown here means the same
  // thing as the one shown in the Auto Apply queue.
  const scoredJobs: JobWithScore[] = structuredResume
    ? jobs.map((j) => ({ ...j, matchScore: scoreJob(j, structuredResume as StructuredResume) }))
    : jobs;

  // Free/logged-out visitors can browse full results now (title, company,
  // industry, work type, match score) but not the company location or the
  // real outbound apply link — stripped server-side (not just hidden in the
  // UI) so there's nothing to recover by inspecting the response. Filtering
  // by location above still used the real value, so "browse by country"
  // still works for everyone; this only blanks what's shown per-job.
  const responseJobs = isPro ? scoredJobs : scoredJobs.map((j) => ({ ...j, location: "", applyUrl: "" }));

  return NextResponse.json({
    // One page of PAGE_SIZE results starting at `offset` — the client keeps
    // requesting the next offset (via "Load more") and appending, rather
    // than everything coming back in one giant response.
    jobs: responseJobs.slice(offset, offset + PAGE_SIZE),
    // The real total after every filter, not just this page's length — this
    // is what the "N jobs found" count and "more available" logic use.
    total: responseJobs.length,
    offset,
    pageSize: PAGE_SIZE,
    isPro,
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
