import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// A signed-in user's report that a cached job listing is dead (closed/no
// longer available) — see supabase/expired-job-reporting.sql for why this
// exists instead of trying to detect it automatically. Called from both Job
// Search (app/[locale]/dashboard/jobs/page.tsx) and the Auto Apply queue
// (app/[locale]/dashboard/auto-apply/page.tsx), which is why this lives as
// its own small route rather than folding into either page's existing API.
//
// Only ever acts on public.retrieved_jobs — the shared cache of
// Jooble/Careerjet/SerpApi listings, the one source with a real staleness
// window (30 days by default; see lib/jobCache.ts). Greenhouse/Lever/Ashby/
// RemoteOK and employer-posted jobs are fetched fresh on every request, so a
// closed posting there simply stops appearing on its own with nothing to
// clean up — a `jobId` from one of those sources just won't match any row
// here, and this quietly no-ops (still returns 200) rather than treating
// "nothing to remove" as an error.
//
// One real signed-in report is enough to remove it immediately
// (EXPIRED_REPORT_THRESHOLD below) — this app's traffic is still small
// enough that requiring several independent reports before acting would
// mean a dead listing realistically never gets removed by anyone. Kept as a
// named constant specifically so it's a one-line change to raise later once
// there's enough real traffic that a single click is more likely to be a
// mistake than a genuine dead link.
const EXPIRED_REPORT_THRESHOLD = 1;

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { jobId } = (await request.json().catch(() => ({}))) as { jobId?: string };
  if (!jobId) {
    return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: updated, error: updateError } = await admin
    .from("retrieved_jobs")
    .update({ expired_report_count: 1, expired_reported_at: new Date().toISOString() })
    .eq("id", jobId)
    .select("id, expired_report_count")
    .maybeSingle();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // No matching row — either it's already been removed by an earlier
  // report, or `jobId` belongs to one of the live-fetched sources that were
  // never cached in the first place (see the comment above). Either way,
  // there's nothing to remove server-side; the client already hides the
  // card locally regardless of this response.
  if (!updated) {
    return NextResponse.json({ removed: false });
  }

  // Note: the update above unconditionally sets the count to 1 rather than
  // incrementing (Supabase's query builder has no atomic increment without
  // a Postgres function) — fine at EXPIRED_REPORT_THRESHOLD=1, since any
  // report at all already meets it. Raising the threshold later means
  // switching this to a real RPC increment first.
  if ((updated.expired_report_count ?? 0) >= EXPIRED_REPORT_THRESHOLD) {
    await admin.from("retrieved_jobs").delete().eq("id", jobId);
    return NextResponse.json({ removed: true });
  }

  return NextResponse.json({ removed: false });
}
