import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { sendInviteEmail } from "@/lib/email";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PER_REQUEST = 10;
// Generous enough for a real "invite a few friends" use, tight enough that
// a compromised or careless account can't turn this into a spam cannon —
// this is the server-side backstop; the UI also caps a single submission
// at MAX_PER_REQUEST, but that alone is trivially bypassable by anyone
// calling the route directly.
const MAX_PER_DAY = 30;
// No resend cooldown: re-inviting an address that was already invited
// (even minutes ago) is allowed unconditionally, per explicit request —
// the MAX_PER_REQUEST/MAX_PER_DAY caps above are the anti-spam backstop
// that stays in place regardless.

/**
 * Lets a signed-in user invite people to GulfJobCopilot by email, sent from
 * a GulfJobCopilot-branded address (see lib/email.ts) rather than the
 * user's own inbox — both more professional-looking to the invitee and
 * avoids ever exposing the inviter's personal address to a stranger.
 *
 * The inviter chooses per-request whether their name is attached (`showName`);
 * that choice — not just their current profile name — is what's recorded
 * on each public.referrals row, so history stays accurate even if their
 * profile name or a future default changes later.
 */
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: { emails?: unknown; showName?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const rawEmails = Array.isArray(body.emails) ? body.emails : [];
  const showName = body.showName !== false; // default to showing the name

  const ownEmail = user.email?.toLowerCase().trim();
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const raw of rawEmails) {
    if (typeof raw !== "string") continue;
    const email = raw.trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) continue;
    if (email === ownEmail) continue; // can't invite yourself
    if (seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
  }

  if (emails.length === 0) {
    return NextResponse.json({ error: "Enter at least one valid email address" }, { status: 400 });
  }
  if (emails.length > MAX_PER_REQUEST) {
    return NextResponse.json(
      { error: `You can invite up to ${MAX_PER_REQUEST} people at a time` },
      { status: 400 }
    );
  }

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: sentToday } = await supabase
    .from("referrals")
    .select("id", { count: "exact", head: true })
    .eq("inviter_id", user.id)
    .gte("created_at", dayAgo);
  if ((sentToday ?? 0) >= MAX_PER_DAY) {
    return NextResponse.json(
      { error: "You've reached today's invite limit. Try again tomorrow." },
      { status: 429 }
    );
  }
  const remainingToday = MAX_PER_DAY - (sentToday ?? 0);

  // Every valid, deduped, non-self email goes out — no "already invited"
  // exclusion. MAX_PER_REQUEST/MAX_PER_DAY above are still the real caps.
  const toSend = emails.slice(0, remainingToday);
  const skipped = emails.filter((email) => !toSend.includes(email));

  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
  const inviterName = (profile?.full_name as string | null) ?? null;

  const sent: string[] = [];
  const failed: string[] = [];

  for (const email of toSend) {
    const result = await sendInviteEmail({
      to: email,
      inviterName,
      showName,
      refUserId: user.id,
    });

    if (!result.ok) {
      failed.push(email);
      continue;
    }

    const { error: upsertError } = await supabase
      .from("referrals")
      .upsert(
        { inviter_id: user.id, invitee_email: email, show_inviter_name: showName, status: "sent", created_at: new Date().toISOString() },
        { onConflict: "inviter_id,invitee_email" }
      );
    if (upsertError) {
      // Email genuinely went out — don't report this as a failed invite,
      // just log it. Worst case the "already invited" cooldown resets a
      // little early for this one address next time.
      console.error("[invite] referral upsert failed:", upsertError.message);
    }
    sent.push(email);
  }

  return NextResponse.json({ sent, skipped, failed });
}
