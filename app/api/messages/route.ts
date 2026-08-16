import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { visibleContact } from "@/lib/contactVisibility";
import { deriveDisplayName } from "@/lib/displayName";

export const runtime = "nodejs";

// Same threshold as app/api/connections/route.ts (see the comment there) —
// kept identical so "online" means the same thing everywhere in the app.
const ONLINE_WINDOW_MS = 2 * 60 * 1000;

type ProfileRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  job_title: string | null;
  current_company: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  show_email: boolean | null;
  show_phone: boolean | null;
  last_seen_at: string | null;
};

/**
 * Lists one entry per *accepted* connection — not just ones with existing
 * messages — so a user can start a first message from this list rather
 * than only from a connection's profile (see task notes). `connections`
 * references `auth.users`, not `profiles`, so (as in GET /api/connections)
 * we fetch the connection rows first and batch-fetch the other-party
 * profiles separately.
 *
 * For the last-message/unread-count per connection, a single call to the
 * messages_thread_summary() SQL function (supabase/performance-indexes.sql)
 * fetches all of them at once — this used to be 2 queries PER connection
 * run via Promise.all, which is correct but means N conversations meant
 * 2*N round-trips to Supabase on every inbox load. Round-trip count, not
 * row-scan cost, is what actually drives perceived latency here, so this
 * collapses it to exactly one call regardless of how many conversations
 * exist. The function itself still scopes each lookup to its own
 * connection_id (via a per-row LATERAL join, not one giant history scan),
 * preserving the original reasoning: a person's connection count is
 * bounded, but total message history across all threads isn't.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: rows, error } = await supabase
    .from("connections")
    .select("id, requester_id, addressee_id, created_at")
    .eq("status", "accepted")
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

  if (error) {
    return NextResponse.json({ error: "Could not load conversations" }, { status: 500 });
  }

  const connections = rows ?? [];

  const otherIds = connections.map((row) =>
    row.requester_id === user.id ? row.addressee_id : row.requester_id
  );
  const uniqueOtherIds = Array.from(new Set(otherIds));

  const profilesById = new Map<string, ProfileRow>();
  if (uniqueOtherIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, job_title, current_company, country, email, phone, show_email, show_phone, last_seen_at")
      .in("id", uniqueOtherIds);
    for (const profile of profiles ?? []) {
      profilesById.set(profile.id as string, profile as ProfileRow);
    }
  }

  const now = Date.now();

  const summaryByConnectionId = new Map<
    string,
    { last_body: string | null; last_created_at: string | null; last_sender_id: string | null; unread_count: number }
  >();
  if (connections.length > 0) {
    const { data: summaries } = await supabase.rpc("messages_thread_summary", {
      connection_ids: connections.map((row) => row.id),
      viewer_id: user.id,
    });
    for (const row of (summaries ?? []) as Array<{
      connection_id: string;
      last_body: string | null;
      last_created_at: string | null;
      last_sender_id: string | null;
      unread_count: number;
    }>) {
      summaryByConnectionId.set(row.connection_id, row);
    }
  }

  const items = connections.map((row) => {
    const otherId = row.requester_id === user.id ? row.addressee_id : row.requester_id;
    const profile = profilesById.get(otherId);
    const contact = profile ? visibleContact(profile, user.id) : { email: null, phone: null };
    const lastSeenAt = profile?.last_seen_at ?? null;
    const summary = summaryByConnectionId.get(row.id);

    const lastMessage =
      summary?.last_created_at != null
        ? {
            body: summary.last_body as string,
            createdAt: summary.last_created_at,
            senderId: summary.last_sender_id as string,
          }
        : null;

    return {
      connectionId: row.id,
      person: {
        id: otherId,
        fullName: deriveDisplayName(profile?.full_name ?? null, profile?.email ?? null),
        avatarUrl: profile?.avatar_url ?? null,
        jobTitle: profile?.job_title ?? null,
        currentCompany: profile?.current_company ?? null,
        country: profile?.country ?? null,
        email: contact.email,
        phone: contact.phone,
        isOnline: lastSeenAt ? now - new Date(lastSeenAt).getTime() < ONLINE_WINDOW_MS : false,
        lastSeenAt,
      },
      lastMessage,
      unreadCount: summary?.unread_count ?? 0,
    };
  });

  // Most-recent-activity first: the last message's created_at if there is
  // one, otherwise the connection's own created_at (a freshly-accepted
  // connection with no messages yet still shows up, just below any thread
  // that already has activity).
  items.sort((a, b) => {
    const aTime = new Date(
      a.lastMessage?.createdAt ?? connections.find((c) => c.id === a.connectionId)!.created_at
    ).getTime();
    const bTime = new Date(
      b.lastMessage?.createdAt ?? connections.find((c) => c.id === b.connectionId)!.created_at
    ).getTime();
    return bTime - aTime;
  });

  return NextResponse.json({ items });
}
