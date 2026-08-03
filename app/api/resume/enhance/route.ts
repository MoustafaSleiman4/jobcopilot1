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
      // Same bug class as certifications/languages below ("resume clearly
      // has an email/phone at the top but the Contact Details fields come
      // back empty after upload"): these were never in the AI's JSON schema
      // and were silently dropped even when the model returned them, since
      // this function only ever read the 8 keys above off `parsed`.
      email: typeof parsed.email === "string" ? parsed.email : "",
      phone: typeof parsed.phone === "string" ? parsed.phone : "",
      location: typeof parsed.location === "string" ? parsed.location : "",
      links: typeof parsed.links === "string" ? parsed.links : "",
      // Previously missing from both this schema and the demo fallback below
      // — a resume that clearly stated "PMP certified" would come back with
      // an empty certifications list every time, since nothing ever asked
      // for it. Certifications are often mentioned inline (in the summary
      // or a job bullet) rather than under their own heading, so `issuer`
      // and `year` are frequently unknown from the source text; leave them
      // blank rather than guessing.
      certifications: Array.isArray(parsed.certifications)
        ? parsed.certifications
            .map((c: Record<string, unknown>) => ({
              name: typeof c.name === "string" ? c.name : "",
              issuer: typeof c.issuer === "string" ? c.issuer : "",
              year: typeof c.year === "string" ? c.year : "",
            }))
            .filter((c: { name: string }) => c.name.trim().length > 0)
        : [],
      languages: Array.isArray(parsed.languages)
        ? parsed.languages
            .map((l: Record<string, unknown>) => ({
              name: typeof l.name === "string" ? l.name : "",
              level: typeof l.level === "string" ? l.level : "",
            }))
            .filter((l: { name: string }) => l.name.trim().length > 0)
        : [],
    };
  } catch {
    return null;
  }
}

const CONTACT_LINE_RE = /@|https?:\/\/|linkedin\.com|\+?\d[\d\s().-]{6,}\d/i;
const SECTION_HEADERS: Record<
  "summary" | "skills" | "experience" | "education" | "certifications" | "languages",
  RegExp
> = {
  summary: /^(summary|profile|professional summary|about)\s*:?$/i,
  skills: /^(skills|core skills|key skills|technical skills|competencies)\s*:?$/i,
  experience: /^(experience|work experience|employment|professional experience)\s*:?$/i,
  education: /^(education|academic background|qualifications)\s*:?$/i,
  certifications: /^(certifications?|certificates?|licenses?\s*(&|and)?\s*certifications?)\s*:?$/i,
  languages: /^languages?\s*:?$/i,
};

