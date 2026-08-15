import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { deriveDisplayName } from "@/lib/displayName";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 20;

/**
 * Notifications are written exclusively by the `fan_out_notification()` DB
 * trigger — this route only ever reads/updates `read_at`, never inserts.
 * `notifications.actor_id` references `auth.users`, not `profiles`, so
 * (same as elsewhere in this API) we fetch notification rows then
 * batch-fetch actor profiles rather than relying on a PostgREST FK embed.
 */
export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 50) : DEFAULT_LIMIT;
  const cursor = url.searchParams.get("cursor");

  let query = supabase
    .from("notifications")
    .select("id, actor_id, type, post_id, connection_id, comment_id, message_id, read_at, created_at")
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (cursor) {
    const [cursorCreatedAt, cursorId] = cursor.split("_");
    if (cursorCreatedAt && cursorId) {
      query = query.or(
        `created_at.lt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.lt.${cursorId})`
      );
    }
  }

  const { data: rows, error } = await query;
  if (error) {
    return NextResponse.json({ error: "Could not load notifications" }, { status: 500 });
  }

  const actorIds = Array.from(new Set((rows ?? []).map((row) => row.actor_id as string).filter(Boolean)));
  const profilesById = new Map<string, { full_name: string | null; avatar_url: string | null; email: string | null }>();
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, email")
      .in("id", actorIds);
    for (const profile of profiles ?? []) {
      profilesById.set(profile.id as string, {
        full_name: profile.full_name as string | null,
        avatar_url: profile.avatar_url as string | null,
        email: profile.email as string | null,
      });
    }
  }

  const items = (rows ?? []).map((row) => {
    const actor = row.actor_id ? profilesById.get(row.actor_id as string) : undefined;
    return {
      id: row.id,
      type: row.type,
      postId: row.post_id,
      connectionId: row.connection_id,
      commentId: row.comment_id,
      messageId: row.message_id,
      readAt: row.read_at,
      createdAt: row.created_at,
      // Always an object (never null) to match NotificationItem — actor_id
      // is nullable in the DB (set null if that account is later deleted),
      // so this falls back to empty fields rather than null, since
      // NotificationBell/the notifications page read `n.actor.fullName`
      // directly without a null-guard on `actor` itself.
      actor: { fullName: deriveDisplayName(actor?.full_name ?? null, actor?.email ?? null), avatarUrl: actor?.avatar_url ?? null },
    };
  });

  const last = rows && rows.length > 0 ? rows[rows.length - 1] : null;
  const nextCursor = last && rows && rows.length === limit ? `${last.created_at}_${last.id}` : null;

  return NextResponse.json({ items, nextCursor });
}
