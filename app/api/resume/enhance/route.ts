import { NextRequest, NextResponse } from "next/server";

/**
 * AI resume enhancement. Uses the Claude API when ANTHROPIC_API_KEY is set;
 * otherwise falls back to a simple canned rewrite so the feature is
 * demoable before real keys are configured.
 */
export async function POST(request: NextRequest) {
  const { text } = (await request.json()) as { text?: string };

  if (!text) {
    return NextResponse.json({ error: "Missing 'text'" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return NextResponse.json({
      enhanced: `${text.trim()} Delivered measurable results by combining data-driven decision making with clear, action-oriented communication.`,
      note: "Demo enhancement — set ANTHROPIC_API_KEY to use real AI rewriting.",
    });
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: `Rewrite this resume section to be more impactful, concise, and ATS-friendly. Keep it truthful — don't invent facts. Return only the rewritten text.\n\n${text}`,
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
}
