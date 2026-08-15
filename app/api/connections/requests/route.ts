import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { visibleContact } from "@/lib/contactVisibility";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 20;

/**
 * Pending connection requests addressed to the caller. Same "fetch rows,
 * then batch-fetch profiles" approach as GET /api/connections — see that
 * route's comment for why (no FK from connections to profiles for
 * PostgREST to embed through).
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
    .select("id, requester_id, created_at")
    .eq("status", "pending")
    .eq("addressee_id", user.id)
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
    return NextResponse.json({ error: "Could not load connection requests" }, { status: 500 });
  }

  const requesterIds = Array.from(new Set((rows ?? []).map((row) => row.requester_id as string)));
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
    }
  >();
  if (requesterIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, job_title, current_company, email, phone, show_email, show_phone")
      .in("id", requesterIds);
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
      });
    }
  }

  const items = (rows ?? []).map((row) => {
    const profile = profilesById.get(row.requester_id as string);
    const contact = profile ? visibleContact(profile, user.id) : { email: null, phone: null };
    return {
      connectionId: row.id,
      person: {
        id: row.requester_id,
        fullName: profile?.full_name ?? null,
        avatarUrl: profile?.avatar_url ?? null,
        jobTitle: profile?.job_title ?? null,
        currentCompany: profile?.current_company ?? null,
        email: contact.email,
        phone: contact.phone,
      },
    };
  });

  const last = rows && rows.length > 0 ? rows[rows.length - 1] : null;
  const nextCursor = last && rows && rows.length === limit ? `${last.created_at}_${last.id}` : null;

  return NextResponse.json({ items, nextCursor });
}
