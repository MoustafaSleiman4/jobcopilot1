import type { StructuredResume } from "@/lib/resume-types";

// "Application Assist" — the safe, human-in-the-loop half of real auto-apply
// automation. This app deliberately never submits an application itself (no
// headless browser, no form-filling bot, no CAPTCHA handling — most ATS
// platforms put anti-bot defenses specifically in front of application
// forms, and their Terms of Service generally prohibit automated
// submissions). What it CAN do, and what this file builds, is prepare
// ready-to-paste answers so a human still clicks through and submits, but
// spends seconds instead of minutes retyping the same screening-question
// answers on every application.
//
// Two answer sources, combined in lib/autoApplyRun.ts:
//  1. buildStandardScreeningAnswers() — deterministic, free, no AI call.
//     Maps the applicant's saved Application Profile (see
//     supabase/applicant-profile-and-ats-enrichment.sql) straight onto the
//     handful of screening questions that show up on nearly every ATS
//     regardless of platform (work authorization, notice period, salary,
//     relocation, etc).
//  2. generateGreenhouseScreeningAnswers() — for Greenhouse-hosted postings
//     specifically (the one ATS in this app's source mix with a public,
//     documented API for a job's REAL application questions — see
//     fetchGreenhouseApplicationQuestions below), drafts answers to that
//     exact posting's custom questions from the resume + profile via one AI
//     call, on top of the standard answers.

export type GreenhouseQuestionField = { name?: string; type?: string; values?: { label: string }[] };
export type GreenhouseQuestion = { label: string; required: boolean; type: string; values?: { label: string }[] };

// Greenhouse's `?questions=true` response includes the platform's standard
// fields (name/email/phone/resume/cover letter) as question objects too —
// this app's cover letter + resume already cover every one of those, so
// they're filtered out here rather than shown as if they still needed a
// human's attention.
const STANDARD_FIELD_NAMES = /^(first_name|last_name|email|phone|resume|cover_letter)$/i;

/**
 * Given a Greenhouse job's apply URL (any of the board's hostnames —
 * job-boards.greenhouse.io, boards.greenhouse.io, and older embed variants
 * all share the same /{board_token}/jobs/{job_id} path shape), extracts the
 * board token + job id needed to call the public Job Board API directly.
 * Works for ANY Greenhouse posting encountered from ANY source (the app's
 * own directly-crawled boards, or a Greenhouse job surfaced through Jooble/
 * SerpApi/Careerjet) — not just the handful of boards in GREENHOUSE_BOARDS.
 */
export function parseGreenhouseApplyUrl(url: string): { board: string; jobId: string } | null {
  try {
    const { pathname } = new URL(url);
    const match = /\/([^/]+)\/jobs\/(\d+)/.exec(pathname);
    if (!match) return null;
    return { board: match[1], jobId: match[2] };
  } catch {
    return null;
  }
}

/**
 * Real, per-posting application questions from Greenhouse's public Job
 * Board API (documented at developers.greenhouse.io/job-board.html — this
 * is the same free, keyless, no-auth endpoint fetchGreenhouseJobs() already
 * uses for listings, just the single-job detail view with `questions=true`
 * appended). Verified response shape: `{ questions: [{ required, label,
 * fields: [{ name, type, values? }] }] }`. Cached for an hour via Next's
 * fetch revalidate, same as every other source fetch in lib/jobSources.ts.
 */
