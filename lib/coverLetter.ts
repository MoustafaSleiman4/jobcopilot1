import type { StructuredResume } from "@/lib/resume-types";

// Extracted from app/api/resume/cover-letter/route.ts (pure extraction, same
// behavior) so app/api/cron/auto-apply/route.ts can generate a cover letter
// for each matched job without duplicating the AI-call/prompt logic.

export type CoverLetterInput = {
  resume?: StructuredResume;
  jobTitle?: string;
  company?: string;
  jobDescription?: string;
  tone?: "professional" | "enthusiastic" | "concise";
};

/** Used when no ANTHROPIC_API_KEY is set, and as a safety net if a real AI
 * call fails outright — so callers always have something reasonable to show
 * instead of a hard error. Clearly labeled as a demo pass, same convention as
 * the resume-enhance route's demoStructure(). */
export function demoCoverLetter({ resume, jobTitle, company }: CoverLetterInput): string {
  const name = resume?.fullName || "Your Name";
  const role = jobTitle || "this role";
  const org = company || "your company";
  const topSkills = (resume?.skills ?? []).slice(0, 4).join(", ");
  const recentRole = resume?.experience?.[0];

  return `Dear Hiring Manager,

I am writing to express my interest in the ${role} position at ${org}. ${
    recentRole
      ? `In my current role as ${recentRole.role || "a professional"}${recentRole.company ? ` at ${recentRole.company}` : ""}, I have built experience directly relevant to this opportunity.`
      : "I believe my background and experience make me a strong candidate for this opportunity."
  }${topSkills ? ` My core strengths include ${topSkills}.` : ""}

I would welcome the chance to discuss how my background aligns with your team's needs. Thank you for your time and consideration.

Sincerely,
${name}

(Demo cover letter — set ANTHROPIC_API_KEY to generate a fully tailored, AI-written letter.)`;
}

const TONE_GUIDANCE: Record<NonNullable<CoverLetterInput["tone"]>, string> = {
  professional: "formal, polished, and business-appropriate",
  enthusiastic: "warm and genuinely enthusiastic, while staying professional",
  concise: "brief and to the point — no more than 3 short paragraphs total",
};

/**
 * AI cover-letter generator: real AI when ANTHROPIC_API_KEY is set, clearly
 * labeled demo fallback otherwise. Returns the letter text directly; throws
 * only on a malformed/missing resume, same validation the route already had.
 */
export async function generateCoverLetter(input: CoverLetterInput): Promise<string> {
  const { resume, jobTitle, company, jobDescription, tone = "professional" } = input;
  if (!resume || !resume.fullName) {
    throw new Error("Missing resume details");
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return demoCoverLetter(input);
  }

  const resumeSummary = `Name: ${resume.fullName}
Title: ${resume.title || ""}
Summary: ${resume.summary || ""}
Skills: ${(resume.skills ?? []).join(", ")}
Experience: ${(resume.experience ?? [])
    .map((e) => `${e.role} at ${e.company} (${e.period}) — ${e.bullets.join("; ")}`)
    .join(" | ")}
Education: ${(resume.education ?? []).map((e) => `${e.degree}, ${e.school} (${e.period})`).join(" | ")}`;

  const prompt = `You are an expert career writer for candidates applying to jobs in the Gulf, Levant, and wider MEA region.

Write a tailored, truthful cover letter for the candidate below applying to the job described. Never invent employers, dates, titles, or achievements not implied by the resume. Keep the tone ${TONE_GUIDANCE[tone] ?? TONE_GUIDANCE.professional}. Address it generically ("Dear Hiring Manager") unless a hiring manager name is given. Return ONLY the letter text — no markdown fences, no commentary, no subject line.

Candidate resume:
---
${resumeSummary}
---

Target job:
Title: ${jobTitle || "(not specified)"}
Company: ${company || "(not specified)"}
Description: ${jobDescription || "(not provided — write a strong general letter for this title/company)"}
`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      // Mirrors the route's fail-soft behavior for callers that want it
      // (the cron falls back to the demo letter rather than skipping the
      // job entirely over a transient AI-API error).
      return demoCoverLetter(input);
    }

    const data = await res.json();
    const raw: string = data.content?.[0]?.text ?? "";
    return raw.trim() || demoCoverLetter(input);
  } catch {
    return demoCoverLetter(input);
  }
}
