import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { seedGlobalJobCacheOnce } from "@/lib/jobCache";

export const runtime = "nodejs";
// Fans out to all 9 locations across up to 3 sources in parallel — give it
// real headroom rather than risk it getting killed mid-seed.
export const maxDuration = 120;

// Manual, ONE-TIME bulk pull to seed public.retrieved_jobs with real volume
// right away, instead of waiting for the 1-location/day rotation in
// app/api/jobs/refresh-cache/route.ts to build up full coverage on its own
// over about 9 days. Visit this URL once while logged in
// (https://gulfjobcopilot.com/api/jobs/seed-cache) — it fans out to every
// Gulf/Levant location in one go (9 SerpApi calls, not 1), which a fresh
// 250/month key can easily absorb ONCE, but seedGlobalJobCacheOnce() refuses
// to run a second time on its own (job_cache_meta.last_seeded_at gates it)
// so this can't accidentally get triggered repeatedly and burn quota. Pass
// ?force=1 if you deliberately want to re-seed later (e.g. after adding a
// new source's API key).
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

  const force = request.nextUrl.searchParams.get("force") === "1";
  // Optional ?sources=jooble,careerjet lets a specific run skip a source —
  // e.g. skip serpapi when its 250/month free-tier quota may already be
  // spent from an earlier run this month, while still refreshing from
  // Jooble/Careerjet. Omit entirely for the normal "use everything
  // configured" behavior.
  const sourcesParam = request.nextUrl.searchParams.get("sources");
  const sources = sourcesParam
    ? (sourcesParam.split(",").map((s) => s.trim().toLowerCase()) as ("jooble" | "careerjet" | "serpapi")[])
    : undefined;

  try {
    const admin = createAdminClient();
    const result = await seedGlobalJobCacheOnce(admin, { force, sources });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Seed failed" },
      { status: 500 }
    );
  }
}
