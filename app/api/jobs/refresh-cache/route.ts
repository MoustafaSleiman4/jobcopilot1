import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { refreshGlobalJobCacheIfStale } from "@/lib/jobCache";

export const runtime = "nodejs";
// A refresh that actually has to call Jooble/Careerjet/SerpApi (only
// happens once the shared cache is stale) can take a moment across 9
// locations x up to 3 sources — give it more than the platform default.
export const maxDuration = 60;

// Two callers hit this route:
//  1. A logged-in user's dashboard, once per session, right after they log
//     in (see components/DashboardShell.tsx) — authenticated via their own
//     Supabase session cookie.
//  2. Vercel Cron, once a day (see vercel.json), as a backstop so the
//     shared job cache still refreshes even during a stretch with nobody
//     logging in — authenticated via CRON_SECRET (same convention as
//     app/api/cron/auto-apply/route.ts).
//
// Both paths are cheap and safe to call as often as you like:
// refreshGlobalJobCacheIfStale() is a no-op unless the shared cache is
// actually older than JOB_CACHE_REFRESH_HOURS (default 24h), so a burst of
// logins can never multiply how much SerpApi/Jooble/Careerjet quota gets
// spent — at most one real refresh happens per interval, system-wide,
// regardless of how many users trigger this route.
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCron) {
    try {
      const supabase = await createServerSupabaseClient();
      const { data } = await supabase.auth.getUser();
      if (!data?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const admin = createAdminClient();
    const result = await refreshGlobalJobCacheIfStale(admin);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Refresh failed" },
      { status: 500 }
    );
  }
}
