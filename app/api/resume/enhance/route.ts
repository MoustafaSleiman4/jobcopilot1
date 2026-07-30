import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * AI resume rewrite. Uses the Claude API when ANTHROPIC_API_KEY is set;
 * otherwise falls back to a clearly-labeled demo rewrite so the feature is
 * still demoable before real keys are configured. Handles both a short
 * section (legacy "enhance" button) and a full resume pasted/extracted
 * from an uploaded file.
 */
export async function POST(request: NextRequest) {
  const { text } = (await request.json()) as { text?: string };

  if (!text || !text.trim()) {
    return NextResponse.json({ error: "Missing 'text'" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return NextResponse.json({
      enhanced: `${text.trim()}\n\n(Demo AI pass) Delivered measurable results by combining data-driven decision making with clear, action-oriented communication. Set ANTHROPIC_API_KEY to turn on real AI rewriting.`,
      note: "Demo enhancement — set ANTHROPIC_API_KEY to use real AI rewriting.",
    });
  }

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
        max_tokens: 1800,
        messages: [
          {
            role: "user",
            content: `You are an expert resume writer for the Gulf, Levant, and wider MEA job market. Rewrite the resume text below to be more impactful, concise, well-organized, and ATS-friendly. Keep it strictly truthful — never invent employers, dates, titles, or numbers that aren't implied by the original. Preserve the person's actual experience and structure it clearly (use short paragraphs or line breaks between sections/roles as appropriate). Return only the rewritten resume text, with no preamble or commentary.\n\n---\n${text}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ error: "AI enhancement failed" }, { status: 502 });
    }

    const data = await res.json();
    const enhanced = data.content?.[0]?.text ?? text;

    return NextResponse.json({ enhanced });
  } catch {
    return NextResponse.json({ error: "AI enhancement failed" }, { status: 502 });
  }
}
