import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const MAX_BODY_LENGTH = 2000;
// Same "count rows in the last N hours" backstop pattern used by
// invite/route.ts and connections/request/route.ts — generous enough for a
// real back-and-forth conversation (spread across every thread a user has,
// not per-thread), tight enough to still catch a spam cannon.
const MAX_MESSAGES_PER_DAY = 200;

/**
 * Confirms the caller is actually a party to this connection and that it's
 * `accepted` (DMs only exist between accepted connections — see task
 * notes). RLS would block a mismatched request too, but a plain select
 * here lets us return a clean 404 instead of a confusing empty result.
 */
async function loadAcceptedConnection(
  supabase: SupabaseClient,
  connectionId: string,
  userId: string
) {
  const { data: row } = await supabase
    .from("connections")
    .select("id, requester_id, addressee_id, status")
    .eq("id", connectionId)
    .maybeSingle();

  if (
    !row ||
    row.status !== "accepted" ||
    (row.requester_id !== userId && row.addressee_id !== userId)
  ) {
    return null;
  }
  return row;
}

/**
 * Returns the full thread, oldest-first, for one accepted connection. As a
 * side effect, marks every message in the thread NOT sent by the caller as
 * read — opening a thread IS reading it, there's no separate "mark read"
 * call for messages (unlike notifications).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { connectionId } = await params;

  const connection = await loadAcceptedConnection(supabase, connectionId, user.id);
  if (!connection) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const { data: messages, error } = await supabase
    .from("messages")
    .select("id, connection_id, sender_id, body, created_at, read_at")
    .eq("connection_id", connectionId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Could not load conversation" }, { status: 500 });
  }

  const nowIso = new Date().toISOString();
  const { error: markReadError } = await supabase
    .from("messages")
    .update({ read_at: nowIso })
    .eq("connection_id", connectionId)
    .neq("sender_id", user.id)
    .is("read_at", null);
  if (markReadError) {
    // Don't fail the whole thread load just because the read-receipt
    // write failed — the thread itself is more important than the
    // side effect, and this will simply retry next time it's opened.
    console.error("[messages] mark-read failed:", markReadError.message);
  }

  const items = (messages ?? []).map((row) => ({
    id: row.id as string,
    connectionId: row.connection_id as string,
    senderId: row.sender_id as string,
    body: row.body as string,
    createdAt: row.created_at as string,
    readAt:
      row.sender_id !== user.id && row.read_at === null
        ? nowIso
        : (row.read_at as string | null),
  }));

  return NextResponse.json({ items });
}

/**
 * Sends a message in an existing accepted connection's thread. The DB
 * trigger `fan_out_notification()` handles creating the recipient's
 * notification row automatically on insert — this route must never write
 * to `notifications` itself.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { connectionId } = await params;

  let body: { body?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "Message body is required" }, { status: 400 });
  }
  if (text.length > MAX_BODY_LENGTH) {
    return NextResponse.json(
      { error: `Message must be ${MAX_BODY_LENGTH} characters or fewer` },
      { status: 400 }
    );
  }

  const connection = await loadAcceptedConnection(supabase, connectionId, user.id);
  if (!connection) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: sentToday } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("sender_id", user.id)
    .gte("created_at", dayAgo);
  if ((sentToday ?? 0) >= MAX_MESSAGES_PER_DAY) {
    return NextResponse.json(
      { error: "You've reached today's message limit. Try again tomorrow." },
      { status: 429 }
    );
  }

  const { data: inserted, error: insertError } = await supabase
    .from("messages")
    .insert({ connection_id: connectionId, sender_id: user.id, body: text })
    .select("id, connection_id, sender_id, body, created_at, read_at")
    .single();

  if (insertError || !inserted) {
    return NextResponse.json({ error: "Could not send message" }, { status: 500 });
  }

  return NextResponse.json({
    id: inserted.id,
    connectionId: inserted.connection_id,
    senderId: inserted.sender_id,
    body: inserted.body,
    createdAt: inserted.created_at,
    readAt: inserted.read_at,
  });
}
