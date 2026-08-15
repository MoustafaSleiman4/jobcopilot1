import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { visibleContact } from "@/lib/contactVisibility";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 20;
// A user is considered "online" if their presence heartbeat landed within
// this window (see app/api/presence/heartbeat/route.ts) — a simple
// threshold on a persisted timestamp rather than a live socket/presence
// channel, so it's resilient to a tab closing without a clean disconnect
// (a dropped socket would otherwise leave someone stuck "online" forever)
// and it gives "last seen" for free from the same column.
const ONLINE_WINDOW_MS = 2 * 60 * 1000;

/**
 * `connections.requester_id`/`addressee_id` reference `auth.users`, not
 * `public.profiles` directly, so there's no FK PostgREST can use to embed
 * profiles automatically (`profiles!requester_id(...)`). Instead we fetch
 * the connection rows, then batch-fetch the "other party" profiles in one
 * extra query — simpler and just as cheap as a join for these page sizes.
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
    .from("connections")
    .select("id, requester_id, addressee_id, created_at")
    .eq("status", "accepted")
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
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
    return NextResponse.json({ error: "Could not load connections" }, { status: 500 });
  }

  const otherIds = (rows ?? []).map((row) =>
    row.requester_id === user.id ? row.addressee_id : row.requester_id
  );
  const uniqueOtherIds = Array.from(new Set(otherIds));

  const profilesById = new Map<
    string,
    {
      id: string;
      full_name: string | null;
      avatar_url: string | null;
      job_title: string | null;
      current_company: string | null;
      email: string | null;
      phone: string | null;
      show_email: boolean | null;
      show_phone: boolean | null;
      last_seen_at: string | null;
    }
  >();
  if (uniqueOtherIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, job_title, current_company, email, phone, show_email, show_phone, last_seen_at")
      .in("id", uniqueOtherIds);
    for (const profile of profiles ?? []) {
      profilesById.set(profile.id as string, profile as {
        id: string;
        full_name: string | null;
        avatar_url: string | null;
        job_title: string | null;
        current_company: string | null;
        email: string | null;
        phone: string | null;
        show_email: boolean | null;
        show_phone: boolean | null;
        last_seen_at: string | null;
      });
    }
  }

  const now = Date.now();
  const items = (rows ?? []).map((row) => {
    const otherId = row.requester_id === user.id ? row.addressee_id : row.requester_id;
    const profile = profilesById.get(otherId);
    const contact = profile ? visibleContact(profile, user.id) : { email: null, phone: null };
    const lastSeenAt = profile?.last_seen_at ?? null;
    return {
      connectionId: row.id,
      person: {
        id: otherId,
        fullName: profile?.full_name ?? null,
        avatarUrl: profile?.avatar_url ?? null,
        jobTitle: profile?.job_title ?? null,
        currentCompany: profile?.current_company ?? null,
        email: contact.email,
        phone: contact.phone,
        isOnline: lastSeenAt ? now - new Date(lastSeenAt).getTime() < ONLINE_WINDOW_MS : false,
        lastSeenAt,
      },
    };
  });

  const last = rows && rows.length > 0 ? rows[rows.length - 1] : null;
  const nextCursor = last && rows && rows.length === limit ? `${last.created_at}_${last.id}` : null;

  return NextResponse.json({ items, nextCursor });
}
