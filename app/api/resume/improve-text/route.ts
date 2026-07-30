import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Lightweight, single-field AI assist used by the manual CV builder's
// "Improve with AI" buttons (on the summary field and on individual
// experience bullets) — a much smaller ask than the full resume-structuring
// call in /api/resume/enhance, so it gets its own endpoint and prompt rather
// than overloading that one.
const KIND_INSTRUCTIONS: Record<"summary" | "bullet", string> = {
  summary:
    "Rewrite this resume summary to be concise, confident, and ATS-friendly (2-3 sentences). Keep it truthful — don't invent employers, numbers, or achievements not implied by the original.",
  bullet:
    "Rewrite this single resume bullet point to start with a strong action verb, be concise, and where the original implies a measurable result, keep or sharpen that number. One line only. Keep it truthful — don't invent numbers or outcomes not implied by the original.",
};

function demoImprove(text: string, kind: "summary" | "bullet"): string {
  // No ANTHROPIC_API_KEY configured — return the original text lightly
  // tidied (trimmed, single-spaced) rather than pretending to improve it,
  // so this never looks broken, just unenhanced.
  const cleaned = text.trim().replace(/\s+/g, " ");
  return kind === "bullet" && cleaned && !/^[•\-]/.test(cleaned) ? cleaned : cleaned;
}

export async function POST(request: NextRequest) {
  const { text, kind, context } = (await request.json()) as {
    text?: string;
    kind?: "summary" | "bullet";
    context?: string; // e.g. the job title, for a bullet — gives the model a bit more to work with
  };

  if (!text || !text.trim()) {
    return NextResponse.json({ error: "Missing 'text'" }, { status: 400 });
  }
  if (kind !== "summary" && kind !== "bullet") {
    return NextResponse.json({ error: "Invalid 'kind'" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      text: demoImprove(text, kind),
      note: "Demo mode — set ANTHROPIC_API_KEY to use real AI rewriting.",
    });
  }

  const prompt = `You are an expert resume writer for the Gulf, Levant, and wider MEA job market. ${KIND_INSTRUCTIONS[kind]}

Return ONLY the rewritten text — no quotes, no markdown, no commentary, no labels.

${context ? `Context (role/section this belongs to): ${context}\n\n` : ""}Original text:
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
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ error: "AI rewrite failed" }, { status: 502 });
    }

    const data = await res.json();
    const raw: string = data.content?.[0]?.text ?? "";
    const improved = raw.trim().replace(/^["'“]|["'”]$/g, "");
    if (!improved) {
      return NextResponse.json({ error: "AI rewrite failed" }, { status: 502 });
    }

    return NextResponse.json({ text: improved });
  } catch {
    return NextResponse.json({ error: "AI rewrite failed" }, { status: 502 });
  }
}