export async function fetchGreenhouseApplicationQuestions(board: string, jobId: string): Promise<GreenhouseQuestion[]> {
  try {
    const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${jobId}?questions=true`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const questions: { required?: boolean; label?: string; fields?: GreenhouseQuestionField[] }[] = data.questions ?? [];
    return questions
      .filter((q) => !STANDARD_FIELD_NAMES.test(q.fields?.[0]?.name ?? ""))
      .filter((q) => Boolean(q.label))
      .map((q) => ({
        label: q.label as string,
        required: Boolean(q.required),
        type: q.fields?.[0]?.type ?? "input_text",
        values: q.fields?.[0]?.values,
      }));
  } catch {
    return [];
  }
}

export type ScreeningQA = { question: string; answer: string };

// Matches the columns selected off public.applicant_profile in
// lib/autoApplyRun.ts — kept as a plain shape (not imported from a
// generated DB type) so this file has no dependency on the Supabase client.
export type ApplicantProfileFields = {
  work_authorization: string | null;
  notice_period: string | null;
  expected_salary: string | null;
  willing_to_relocate: boolean | null;
  willing_to_travel: boolean | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  total_years_experience: number | null;
  earliest_start_date: string | null;
  additional_notes: string | null;
};

const WORK_AUTH_LABELS: Record<string, string> = {
  citizen: "I'm a citizen — no sponsorship needed",
  resident_no_sponsorship: "I hold a valid residency/work visa — no sponsorship needed",
  requires_sponsorship: "I would require visa sponsorship",
  gcc_national: "GCC national",
};

const NOTICE_PERIOD_LABELS: Record<string, string> = {
  immediate: "Immediate / available now",
  "2_weeks": "2 weeks",
  "1_month": "1 month",
  "2_months": "2 months",
  "3_months_plus": "3+ months",
};

/**
 * The handful of screening questions that show up on nearly every ATS
 * regardless of platform, answered straight from the applicant's saved
 * profile — no AI call, so this is instant and free, and runs for every
 * queued match (not just Greenhouse ones). Only ever includes a question the
 * profile actually has a saved answer for; an unset field is skipped
 * entirely rather than shown as "(not set)" — that both keeps the panel free
 * of clutter and, when it comes back empty, is itself the signal that the
 * user still needs to fill in their Application Profile.
 */
export function buildStandardScreeningAnswers(profile: ApplicantProfileFields | null): ScreeningQA[] {
  if (!profile) return [];
  const qa: ScreeningQA[] = [];
  if (profile.work_authorization && WORK_AUTH_LABELS[profile.work_authorization]) {
    qa.push({
      question: "Are you authorized to work in this location, or would you require visa sponsorship?",
      answer: WORK_AUTH_LABELS[profile.work_authorization],
    });
  }
  if (profile.notice_period && NOTICE_PERIOD_LABELS[profile.notice_period]) {
    qa.push({ question: "What is your notice period?", answer: NOTICE_PERIOD_LABELS[profile.notice_period] });
  }
  if (profile.expected_salary) {
    qa.push({ question: "What are your salary expectations?", answer: profile.expected_salary });
  }
  if (profile.willing_to_relocate !== null) {
    qa.push({ question: "Are you willing to relocate?", answer: profile.willing_to_relocate ? "Yes" : "No" });
  }
  if (profile.willing_to_travel !== null) {
    qa.push({ question: "Are you willing to travel for this role?", answer: profile.willing_to_travel ? "Yes" : "No" });
  }
  if (profile.total_years_experience !== null && profile.total_years_experience !== undefined) {
    qa.push({ question: "How many years of relevant experience do you have?", answer: String(profile.total_years_experience) });
  }
  if (profile.earliest_start_date) {
    qa.push({ question: "What is your earliest available start date?", answer: profile.earliest_start_date });
  }
  if (profile.linkedin_url) {
    qa.push({ question: "LinkedIn profile URL", answer: profile.linkedin_url });
  }
  if (profile.portfolio_url) {
    qa.push({ question: "Portfolio / personal website URL", answer: profile.portfolio_url });
  }
  return qa;
}

function stripJsonFences(raw: string): string {
  return raw.trim().replace(/^```(json)?/i, "").replace(/```$/i, "").trim();
}

/**
 * Drafts answers to one specific Greenhouse posting's real, custom screening
 * questions (from fetchGreenhouseApplicationQuestions) using only facts from
 * the resume + Application Profile — explicitly instructed never to invent
 * anything, and to say so plainly when a question needs information neither
 * source has. Falls back to the free, deterministic standard answers (no AI
 * call) whenever there's no API key, the call fails, or the response can't
 * be parsed — same fail-soft convention as lib/coverLetter.ts's
 * demoCoverLetter(). This never submits anything; it only prepares text for
 * a human to review and paste in themselves.
 */
export async function generateGreenhouseScreeningAnswers(input: {
  resume: StructuredResume;
  profile: ApplicantProfileFields | null;
  questions: GreenhouseQuestion[];
  jobTitle: string;
  company: string;
}): Promise<ScreeningQA[]> {
  const { resume, profile, questions, jobTitle, company } = input;
  const standard = buildStandardScreeningAnswers(profile);
  if (questions.length === 0) return standard;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return standard;

  const resumeSummary = `Name: ${resume.fullName}
Title: ${resume.title || ""}
Summary: ${resume.summary || ""}
Skills: ${(resume.skills ?? []).join(", ")}
Experience: ${(resume.experience ?? []).map((e) => `${e.role} at ${e.company} (${e.period})`).join(" | ")}`;

  const profileSummary = profile
    ? `Work authorization: ${profile.work_authorization ?? "unknown"}
Notice period: ${profile.notice_period ?? "unknown"}
Expected salary: ${profile.expected_salary ?? "unknown"}
Willing to relocate: ${profile.willing_to_relocate ?? "unknown"}
Willing to travel: ${profile.willing_to_travel ?? "unknown"}
Years of experience: ${profile.total_years_experience ?? "unknown"}
Earliest start date: ${profile.earliest_start_date ?? "unknown"}
Additional notes: ${profile.additional_notes ?? ""}`
    : "No application profile saved yet.";

  const questionList = questions
    .map((q, i) => `${i + 1}. ${q.label}${q.values?.length ? ` (options: ${q.values.map((v) => v.label).join(", ")})` : ""}`)
    .join("\n");

  const prompt = `You are helping a job applicant PREPARE DRAFT ANSWERS to a real employer's application screening questions, for the applicant to review and paste in themselves. You are not submitting anything and this is not the actual application.

Candidate resume:
---
${resumeSummary}
---
Candidate's saved application profile:
---
${profileSummary}
---
Job: ${jobTitle} at ${company}

For each numbered question below, draft a short, truthful answer using ONLY the facts given above. Never invent employers, dates, numbers, or qualifications not implied by the resume/profile. If a question needs information not present above (a personal opinion, a specific figure not given, or an open-ended/behavioral question you can't truthfully answer from these facts alone), respond with exactly: "Not enough information — please answer this one yourself." If the question lists fixed options, answer with the closest matching option's exact label, or the "not enough information" text if none genuinely fit.

Questions:
${questionList}

Return ONLY a JSON array, no markdown fences, no commentary, in this exact shape:
[{"question": "<question text verbatim>", "answer": "<drafted answer>"}]`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) return standard;

    const data = await res.json();
    const raw: string = data.content?.[0]?.text ?? "";
    const parsed: unknown = JSON.parse(stripJsonFences(raw));
    if (!Array.isArray(parsed)) return standard;

    const aiAnswers = parsed.filter(
      (q): q is ScreeningQA =>
        typeof q === "object" && q !== null && typeof (q as ScreeningQA).question === "string" && typeof (q as ScreeningQA).answer === "string"
    );
    // AI-drafted answers for this specific posting's real questions first,
    // then the deterministic profile-based standard answers after — the
    // standard set covers facts (salary, notice period, links) a direct
    // field lookup gets exactly right every time, so there's no reason to
    // ask the AI to reproduce them and risk a subtly different phrasing.
    return [...aiAnswers, ...standard];
  } catch {
    return standard;
  }
}
