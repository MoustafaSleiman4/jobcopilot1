import { NextRequest, NextResponse } from "next/server";
import type { StructuredResume } from "@/lib/resume-types";

export const runtime = "nodejs";

/** Best-effort extraction of a JSON object from a model response that might
 * include stray commentary or markdown fences around the JSON. */
function parseStructuredResume(raw: string): StructuredResume | null {
  // Strip ```json / ``` markdown fences some models wrap the object in —
  // left in place these don't break brace-matching, but stripping first
  // avoids feeding stray fence text into the JSON.parse below.
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
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

const CONTACT_LINE_RE = /@|https?:\/\/|linkedin\.com|\+?\d[\d\s().-]{6,}\d/i;
const SECTION_HEADERS: Record<"summary" | "skills" | "experience" | "education", RegExp> = {
  summary: /^(summary|profile|professional summary|about)\s*:?$/i,
  skills: /^(skills|core skills|key skills|technical skills|competencies)\s*:?$/i,
  experience: /^(experience|work experience|employment|professional experience)\s*:?$/i,
  education: /^(education|academic background|qualifications)\s*:?$/i,
};

/** Lightweight heuristic structuring used as a fallback: when no
 * ANTHROPIC_API_KEY is configured yet, and also as a safety net if a real AI
 * response fails to parse as JSON, so the rich preview always has something
 * reasonable to show instead of a blank header and a wall of raw text. Real
 * structuring happens via Claude once ANTHROPIC_API_KEY is set and its
 * response parses cleanly. */
function demoStructure(text: string, demoLabel = true): StructuredResume {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let fullName = "";
  let title = "";
  let cursor = 0;

  // Name: usually the very first line, as long as it isn't itself contact
  // info and is short enough to plausibly be a name.
  if (lines[cursor] && lines[cursor].length < 60 && !CONTACT_LINE_RE.test(lines[cursor])) {
    fullName = lines[cursor];
    cursor++;
  }
  // Title: the next line, same rules, and skip past a stray "name - title"
  // single-line format by re-splitting it if a separator is present.
  if (fullName.includes(" - ") || /[|–]/.test(fullName)) {
    const [namePart, titlePart] = fullName.split(/\s*[-|–]\s*/).map((s) => s.trim());
    fullName = namePart ?? fullName;
    title = titlePart ?? "";
  } else if (lines[cursor] && lines[cursor].length < 80 && !CONTACT_LINE_RE.test(lines[cursor])) {
    title = lines[cursor];
    cursor++;
  }
  // Skip a contact-info line right after the header (email/phone/location).
  while (lines[cursor] && CONTACT_LINE_RE.test(lines[cursor]) && lines[cursor].length < 120) {
    cursor++;
  }

  const rest = lines.slice(cursor);

  // Split the remaining lines into sections using common resume headers.
  const buckets: Record<"summary" | "skills" | "experience" | "education", string[]> = {
    summary: [],
    skills: [],
    experience: [],
    education: [],
  };
  let current: keyof typeof buckets = "summary";
  for (const line of rest) {
    const matchedHeader = (Object.keys(SECTION_HEADERS) as (keyof typeof buckets)[]).find((key) =>
      SECTION_HEADERS[key].test(line)
    );
    if (matchedHeader) {
      current = matchedHeader;
      continue;
    }
    buckets[current].push(line);
  }

  const skills = buckets.skills
    .join(",")
    .split(/[,•|]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length < 40)
    .slice(0, 20);

  const experience: StructuredResume["experience"] = [];
  for (const line of buckets.experience) {
    const isBullet = /^[-•*]/.test(line);
    if (isBullet && experience.length > 0) {
      experience[experience.length - 1].bullets.push(line.replace(/^[-•*]\s*/, ""));
    } else if (!isBullet) {
      const parts = line.split(/\s*[|–]\s*|\s+—\s+/).map((s) => s.trim());
      experience.push({
        role: parts[0] ?? line,
        company: parts[1] ?? "",
        location: parts[2] ?? "",
        period: parts[3] ?? "",
        bullets: [],
      });
    }
  }

  const education: StructuredResume["education"] = buckets.education.map((line) => {
    const parts = line.split(/\s*[|–]\s*|\s+—\s+|,\s*/).map((s) => s.trim());
    return { degree: parts[0] ?? line, school: parts[1] ?? "", period: parts[2] ?? "" };
  });

  const summaryText = buckets.summary.join(" ").trim();
  const demoSuffix = demoLabel
    ? " (Demo AI pass) Delivered measurable results by combining data-driven decision making with clear, action-oriented communication."
    : "";

  return {
    fullName: fullName || "Your Name",
    title: title || "Professional",
    summary: (summaryText || rest.join(" ").trim()) + demoSuffix,
    skills,
    experience,
    education,
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
        // Long, multi-job resumes need real headroom — 2000 tokens was
        // truncating the JSON mid-object for real resumes, which broke
        // JSON.parse and silently dropped into the raw-text fallback below
        // with a blank name/title. 8000 comfortably covers a full resume.
        max_tokens: 8000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ error: "AI enhancement failed" }, { status: 502 });
    }

    const data = await res.json();
    const raw = data.content?.[0]?.text ?? "";
    // If the model's response doesn't parse as clean JSON (rare, but can
    // happen on a truncated or malformed response), fall back to the same
    // heuristic structuring used in demo mode rather than dumping the whole
    // raw resume into "summary" with an empty name/title header.
    const structured = parseStructuredResume(raw) ?? demoStructure(text, false);

    return NextResponse.json({ structured, enhanced: structured.summary || text });
  } catch {
    return NextResponse.json({ error: "AI enhancement failed" }, { status: 502 });
  }
}
