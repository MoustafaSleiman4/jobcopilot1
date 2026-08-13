import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchFreeSourceJobs, dedupeJobs } from "@/lib/jobSources";
import { getCachedJobs } from "@/lib/jobCache";
import { getActiveCompanyJobs } from "@/lib/companyJobs";
import { runAutoApplyForUser, RUN_NOW_COOLDOWN_MS, type AutoApplyPreferences } from "@/lib/autoApplyRun";

export const runtime = "nodejs";
// A single user's on-demand run is much cheaper than the cron's
// every-opted-in-user sweep, but still does real fetches + up to
// daily_cap cover-letter generations, so give it more than the platform
// default rather than risk it getting killed mid-request.
export const maxDuration = 60;

/**
 * Lets a Pro user trigger their own Auto Apply matching immediately —
 * "why wait for the overnight cron?" — instead of only ever running on the
 * fixed daily schedule in vercel.json. Rate-limited to once per
 * RUN_NOW_COOLDOWN_MS (24h) per user via `last_run_at` on
 * auto_apply_preferences, which the cron also stamps, so the cooldown holds
 * regardless of whether the *previous* run came from the cron or from this
 * route. Without that shared cooldown, a user could mash this button to
 * repeatedly hit the free job-board APIs far more than the daily cron ever
 * would.
 */
export async function POST() {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: profile } = await supabase.from("profiles").select("plan").eq("id", user.id).single();
  if (profile?.plan !== "pro") {
    return NextResponse.json({ error: "Auto Apply is a Pro feature" }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data: prefsRow, error: prefsError } = await admin
    .from("auto_apply_preferences")
    .select("user_id, enabled, daily_cap, keywords, location, work_type, excluded_companies, resume_id, last_run_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (prefsError) {
    return NextResponse.json({ error: prefsError.message }, { status: 500 });
  }
  if (!prefsRow) {
    return NextResponse.json({ error: "Save your Auto Apply settings first" }, { status: 400 });
  }
  if (!prefsRow.enabled) {
    return NextResponse.json({ error: "Turn Auto Apply on first" }, { status: 400 });
  }

  const lastRunAtMs = prefsRow.last_run_at ? new Date(prefsRow.last_run_at as string).getTime() : null;
  const now = Date.now();
  if (lastRunAtMs && now - lastRunAtMs < RUN_NOW_COOLDOWN_MS) {
    return NextResponse.json(
      { error: "cooldown", nextRunAt: new Date(lastRunAtMs + RUN_NOW_COOLDOWN_MS).toISOString() },
      { status: 429 }
    );
  }

  // Same shared local cache Auto Apply's cron uses now (see lib/jobCache.ts)
  // — costs nothing to read, so this on-demand run gets the same
  // paid-source coverage as the overnight cron, not just the free boards.
  // Also blends in free employer-posted jobs (see the "For Employers"
  // portal) — an opted-in candidate should be matched against those too,
  // not just third-party board listings.
  // De-duped the same way Job Search dedupes (see dedupeJobs' comment in
  // lib/jobSources.ts) — without this, the same real posting cached under
  // two different tracking URLs (see that comment) could get queued and
  // sent a cover letter for TWICE in one run, for what's actually one job.
  const candidateJobs = dedupeJobs([
    ...(await fetchFreeSourceJobs()),
    ...(await getCachedJobs(admin)),
    ...(await getActiveCompanyJobs(admin)),
  ]);
  const result = await runAutoApplyForUser(admin, prefsRow as AutoApplyPreferences, candidateJobs);

  return NextResponse.json({
    queued: result.queued,
    reason: result.reason,
    nextRunAt: new Date(now + RUN_NOW_COOLDOWN_MS).toISOString(),
  });
}
