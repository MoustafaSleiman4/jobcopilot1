import { createAdminClient } from "@/lib/supabase/admin";

// Real, lightweight counts for the homepage's hero stat counters
// (components/StatCounters.tsx) — three cheap `head: true` count queries
// against tables that already exist for other features, not new tracking.
// Uses the service-role admin client (same as app/api/jobs/showcase/route.ts)
// because `retrieved_jobs` has RLS enabled with zero policies, so the
// anon/cookie-based server client would always read back zero rows here —
// and because an anonymous homepage visitor has no session for the
// cookie-based client to scope `applications`/`profiles` counts to anyway;
// the whole point of these three numbers is a site-wide total, not "this
// visitor's own rows". Read-only SELECT ... count queries only — nothing
// here writes, and nothing here touches billing/auth.
export type HomeStats = {
  jobsTracked: number;
  applicationsSent: number;
  members: number;
};

export async function getHomeStats(): Promise<HomeStats | null> {
  try {
    const admin = createAdminClient();
    const nowIso = new Date().toISOString();

    const [jobsRes, applicationsRes, membersRes] = await Promise.all([
      // Same "still-fresh" filter the showcase route uses for its own total.
      admin.from("retrieved_jobs").select("id", { count: "exact", head: true }).gt("expires_at", nowIso),
      // "Sent" means an application that actually left the tracker's
      // "saved" stage — applied_at is only ever stamped once a user marks a
      // tracked job as applied/interview/offer/rejected, so this never
      // counts a job someone merely bookmarked.
      admin.from("applications").select("id", { count: "exact", head: true }).not("applied_at", "is", null),
      admin.from("profiles").select("id", { count: "exact", head: true }),
    ]);

    const jobsTracked = jobsRes.count ?? 0;
    const applicationsSent = applicationsRes.count ?? 0;
    const members = membersRes.count ?? 0;

    // All three queries failing/erroring (e.g. the service-role key isn't
    // configured in this environment) is the one case worth falling back
    // from — a partial zero from one table while the others are genuinely
    // zero is still real data, not a failure, so it's shown as-is rather
    // than silently replaced with made-up copy.
    if (jobsRes.error && applicationsRes.error && membersRes.error) {
      return null;
    }

    return { jobsTracked, applicationsSent, members };
  } catch {
    // Supabase/service-role not configured in this environment — the caller
    // falls back to clearly-labeled approximate copy instead of a counter.
    return null;
  }
}
