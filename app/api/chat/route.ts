import { NextRequest, NextResponse } from "next/server";

type ChatMessage = { role: "user" | "assistant"; content: string };

const SYSTEM_PROMPT = `You are the JobCopilot assistant, embedded in a job-search platform for
users in Saudi Arabia, the UAE, and the wider Gulf/MENA region. Help registered users with
resume feedback, interview preparation, job-search strategy, and salary/market questions.
Be concise, practical, and encouraging. If asked something outside job search, gently
redirect back to how you can help with their job search.`;

/**
 * Chatbot backing the ChatWidget component. Uses the Claude API when
 * ANTHROPIC_API_KEY is set; otherwise returns a canned helpful reply so the
 * widget is demoable before real keys are configured. In production, wire
 * this up to also pull the user's resume/profile from Supabase for context.
 */
export async function POST(request: NextRequest) {
  const { messages } = (await request.json()) as { messages: ChatMessage[] };
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return NextResponse.json({
      reply:
        "This is a demo reply — set ANTHROPIC_API_KEY to connect the real AI assistant. In production, I'd answer using your resume and job-search history as context.",
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
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });

  if (!res.ok) {
    return NextResponse.json(
      { reply: "Sorry, I ran into an error reaching the assistant." },
      { status: 200 }
    );
  }

  const data = await res.json();
  const reply = data.content?.[0]?.text ?? "Sorry, I didn't catch that.";

  return NextResponse.json({ reply });
}