// A resume very often mentions a certification inline ("PMP certified",
// "AWS Certified Solutions Architect") in the summary or a job bullet
// rather than under its own heading — a section-header-only scan would
// miss exactly the case a user reported ("it contains i'm PMP certified,
// but the certifications box showed empty"). This is a best-effort net
// of well-known, widely-recognized certifications run across the *whole*
// resume text, independent of section headers, used only by the no-AI
// demo fallback below (the real AI path is instructed to find these
// itself and isn't limited to this fixed list).
const KNOWN_CERTIFICATIONS: { name: string; pattern: RegExp }[] = [
  { name: "PMP (Project Management Professional)", pattern: /\bPMP\b|project management professional/i },
  { name: "CAPM", pattern: /\bCAPM\b/ },
  { name: "PMI-ACP", pattern: /\bPMI-?ACP\b/i },
  { name: "PRINCE2", pattern: /\bPRINCE2\b/i },
  { name: "Certified ScrumMaster (CSM)", pattern: /\bCSM\b|certified scrummaster/i },
  { name: "Professional Scrum Master (PSM)", pattern: /\bPSM\b|professional scrum master/i },
  { name: "Six Sigma", pattern: /six sigma/i },
  { name: "ITIL", pattern: /\bITIL\b/ },
  { name: "CISSP", pattern: /\bCISSP\b/ },
  { name: "CISA", pattern: /\bCISA\b/ },
  { name: "CISM", pattern: /\bCISM\b/ },
  { name: "CEH (Certified Ethical Hacker)", pattern: /\bCEH\b|certified ethical hacker/i },
  { name: "CompTIA Security+", pattern: /comptia\s*security\+?/i },
  { name: "CompTIA A+", pattern: /comptia\s*a\+/i },
  { name: "CCNA", pattern: /\bCCNA\b/ },
  { name: "CCNP", pattern: /\bCCNP\b/ },
  { name: "AWS Certified Solutions Architect", pattern: /aws certified solutions architect/i },
  { name: "AWS Certified", pattern: /\bAWS Certified\b/i },
  { name: "Microsoft Certified: Azure", pattern: /microsoft certified.{0,20}azure|azure certified/i },
  { name: "Google Cloud Certified", pattern: /google cloud certified/i },
  { name: "CFA (Chartered Financial Analyst)", pattern: /\bCFA\b|chartered financial analyst/i },
  { name: "CPA (Certified Public Accountant)", pattern: /\bCPA\b|certified public accountant/i },
  { name: "ACCA", pattern: /\bACCA\b/ },
  { name: "SHRM-CP", pattern: /\bSHRM-?CP\b/i },
  { name: "PHR (Professional in Human Resources)", pattern: /\bPHR\b|professional in human resources/i },
  { name: "Google Ads Certification", pattern: /google ads certifi/i },
  { name: "HubSpot Certification", pattern: /hubspot certifi/i },
  { name: "LEED Certification", pattern: /\bLEED\b/ },
];

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
  // Contact block: email/phone/location/links usually sit directly under
  // the name/title, one item per line (or a couple crammed onto one line).
  // This used to only *skip* lines that looked like email/phone/url without
  // ever capturing them into a field, and a bare location line (no digits
  // or "@", e.g. "Beirut, Lebanon") didn't even match the skip check, so it
  // silently leaked into the summary text instead of populating Contact
  // Details. Now each piece is pulled out, mirroring the AI-path schema
  // above, and a short line that's neither email/phone/url is read as the
  // location — right up until something that looks like a real section
  // header (e.g. an ALL-CAPS "EXECUTIVE SUMMARY" line) or an actual
  // paragraph of content is reached.
  const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const PHONE_RE = /\+?\d[\d\s().-]{6,}\d/;
  const LINK_RE = /https?:\/\/\S+|(?:www\.)?linkedin\.com\/\S+|(?:www\.)?github\.com\/\S+/gi;

  let email = "";
  let phone = "";
  let location = "";
  const linkFragments: string[] = [];
  const CONTACT_WINDOW = 5; // generous cap so this loop can never run away into the rest of the document
  let consumed = 0;

  while (lines[cursor] && consumed < CONTACT_WINDOW) {
    const line = lines[cursor];
    // A shouty short line ("EXECUTIVE SUMMARY", "CORE COMPETENCIES") is
    // almost certainly the next real section starting, not contact info.
    const looksLikeHeader = line.length > 3 && line === line.toUpperCase() && line !== line.toLowerCase();
    if (looksLikeHeader) break;

    const isContactLine = CONTACT_LINE_RE.test(line);
    const isBareLocation =
      !isContactLine && line.length < 60 && /^[A-Za-z][A-Za-z\s.,'-]*$/.test(line) && line.split(/\s+/).length <= 6;

    if (!isContactLine && !isBareLocation) break; // real paragraph content starts here

    if (isContactLine) {
      const emailMatch = line.match(EMAIL_RE);
      if (emailMatch && !email) email = emailMatch[0];

      const linkMatches = line.match(LINK_RE);
      if (linkMatches) linkFragments.push(...linkMatches);

      const phoneMatch = line.replace(LINK_RE, " ").match(PHONE_RE);
      if (phoneMatch && !phone) phone = phoneMatch[0].trim();
    } else if (!location) {
      location = line;
    }

    cursor++;
    consumed++;
  }

  const links = linkFragments.join(", ");
  const rest = lines.slice(cursor);

  // Split the remaining lines into sections using common resume headers.
  const buckets: Record<
    "summary" | "skills" | "experience" | "education" | "certifications" | "languages",
    string[]
  > = {
    summary: [],
    skills: [],
    experience: [],
    education: [],
    certifications: [],
    languages: [],
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

  // Certifications: lines under an explicit "Certifications" heading are
  // trusted directly (split on common list delimiters, one cert per
  // fragment). On top of that — not instead of it — the KNOWN_CERTIFICATIONS
  // list is matched against the *entire* source text, so a certification
  // mentioned in a summary or bullet ("...and I'm PMP certified") is still
  // captured even with no dedicated section at all.
  const certifications: StructuredResume["certifications"] = [];
  const seenCertNames = new Set<string>();
  for (const line of buckets.certifications) {
    for (const fragment of line.split(/[,•|]/)) {
      const trimmed = fragment.trim();
      if (!trimmed || trimmed.length > 80) continue;
      const parts = trimmed.split(/\s*[-–—]\s*/);
      const name = parts[0].trim();
      const key = name.toLowerCase();
      if (!name || seenCertNames.has(key)) continue;
      seenCertNames.add(key);
      certifications.push({ name, issuer: parts[1]?.trim() ?? "", year: "" });
    }
  }
  for (const known of KNOWN_CERTIFICATIONS) {
    const key = known.name.toLowerCase();
    if (seenCertNames.has(key)) continue;
    if (known.pattern.test(text)) {
      seenCertNames.add(key);
      certifications.push({ name: known.name, issuer: "", year: "" });
    }
  }

  const languages: StructuredResume["languages"] = buckets.languages
    .flatMap((line) => line.split(/[,•|]/))
    .map((fragment) => {
      const trimmed = fragment.trim();
      // "English (Fluent)" / "English - Fluent" / "Arabic: Native" formats.
      const match = trimmed.match(/^([^()\-–:]+)[\s(:\-–]+([A-Za-z]+)\)?$/);
      if (match) return { name: match[1].trim(), level: match[2].trim() };
      return trimmed ? { name: trimmed, level: "" } : null;
    })
    .filter((l): l is { name: string; level: string } => l !== null && l.name.length > 0 && l.name.length < 40);

  const summaryText = buckets.summary.join(" ").trim();
  const demoSuffix = demoLabel
    ? " (Demo AI pass) Delivered measurable results by combining data-driven decision making with clear, action-oriented communication."
    : "";

  return {
    fullName: fullName || "Your Name",
    title: title || "Professional",
    email,
    phone,
    location,
    links,
    summary: (summaryText || rest.join(" ").trim()) + demoSuffix,
    skills,
    experience,
    education,
    certifications,
    languages,
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
  "email": string,
  "phone": string,
  "location": string,
  "links": string,
  "summary": string,
  "skills": string[],
  "experience": [{ "role": string, "company": string, "location": string, "period": string, "bullets": string[] }],
  "education": [{ "degree": string, "school": string, "period": string }],
  "certifications": [{ "name": string, "issuer": string, "year": string }],
  "languages": [{ "name": string, "level": string }]
}
The contact block at the very top of the resume (near the name/title, often on one or two lines) almost always has an email address, a phone number, and a city/country — pull those into "email", "phone", and "location" exactly as written (keep phone formatting/country code as-is, don't reformat it). If there's a LinkedIn/GitHub/portfolio URL anywhere in that block, put it in "links" (join multiple with ", " if there's more than one). Leave any of these four as an empty string only if that piece of contact info genuinely isn't present anywhere in the source text.
Look carefully for certifications and languages EVEN WHEN they're only mentioned in passing in the summary or a bullet point (e.g. "PMP certified", "fluent in French") rather than listed under their own heading — don't limit yourself to an explicit "Certifications" or "Languages" section. If a certification's issuing body or year isn't stated, leave "issuer"/"year" as an empty string rather than guessing. If you can't determine a field from the source text, use an empty string or empty array for it rather than inventing content — but keep the JSON structurally complete and valid.

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
