import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { shapePostRows } from "@/lib/server/postShaping";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 20;

/** The viewer's "Saved" tab — cursor-paginated by when each post was saved, same shape/convention as GET /api/posts. */
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
    .from("saved_posts")
    .select("post_id, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .order("post_id", { ascending: false })
    .limit(limit);

  if (cursor) {
    const [cursorCreatedAt, cursorId] = cursor.split("_");
    if (cursorCreatedAt && cursorId) {
      query = query.or(`created_at.lt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},post_id.lt.${cursorId})`);
    }
  }

  const { data: savedRows, error } = await query;
  if (error) {
    return NextResponse.json({ error: "Could not load saved posts" }, { status: 500 });
  }

  const postIds = (savedRows ?? []).map((r) => r.post_id as string);
  const savedAtByPost = new Map((savedRows ?? []).map((r) => [r.post_id as string, r.created_at as string]));

  const { data: posts } =
    postIds.length > 0
      ? await supabase.from("posts").select("id, author_id, body, created_at, edited_at, deleted_at, repost_of_id").in("id", postIds).is("deleted_at", null)
      : { data: [] as never[] };

  // Preserve "most recently saved first" ordering — the posts query above
  // has no guaranteed order relative to savedRows.
  const postsById = new Map((posts ?? []).map((p) => [p.id as string, p]));
  const orderedPosts = postIds.map((id) => postsById.get(id)).filter((p): p is NonNullable<typeof p> => Boolean(p));

  const items = await shapePostRows(supabase, orderedPosts, user.id);

  const last = savedRows && savedRows.length > 0 ? savedRows[savedRows.length - 1] : null;
  const nextCursor = last && savedRows.length === limit ? `${savedAtByPost.get(last.post_id as string)}_${last.post_id}` : null;

  return NextResponse.json({ items, nextCursor });
}
