import { NextRequest, NextResponse } from "next/server";
import type { StructuredResume } from "@/lib/resume-types";

export const runtime = "nodejs";

function emptyStructured(): StructuredResume {
  return { fullName: "", title: "", summary: "", skills: [], experience: [], education: [] };
}

/** Best-effort extraction of a JSON object from a model response that might
 * include stray commentary or markdown fences around the JSON. */
function parseStructuredResume(raw: string): StructuredResume | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    return {
      fullName: typeof parsed.fullName === "string" ? parsed.fullName : "",
      title: typeof parsed.title === "string" ? parsed.title : "",
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      skills: Array.isArray(parsed.skills) ? parsed.skills.filter((s: unknown) => typeof s === "string") : [],
      experience: Array.isArray(parsed.experience)
        ? parsed.experience.map((e: Record<string, unknown>) => ({
            role: typeof e.role === "string" ? e.role : "",
            company: typeof e.company === "string" ? e.company : "",
            location: typeof e.location === "string" ? e.location : "",
            period: typeof e.period === "string" ? e.period : "",
            bullets: Array.isArray(e.bullets) ? e.bullets.filter((b: unknown) => typeof b === "string") : [],
          }))
        : [],
      education: Array.isArray(parsed.education)
        ? parsed.education.map((ed: Record<string, unknown>) => ({
            degree: typeof ed.degree === "string" ? ed.degree : "",
            school: typeof ed.school === "string" ? ed.school : "",
            period: typeof ed.period === "string" ? ed.period : "",
          }))
        : [],
    };
  } catch {
    return null;
  }
}

/** Lightweight heuristic structuring used only in demo mode (no API key
 * configured yet) so the rich preview still has something reasonable to
 * show. Real structuring happens via Claude once ANTHROPIC_API_KEY is set. */
function demoStructure(text: string): StructuredResume {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let fullName = "";
  let title = "";
  let rest = lines;

  if (lines.length && lines[0].length < 80 && /[-|–]/.test(lines[0])) {
    const [namePart, titlePart] = lines[0].split(/[-|–]/).map((s) => s.trim());
    fullName = namePart ?? "";
    title = titlePart ?? "";
    rest = lines.slice(1);
  }

  return {
    fullName: fullName || "Your Name",
    title: title || "Professional",
    summary:
      rest.join(" ").trim() +
      " (Demo AI pass) Delivered measurable results by combining data-driven decision making with clear, action-oriented communication.",
    skills: [],
    experience: [],
    education: [],
  };
}

/**
 * AI resume rewrite. Uses the Claude API when ANTHROPIC_API_KEY is set to
 * both rewrite and structure the resume into named sections (summary,
 * skills, experience, education) so the UI can render a proper, read-only
 * resume preview instead of a flat block of text. Falls back to a
 * clearly-labeled demo pass otherwise.
 */
export async function POST(request: NextRequest) {
  const { text } = (await request.json()) as { text?: string };

  if (!text || !text.trim()) {
    return NextResponse.json({ error: "Missing 'text'" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    const structured = demoStructure(text);
    return NextResponse.json({
      structured,
      enhanced: structured.summary,
      note: "Demo enhancement — set ANTHROPIC_API_KEY to use real AI rewriting.",
    });
  }

  const prompt = `You are an expert resume writer for the Gulf, Levant, and wider MEA job market.
Rewrite and structure the resume text below into clean, ATS-friendly, truthful content. Never invent employers, dates, titles, or achievements that aren't implied by the source text.

Return ONLY a single JSON object — no markdown fences, no commentary before or after — matching exactly this shape:
{
  "fullName": string,
  "title": string,
  "summary": string,
  "skills": string[],
  "experience": [{ "role": string, "company": string, "location": string, "period": string, "bullets": string[] }],
  "education": [{ "degree": string, "school": string, "period": string }]
}
If you can't determine a field from the source text, use an empty string or empty array for it rather than inventing content — but keep the JSON structurally complete and valid.

Resume text:
---
${text}`;

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
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ error: "AI enhancement failed" }, { status: 502 });
    }

    const data = await res.json();
    const raw = data.content?.[0]?.text ?? "";
    const structured = parseStructuredResume(raw) ?? { ...emptyStructured(), summary: text };

    return NextResponse.json({ structured, enhanced: structured.summary || text });
  } catch {
    return NextResponse.json({ error: "AI enhancement failed" }, { status: 502 });
  }
}
