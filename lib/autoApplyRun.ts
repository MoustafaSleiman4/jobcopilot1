import type { SupabaseClient } from "@supabase/supabase-js";
import { LOCATION_ALIASES, type Job } from "@/lib/jobSources";
import { generateCoverLetter } from "@/lib/coverLetter";
import type { StructuredResume } from "@/lib/resume-types";

// Shared by app/api/cron/auto-apply/route.ts (the scheduled daily run, across
// every opted-in user) and app/api/auto-apply/run-now/route.ts (a single
// user's on-demand trigger) — pure extraction of the per-user matching logic
// so both call sites stay in sync instead of drifting apart.

// Hard ceiling per user per run, independent of their configured daily_cap
// (which only goes up to 20 per the DB check constraint) — a second safety
// net against one misconfigured or malicious `daily_cap` write turning into
// a runaway AI-spend loop.
export const MAX_MATCHES_PER_USER_PER_RUN = 20;

// How long a user has to wait between on-demand "Run now" triggers. Doesn't
// affect the scheduled cron, which always runs daily regardless — this only
// rate-limits the manual button, so a user (or a script hitting the route
// directly) can't hammer the free job sources by re-triggering repeatedly.
export const RUN_NOW_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export type AutoApplyPreferences = {
  user_id: string;
  enabled: boolean;
  daily_cap: number;
  keywords: string;
  location: string;
  work_type: "remote" | "hybrid" | "onsite" | null;
  excluded_companies: string[];
};

type ResumeRow = { content: { structured?: StructuredResume } | null };

/**
 * Lightweight, free, deterministic match score (0-100) — NOT an AI call.
 * Calling the AI once per candidate job per user, every run, across every
 * opted-in user would be slow and expensive at any real scale; this keyword
 * overlap heuristic is cheap enough to run against hundreds of jobs per user
 * per run, and only the jobs that actually get queued (top N) pay for a real
 * AI cover-letter call.
 */
