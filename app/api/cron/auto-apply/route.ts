import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchFreeSourceJobs } from "@/lib/jobSources";
import { getCachedJobs } from "@/lib/jobCache";
import { runAutoApplyForUser, type AutoApplyPreferences } from "@/lib/autoApplyRun";

export const runtime = "nodejs";
// Cron runs can take a while once there are many opted-in users (one AI
// cover-letter call per queued match) — raise the default serverless
// timeout rather than risk a partial run getting killed mid-user.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  // Vercel Cron calls this on schedule (see vercel.json). CRON_SECRET
  // protects it from being triggered by anyone who finds the URL — set it in
  // Vercel's project env vars and Vercel automatically sends it as a Bearer
  // token on scheduled invocations. Fails open (same convention as every
  // other optional-migration/optional-secret check in this repo) if it
  // isn't set yet, rather than a cron feature silently 401ing forever with
  // no obvious cause.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const admin = createAdminClient();

  const { data: prefsRows, error: prefsError } = await admin
    .from("auto_apply_preferences")
    .select("user_id, enabled, daily_cap, keywords, location, work_type, excluded_companies, resume_id")
    .eq("enabled", true);

  if (prefsError) {
    return NextResponse.json({ error: prefsError.message }, { status: 500 });
  }

  const preferences = (prefsRows ?? []) as AutoApplyPreferences[];
  if (preferences.length === 0) {
    return NextResponse.json({ processed: 0, queued: 0 });
  }

  // Fetched once and reused across every user this run — the free sources
  // (Greenhouse/Lever/Ashby/RemoteOK + curated fallback) return the same
  // listings regardless of who's asking, so there's no reason to refetch
  // per user. Also blends in the shared local cache of Jooble/Careerjet/
  // SerpApi results (see lib/jobCache.ts) — safe to include now that
  // reading it costs nothing (it's just a DB read; the paid APIs
  // themselves are only ever called once a day by the shared refresh, not
  // by this cron), so Auto Apply now matches against real paid-source
  // listings too instead of only the always-free boards.
  const candidateJobs = [...(await fetchFreeSourceJobs()), ...(await getCachedJobs(admin))];

  let totalQueued = 0;

  for (const prefs of preferences) {
    try {
      const result = await runAutoApplyForUser(admin, prefs, candidateJobs);
      totalQueued += result.queued;
    } catch (err) {
      // One user's failure (bad resume shape, transient DB error) shouldn't
      // abort matching for every other opted-in user in this run.
      console.error(`[auto-apply-cron] failed for user ${prefs.user_id}:`, err);
    }
  }

  return NextResponse.json({ processed: preferences.length, queued: totalQueued });
}
