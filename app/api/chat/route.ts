import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type ChatMessage = { role: "user" | "assistant"; content: string };

// Free-plan users get this many messages in the AI assistant before being
// asked to upgrade; Pro has no limit. Enforced here (not just client-side)
// so it can't be bypassed by calling the API directly.
export const FREE_CHAT_MESSAGE_LIMIT = 3;

const SYSTEM_PROMPT = `You are the GulfJobCopilot assistant, embedded in a job-search and
professional-networking platform for users across the Gulf, the Levant, and the wider MEA region —
explicitly including Saudi Arabia, the UAE, Qatar, Kuwait, Bahrain, Oman, and Lebanon, Jordan, and
Egypt. Many users are based in Lebanon or are Lebanese job seekers looking at roles both locally
and across the Gulf, so give Lebanon-specific context (local job market conditions, Beirut-based
employers, remote/relocation options into the Gulf) the same weight as Gulf-specific context
whenever it's relevant — never treat Lebanon as an afterthought.

Help registered users with resume feedback, interview preparation, job-search strategy, and
salary/market questions.

The platform also has a LinkedIn-style professional social network built in, under "Connections"
and "Posts" in the dashboard sidebar — you should know about it and actively help users with it,
not just the resume/job-search side:
- Connections page (tabs: "My Connections", "Sent Requests", "Received Requests", "Find People") —
  search for other professionals, send/accept/decline connection requests, and browse a person's
  profile (contact info, mutual connections, and — once you're connected — their own connections
  list too).
- Posts page — a feed where users share text updates plus photos/video with their network, and can
  like and comment on others' posts.
- Messages page — direct messaging with anyone you're connected to.
- A notification bell in the dashboard header for new connection requests, accepted connections,
  comments, and reactions.
When a user asks how to grow their network, message someone, post an update, or manage connection
requests, walk them through the relevant page/tab by name — never say networking/social features
aren't supported, they are.

Be concise, practical, and encouraging. If asked something outside job search or professional
networking on this platform, gently redirect back to how you can help with those.`;

/**
 * Chatbot backing the ChatWidget component. Uses the Claude API when
 * ANTHROPIC_API_KEY is set; otherwise returns a canned helpful reply so the
 * widget is demoable before real keys are configured. In production, wire
 * this up to also pull the user's resume/profile from Supabase for context.
 */
export async function POST(request: NextRequest) {
  const { messages, plan } = (await request.json()) as {
    messages: ChatMessage[];
    plan?: "free" | "pro";
  };

  const userMessageCount = messages.filter((m) => m.role === "user").length;
  if (plan !== "pro" && userMessageCount > FREE_CHAT_MESSAGE_LIMIT) {
    return NextResponse.json({
      limitReached: true,
      reply: "You've reached the free message limit for the AI assistant. Upgrade to Pro for unlimited access.",
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return NextResponse.json({
      reply:
        "This is a demo reply — set ANTHROPIC_API_KEY to connect the real AI assistant. In production, I'd answer using your resume and job-search history as context.",
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
  } catch {
    return NextResponse.json(
      { reply: "Sorry, I ran into an error reaching the assistant." },
      { status: 200 }
    );
  }
}
