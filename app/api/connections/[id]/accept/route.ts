import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { sendConnectionAcceptedEmail } from "@/lib/email";
import { deriveDisplayName } from "@/lib/displayName";

export const runtime = "nodejs";

/**
 * Accepting a request is only meaningful for the addressee, and only while
 * the row is still 'pending'. RLS already scopes selects/updates to rows
 * the caller is part of (auth.uid() in (requester_id, addressee_id)), but
 * that alone would let the *requester* silently no-op an update here too —
 * so we explicitly check addressee_id/status before writing and return a
 * clean 403/409 rather than letting a Postgres/RLS failure leak.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { id } = await params;

  const { data: row, error: fetchError } = await supabase
    .from("connections")
    .select("id, requester_id, addressee_id, status")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !row) {
    return NextResponse.json({ error: "Connection request not found" }, { status: 404 });
  }
  if (row.addressee_id !== user.id) {
    return NextResponse.json({ error: "Only the addressee can accept this request" }, { status: 403 });
  }
  if (row.status !== "pending") {
    return NextResponse.json({ error: `Request is already ${row.status}` }, { status: 409 });
  }

  const { error: updateError } = await supabase
    .from("connections")
    .update({ status: "accepted", responded_at: new Date().toISOString() })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: "Could not accept connection request" }, { status: 500 });
  }

  // Best-effort, same reasoning as the request-sent email in
  // app/api/connections/request/route.ts — awaited so it isn't killed by
  // the function tearing down, non-fatal to the accept itself.
  const { data: pair } = await supabase
    .from("profiles")
    .select("id, full_name, email, job_title, current_company")
    .in("id", [user.id, row.requester_id]);
  const accepterProfile = pair?.find((p) => p.id === user.id);
  const requesterProfile = pair?.find((p) => p.id === row.requester_id);
  if (requesterProfile?.email) {
    const accepterName = deriveDisplayName(
      accepterProfile?.full_name as string | null,
      (accepterProfile?.email as string | null) ?? user.email ?? null
    );
    const accepterSubtitle = [accepterProfile?.job_title, accepterProfile?.current_company]
      .filter(Boolean)
      .join(" @ ") || null;
    await sendConnectionAcceptedEmail({
      to: requesterProfile.email as string,
      accepterName,
      accepterSubtitle,
    }).catch((err) => console.error("[connections] accepted email failed:", err));
  }

  return NextResponse.json({ ok: true, status: "accepted" });
}
