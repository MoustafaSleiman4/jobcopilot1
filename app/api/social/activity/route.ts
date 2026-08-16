import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Powers the homepage's "growing community" stat strip — the same "show
 * real scale, don't just claim it" idea as app/api/jobs/showcase, applied to
 * the social network instead of job listings. Deliberately exposes nothing
 * but aggregate counts: no names, no post content, no who's-connected-to-
 * whom. That matters here specifically because Posts and Connections are
 * otherwise private (posts are visible only to your network — see
 * supabase/posts-network-visibility.sql — and connections are only visible
 * to the two people involved), so an anonymous homepage visitor must never
 * see anything more identifying than a total count.
 *
 * Uses the service-role admin client (same reasoning as jobs/showcase) —
 * counting across every user's rows is exactly the kind of cross-user read
 * RLS is designed to block for the anon role, and there's no
 * security-definer function for this (unlike connection_count()/
 * mutual_connections(), which are scoped to a single caller+target pair) —
 * a raw platform-wide count has no "caller" to scope by, so a server-only
 * admin-client route is the right shape, not a new SQL function grant.
 */
export async function GET() {
  try {
    const admin = createAdminClient();

    const [membersRes, connectionsRes, postsRes] = await Promise.all([
      admin.from("profiles").select("id", { count: "exact", head: true }),
      admin.from("connections").select("id", { count: "exact", head: true }).eq("status", "accepted"),
      admin.from("posts").select("id", { count: "exact", head: true }).is("deleted_at", null),
    ]);

    return NextResponse.json(
      {
        members: membersRes.count ?? 0,
        connections: connectionsRes.count ?? 0,
        posts: postsRes.count ?? 0,
      },
      { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" } }
    );
  } catch {
    // Supabase not configured, or a transient error — the homepage's
    // SocialActivityStrip simply stays hidden until a real fetch succeeds,
    // same fallback behavior as JobsShowcase's live stats.
    return NextResponse.json({ error: "Could not load activity stats" }, { status: 500 });
  }
}
