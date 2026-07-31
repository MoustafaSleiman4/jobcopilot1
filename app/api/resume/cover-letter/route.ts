import { NextRequest, NextResponse } from "next/server";
import type { StructuredResume } from "@/lib/resume-types";

export const runtime = "nodejs";

type CoverLetterRequest = {
  resume?: StructuredResume;
  jobTitle?: string;
  company?: string;
  jobDescription?: string;
  tone?: "professional" | "enthusiastic" | "concise";
};

/** Used when no ANTHROPIC_API_KEY is set, and as a safety net if a real AI
 * call fails outright — so the page always has something reasonable to show
 * instead of a hard error. Clearly labeled as a demo pass, same convention as
 * the resume-enhance route's demoStructure(). */
function demoCoverLetter({ resume, jobTitle, company }: CoverLetterRequest): string {
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

const TONE_GUIDANCE: Record<NonNullable<CoverLetterRequest["tone"]>, string> = {
  professional: "formal, polished, and business-appropriate",
  enthusiastic: "warm and genuinely enthusiastic, while staying professional",
  concise: "brief and to the point — no more than 3 short paragraphs total",
};

/**
 * AI cover-letter generator. Pro-gated on the client (see
 * app/[locale]/dashboard/cover-letter/page.tsx) — this route itself doesn't
 * enforce plan since it has no server-side session context beyond what the
 * page already checked; the page refuses to call it for free-plan users.
 * Mirrors app/api/resume/enhance/route.ts's Claude-call pattern: real AI when
 * ANTHROPIC_API_KEY is set, clearly-labeled demo fallback otherwise.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as CoverLetterRequest;
  const { resume, jobTitle, company, jobDescription, tone = "professional" } = body;

  if (!resume || !resume.fullName) {
    return NextResponse.json({ error: "Missing resume details" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      letter: demoCoverLetter(body),
      note: "Demo cover letter — set ANTHROPIC_API_KEY to use real AI generation.",
    });
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
      return NextResponse.json({ error: "AI generation failed" }, { status: 502 });
    }

    const data = await res.json();
    const raw: string = data.content?.[0]?.text ?? "";
    const letter = raw.trim() || demoCoverLetter(body);

    return NextResponse.json({ letter });
  } catch {
    return NextResponse.json({ error: "AI generation failed" }, { status: 502 });
  }
}