export function scoreJob(job: Job, resume: StructuredResume): number {
  const resumeWords = new Set(
    [
      resume.title,
      ...(resume.skills ?? []),
      ...(resume.experience ?? []).flatMap((e) => [e.role, e.company]),
    ]
      .join(" ")
      .toLowerCase()
      .split(/[^a-z0-9+#.]+/)
      .filter((w) => w.length > 2)
  );
  if (resumeWords.size === 0) return 50; // no resume signal — neutral score, don't zero everything out

  const jobWords = `${job.title} ${job.industry}`
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .filter((w) => w.length > 2);
  if (jobWords.length === 0) return 0;

  let hits = 0;
  for (const w of jobWords) {
    if (resumeWords.has(w)) hits += 1;
  }
  // Title-word overlap ratio, scaled to 0-100. A resume titled "Senior
  // Product Manager" scores highest against job titles that share those
  // words, without needing an AI call to tell us that.
  return Math.round((hits / jobWords.length) * 100);
}

export function matchesPreferences(job: Job, prefs: AutoApplyPreferences): boolean {
  if (prefs.excluded_companies?.some((c) => job.company.toLowerCase() === c.toLowerCase())) return false;
  if (prefs.work_type && job.workType !== prefs.work_type) return false;
  if (prefs.location) {
    const needles = [prefs.location.toLowerCase(), ...(LOCATION_ALIASES[prefs.location] ?? [])];
    const loc = job.location.toLowerCase();
    if (!needles.some((n) => loc.includes(n))) return false;
  }
  if (prefs.keywords.trim()) {
    const kw = prefs.keywords.toLowerCase();
    const hay = `${job.title} ${job.company}`.toLowerCase();
    // Loose OR match across comma/space-separated keywords — same
    // permissiveness as a free-text search box, not a strict AND filter
    // that could silently return zero matches most days.
    const terms = kw.split(/[,\s]+/).filter(Boolean);
    if (terms.length > 0 && !terms.some((term) => hay.includes(term))) return false;
  }
  return true;
}

// Surfaced to the user (via the on-demand run-now response) whenever a run
// finds zero matches, so "Auto Apply found nothing" doesn't read as a broken
// search when it's actually one of a few specific, fixable reasons. Keep
// this list in sync with the early-return points below.
export type AutoApplyRunReason = "no_resume" | "daily_cap_reached" | "no_matches";

export type AutoApplyRunResult = { queued: number; reason?: AutoApplyRunReason };

/**
 * Matches + queues jobs for a single user and returns how many were queued
 * (plus, when zero, why — see AutoApplyRunReason). Called once per opted-in
 * user by the daily cron (with candidateJobs fetched once and shared across
 * every user that run), and once for a single user by the on-demand "Run
 * now" route. Safe to call more than once per day for the same user —
 * `daily_cap` is enforced by counting today's already-queued rows,
 * regardless of which caller queued them, so a manual run-now after the
 * cron already ran just tops up any remaining headroom instead of
 * double-queueing.
 */
export async function runAutoApplyForUser(
  admin: SupabaseClient,
  prefs: AutoApplyPreferences,
  candidateJobs: Job[]
): Promise<AutoApplyRunResult> {
  // Record that a run happened for this user right away — this is what
  // drives the "next check in Xh" countdown on the Auto Apply page and
  // rate-limits the on-demand trigger. Set unconditionally, even if this
  // run ends up finding zero matches or the daily cap is already spent,
  // since the countdown represents "when will we look again," not "when did
  // we last find something."
  await admin
    .from("auto_apply_preferences")
    .update({ last_run_at: new Date().toISOString() })
    .eq("user_id", prefs.user_id);

  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);

  const { count: queuedToday } = await admin
    .from("auto_apply_queue")
    .select("id", { count: "exact", head: true })
    .eq("user_id", prefs.user_id)
    .gte("created_at", startOfToday.toISOString());

  const remainingCapToday = prefs.daily_cap - (queuedToday ?? 0);
  if (remainingCapToday <= 0) return { queued: 0, reason: "daily_cap_reached" };

  const { data: resumeRow } = await admin
    .from("resumes")
    .select("content")
    .eq("user_id", prefs.user_id)
    .order("is_primary", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<ResumeRow>();
  const structured = resumeRow?.content?.structured;
  // Deliberately require a real, named resume before matching or writing a
  // cover letter — a resume file existing on its own isn't enough if it was
  // never run through the builder/enhancement step that fills in
  // structured.fullName, since every downstream cover letter references the
  // applicant's name. Reported back as "no_resume" so the UI can tell the
  // user exactly what to fix instead of a bare "no matches found."
  if (!structured || !structured.fullName) return { queued: 0, reason: "no_resume" };

  const [{ data: appliedRows }, { data: queuedRows }] = await Promise.all([
    admin.from("applications").select("source_job_id").eq("user_id", prefs.user_id).not("source_job_id", "is", null),
    admin.from("auto_apply_queue").select("source_job_id").eq("user_id", prefs.user_id),
  ]);
  const seenIds = new Set<string>([
    ...(appliedRows ?? []).map((r: { source_job_id: string }) => r.source_job_id),
    ...(queuedRows ?? []).map((r: { source_job_id: string }) => r.source_job_id),
  ]);

  const matches = candidateJobs
    .filter((j) => !seenIds.has(j.id) && matchesPreferences(j, prefs))
    .map((j) => ({ job: j, score: scoreJob(j, structured) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(remainingCapToday, MAX_MATCHES_PER_USER_PER_RUN));

  let queuedCount = 0;
  for (const { job, score } of matches) {
    let coverLetter = "";
    try {
      coverLetter = await generateCoverLetter({ resume: structured, jobTitle: job.title, company: job.company });
    } catch {
      // Missing resume name etc. — already guarded above, but stay
      // defensive; an empty cover letter still leaves a reviewable queue
      // entry rather than skipping the match entirely.
    }

    const { error: insertError } = await admin.from("auto_apply_queue").insert({
      user_id: prefs.user_id,
      source_job_id: job.id,
      title: job.title,
      company: job.company,
      location: job.location || null,
      apply_url: job.applyUrl,
      source: job.id.split("-")[0] || "unknown",
      industry: job.industry || null,
      work_type: job.workType,
      match_score: score,
      cover_letter: coverLetter,
      status: "pending",
    });
    // 23505 = duplicate (user_id, source_job_id) — another run/tab beat us
    // to it, not a real failure.
    if (!insertError) queuedCount += 1;
  }

  return queuedCount > 0 ? { queued: queuedCount } : { queued: 0, reason: "no_matches" };
}
