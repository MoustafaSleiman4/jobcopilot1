import type { SupabaseClient } from "@supabase/supabase-js";
import { LOCATION_ALIASES, type Job } from "@/lib/jobSources";
import { generateCoverLetter } from "@/lib/coverLetter";
import type { StructuredResume } from "@/lib/resume-types";
import {
  type ApplicantProfileFields,
  type GreenhouseQuestion,
  type ScreeningQA,
  buildStandardScreeningAnswers,
  fetchGreenhouseApplicationQuestions,
  generateGreenhouseScreeningAnswers,
  parseGreenhouseApplyUrl,
} from "@/lib/screeningAnswers";

// Shared by app/api/cron/auto-apply/route.ts (the scheduled daily run, across
// every opted-in user) and app/api/auto-apply/run-now/route.ts (a single
// user's on-demand trigger) — pure extraction of the per-user matching logic
// so both call sites stay in sync instead of drifting apart.

// Hard ceiling per user per run, independent of their configured daily_cap
// (which now goes up to 50 per the DB check constraint — see
// supabase/auto-apply.sql) — a second safety net against one misconfigured
// or malicious `daily_cap` write turning into a runaway AI-spend loop. Kept
// equal to the DB max rather than below it, since daily_cap is already the
// deliberate per-user ceiling; this just guards against it being bypassed.
export const MAX_MATCHES_PER_USER_PER_RUN = 50;

// How long a user has to wait between on-demand "Run now" triggers.
// Previously 24h — that existed only to protect the free/paid job-board
// APIs from being hammered by repeated manual triggering. Now that
// matching reads exclusively from our own retrieved_jobs cache (see
// lib/jobCache.ts) instead of calling those APIs directly, there's nothing
// left to protect by rate-limiting this button: `daily_cap` already caps
// how many matches get queued per day regardless of how often this runs,
// so 0 just means "no artificial wait, run as often as you like."
export const RUN_NOW_COOLDOWN_MS = 0;

export type AutoApplyPreferences = {
  user_id: string;
  enabled: boolean;
  daily_cap: number;
  keywords: string;
  location: string;
  work_type: "remote" | "hybrid" | "onsite" | null;
  excluded_companies: string[];
  // Which of the user's (possibly several) resumes to match against and
  // write cover letters from. Null means "no explicit choice made" — falls
  // back to their primary/most-recently-updated resume, same as before this
  // field existed, so existing rows with no resume_id keep working exactly
  // as they did.
  resume_id: string | null;
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

  // Dismissed rows don't count against today's cap — otherwise a match
  // queued earlier today under stale criteria (e.g. before the user edited
  // their keywords) permanently occupies a daily_cap "slot" even after
  // they've explicitly thrown it out, blocking a fresh, better-matching run
  // for the rest of the day with no way to recover except waiting until
  // tomorrow. Dismissing a stale match now genuinely frees that slot up so
  // the next "Run now" (or the next cron pass) can fill it with something
  // that actually matches the current settings.
  const { count: queuedToday } = await admin
    .from("auto_apply_queue")
    .select("id", { count: "exact", head: true })
    .eq("user_id", prefs.user_id)
    .neq("status", "dismissed")
    .gte("created_at", startOfToday.toISOString());

  const remainingCapToday = prefs.daily_cap - (queuedToday ?? 0);
  if (remainingCapToday <= 0) return { queued: 0, reason: "daily_cap_reached" };

  // Use the resume the user explicitly picked in their Auto Apply settings,
  // if any. Filtered by user_id even though `resume_id` is already scoped to
  // that user at write time (see the auto-apply page) — cheap defense in
  // depth against a stale/tampered resume_id ever matching someone else's
  // resume. Falls back to the primary/most-recently-updated resume (the
  // original behavior) when no explicit choice was saved — resume_id has an
  // `on delete set null` foreign key (see
  // supabase/auto-apply-resume-selection.sql), so a deleted resume can't
  // leave this pointing at a dangling id.
  const resumeQuery = admin.from("resumes").select("content").eq("user_id", prefs.user_id);
  const { data: resumeRow } = prefs.resume_id
    ? await resumeQuery.eq("id", prefs.resume_id).maybeSingle<ResumeRow>()
    : await resumeQuery
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

  // Fetched once per run (not per matched job) — the Application Assist
  // panel's "ready to paste" screening-question answers (see
  // lib/screeningAnswers.ts) are built from this. A user who hasn't filled
  // theirs in yet just gets an empty standard-answers set per match, same as
  // before this feature existed — nothing here blocks matching or queuing.
  const { data: applicantProfile } = await admin
    .from("applicant_profile")
    .select(
      "work_authorization, notice_period, expected_salary, willing_to_relocate, willing_to_travel, linkedin_url, portfolio_url, total_years_experience, earliest_start_date, additional_notes"
    )
    .eq("user_id", prefs.user_id)
    .maybeSingle<ApplicantProfileFields>();

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

    // "Application Assist" data — see lib/screeningAnswers.ts. For a
    // Greenhouse-hosted posting (any source, not just this app's directly-
    // crawled boards — parseGreenhouseApplyUrl works off the apply URL
    // itself), fetch that posting's REAL application questions and draft
    // answers to them from the resume + application profile. Every other
    // platform still gets the deterministic, free standard-question answers
    // built straight from the application profile — no AI call needed for
    // those, so this never adds real cost for the common case.
    let applicationQuestions: GreenhouseQuestion[] = [];
    let suggestedAnswers: ScreeningQA[] = buildStandardScreeningAnswers(applicantProfile ?? null);
    if (job.atsPlatform === "greenhouse") {
      const parsed = parseGreenhouseApplyUrl(job.applyUrl);
      if (parsed) {
        try {
          applicationQuestions = await fetchGreenhouseApplicationQuestions(parsed.board, parsed.jobId);
        } catch {
          // Fall through with an empty question list — the standard answers
          // above are still a useful floor even if this specific fetch fails.
        }
      }
      if (applicationQuestions.length > 0) {
        try {
          suggestedAnswers = await generateGreenhouseScreeningAnswers({
            resume: structured,
            profile: applicantProfile ?? null,
            questions: applicationQuestions,
            jobTitle: job.title,
            company: job.company,
          });
        } catch {
          // Keep the standard-answers fallback already assigned above.
        }
      }
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
      ats_platform: job.atsPlatform ?? null,
      application_questions: applicationQuestions.length > 0 ? applicationQuestions : null,
      suggested_answers: suggestedAnswers.length > 0 ? suggestedAnswers : null,
    });
    // 23505 = duplicate (user_id, source_job_id) — another run/tab beat us
    // to it, not a real failure.
    if (!insertError) queuedCount += 1;
  }

  return queuedCount > 0 ? { queued: queuedCount } : { queued: 0, reason: "no_matches" };
}
