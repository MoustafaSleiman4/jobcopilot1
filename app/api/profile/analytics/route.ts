import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { deriveDisplayName } from "@/lib/displayName";
import type { ProfileAnalytics, ProfileViewerItem, PostAnalyticsItem } from "@/lib/social-types";

export const runtime = "nodejs";

const RECENT_VIEWERS_LIMIT = 20;
const RECENT_POSTS_LIMIT = 20;

/**
 * The viewer-facing analytics panel on your own profile — "who's viewed
 * your profile," how many times you came up in search, and per-post
 * performance (impressions + the public reaction/comment/repost counts
 * together in one place). Self-only by construction: every underlying
 * table's RLS already scopes reads to the row's subject
 * (viewed_id/searched_user_id/post author), so there's nothing to gate
 * here beyond requiring a signed-in caller.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { count: viewCount7d },
    { count: viewCountTotal },
    { count: searchCount7d },
    { data: recentViewRows },
    { data: myPosts },
  ] = await Promise.all([
    supabase.from("profile_views").select("id", { count: "exact", head: true }).eq("viewed_id", user.id).gte("created_at", sevenDaysAgo),
    supabase.from("profile_views").select("id", { count: "exact", head: true }).eq("viewed_id", user.id),
    supabase.from("search_appearances").select("id", { count: "exact", head: true }).eq("searched_user_id", user.id).gte("created_at", sevenDaysAgo),
    supabase
      .from("profile_views")
      .select("viewer_id, created_at")
      .eq("viewed_id", user.id)
      .order("created_at", { ascending: false })
      .limit(RECENT_VIEWERS_LIMIT),
    supabase
      .from("posts")
      .select("id, body, created_at")
      .eq("author_id", user.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(RECENT_POSTS_LIMIT),
  ]);

  const viewerIds = Array.from(new Set((recentViewRows ?? []).map((row) => row.viewer_id as string)));
  const viewerProfilesById = new Map<string, { full_name: string | null; avatar_url: string | null; email: string | null; private_profile_views: boolean | null }>();
  if (viewerIds.length > 0) {
    const { data: viewerProfiles } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, email, private_profile_views")
      .in("id", viewerIds);
    for (const p of viewerProfiles ?? []) {
      viewerProfilesById.set(p.id as string, p as { full_name: string | null; avatar_url: string | null; email: string | null; private_profile_views: boolean | null });
    }
  }

  const recentViewers: ProfileViewerItem[] = (recentViewRows ?? []).map((row) => {
    const profile = viewerProfilesById.get(row.viewer_id as string);
    // A viewer who turned on "browse privately" stays anonymous in the
    // list — the view still counts toward the totals above, same as
    // LinkedIn's private browsing: the number is real, the identity isn't.
    if (!profile || profile.private_profile_views) {
      return { viewer: null, viewedAt: row.created_at as string };
    }
    return {
      viewer: {
        id: row.viewer_id as string,
        fullName: deriveDisplayName(profile.full_name, profile.email),
        avatarUrl: profile.avatar_url,
        jobTitle: null,
        currentCompany: null,
        country: null,
        email: null,
        phone: null,
      },
      viewedAt: row.created_at as string,
    };
  });

  const postIds = (myPosts ?? []).map((p) => p.id as string);
  const [impressionCounts, reactionRows, commentRows, repostRows] = await Promise.all([
    Promise.all(postIds.map((id) => supabase.rpc("post_impression_count", { target_post_id: id }))),
    postIds.length > 0 ? supabase.from("post_reactions").select("post_id").in("post_id", postIds) : Promise.resolve({ data: [] as never[] }),
    postIds.length > 0
      ? supabase.from("post_comments").select("post_id").in("post_id", postIds).is("deleted_at", null)
      : Promise.resolve({ data: [] as never[] }),
    postIds.length > 0 ? supabase.from("posts").select("repost_of_id").in("repost_of_id", postIds) : Promise.resolve({ data: [] as never[] }),
  ]);

  const impressionByPost = new Map<string, number>();
  postIds.forEach((id, i) => {
    const value = impressionCounts[i]?.data;
    impressionByPost.set(id, typeof value === "number" ? value : 0);
  });

  const countBy = (rows: { post_id?: unknown; repost_of_id?: unknown }[] | null, key: "post_id" | "repost_of_id") => {
    const map = new Map<string, number>();
    for (const row of rows ?? []) {
      const id = row[key] as string | undefined;
      if (!id) continue;
      map.set(id, (map.get(id) ?? 0) + 1);
    }
    return map;
  };
  const reactionByPost = countBy(reactionRows.data as { post_id: string }[] | null, "post_id");
  const commentByPost = countBy(commentRows.data as { post_id: string }[] | null, "post_id");
  const repostByPost = countBy(repostRows.data as { repost_of_id: string }[] | null, "repost_of_id");

  const posts: PostAnalyticsItem[] = (myPosts ?? []).map((p) => ({
    postId: p.id as string,
    createdAt: p.created_at as string,
    bodyPreview: ((p.body as string) || "").slice(0, 140),
    impressionCount: impressionByPost.get(p.id as string) ?? 0,
    reactionCount: reactionByPost.get(p.id as string) ?? 0,
    commentCount: commentByPost.get(p.id as string) ?? 0,
    repostCount: repostByPost.get(p.id as string) ?? 0,
  }));

  const result: ProfileAnalytics = {
    profileViewCount7d: viewCount7d ?? 0,
    profileViewCount: viewCountTotal ?? 0,
    recentViewers,
    searchAppearanceCount7d: searchCount7d ?? 0,
    posts,
  };

  return NextResponse.json(result);
}
