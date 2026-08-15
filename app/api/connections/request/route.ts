import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { sendConnectionRequestEmail } from "@/lib/email";
import { deriveDisplayName } from "@/lib/displayName";

export const runtime = "nodejs";

// Same "count rows in the last N hours" backstop already used by
// invite/route.ts's sentToday check — no new infra.
const MAX_PER_DAY = 40;

/**
 * Sends a connection request. `connections` has a generated
 * unique(user_low, user_high) pair constraint in the DB (see the migration
 * notes), so re-requesting an existing pair raises Postgres error 23505 —
 * we catch that and hand back the existing row's status instead of a raw
 * DB error, since from the requester's point of view "already connected /
 * already pending" is a normal, expected outcome, not a failure.
 */
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: { addresseeId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const addresseeId = typeof body.addresseeId === "string" ? body.addresseeId : "";
  if (!addresseeId) {
    return NextResponse.json({ error: "addresseeId is required" }, { status: 400 });
  }
  if (addresseeId === user.id) {
    return NextResponse.json({ error: "You can't connect with yourself" }, { status: 400 });
  }

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: sentToday } = await supabase
    .from("connections")
    .select("id", { count: "exact", head: true })
    .eq("requester_id", user.id)
    .gte("created_at", dayAgo);
  if ((sentToday ?? 0) >= MAX_PER_DAY) {
    return NextResponse.json(
      { error: "You've reached today's connection request limit. Try again tomorrow." },
      { status: 429 }
    );
  }

  const { data: inserted, error: insertError } = await supabase
    .from("connections")
    .insert({ requester_id: user.id, addressee_id: addresseeId })
    .select("id, status")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      const low = user.id < addresseeId ? user.id : addresseeId;
      const high = user.id < addresseeId ? addresseeId : user.id;
      const { data: existing } = await supabase
        .from("connections")
        .select("id, status")
        .eq("user_low", low)
        .eq("user_high", high)
        .maybeSingle();
      return NextResponse.json(
        {
          error: "Already connected or a request already exists",
          status: existing?.status ?? "unknown",
          connectionId: existing?.id ?? null,
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Could not send connection request" }, { status: 500 });
  }

  // Best-effort — the in-app notification (fan_out_notification() on this
  // same insert) already covers the "you have a request" case, so an email
  // failure here shouldn't fail the request itself. Fetch both profiles in
  // one query rather than two: requester for the "from" name/subtitle,
  // addressee for the send-to address (email is the system's own record of
  // it, not gated by that person's show_email peer-display preference —
  // this is a transactional notice, not a profile being shown to a peer).
  const { data: pair } = await supabase
    .from("profiles")
    .select("id, full_name, email, job_title, current_company")
    .in("id", [user.id, addresseeId]);
  const requesterProfile = pair?.find((p) => p.id === user.id);
  const addresseeProfile = pair?.find((p) => p.id === addresseeId);
  if (addresseeProfile?.email) {
    const requesterName = deriveDisplayName(
      requesterProfile?.full_name as string | null,
      (requesterProfile?.email as string | null) ?? user.email ?? null
    );
    const requesterSubtitle = [requesterProfile?.job_title, requesterProfile?.current_company]
      .filter(Boolean)
      .join(" @ ") || null;
    // Awaited (not fire-and-forget) — a serverless function's execution
    // context can be torn down as soon as the response is sent, which
    // would silently kill an un-awaited send. The .catch keeps a failure
    // here from turning into a 500 for what is otherwise a successful
    // connection request.
    await sendConnectionRequestEmail({
      to: addresseeProfile.email as string,
      requesterName,
      requesterSubtitle,
    }).catch((err) => console.error("[connections] request email failed:", err));
  }

  return NextResponse.json({ connectionId: inserted.id, status: inserted.status });
}
