import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { deriveDisplayName } from "@/lib/displayName";

export const runtime = "nodejs";

const MAX_BODY_LENGTH = 3000;

/**
 * Single-post fetch, used by the notification deep-link
 * (/dashboard/posts?postId=...) to pull in a post that isn't on the
 * viewer's currently-loaded feed page — same PostItem shape GET /api/posts
 * returns, just scoped to one id instead of a cursor page. RLS (the
 * network-visibility policy on `posts`) already returns nothing if the
 * viewer isn't allowed to see this post, so a stale/foreign notification
 * link degrades to "not found" rather than leaking the post.
 */
export async function GET(
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

  const { data: post, error } = await supabase
    .from("posts")
    .select("id, author_id, body, created_at, edited_at, deleted_at")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  const [{ data: authorProfile }, { data: media }, { count: reactionCount }, { data: myReaction }, { count: commentCount }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, avatar_url, job_title, current_company, email")
        .eq("id", post.author_id)
        .maybeSingle(),
      supabase
        .from("post_media")
        .select("id, media_type, storage_path, order_index")
        .eq("post_id", post.id)
        .order("order_index", { ascending: true }),
      supabase.from("post_reactions").select("post_id", { count: "exact", head: true }).eq("post_id", post.id),
      supabase.from("post_reactions").select("post_id").eq("post_id", post.id).eq("user_id", user.id).maybeSingle(),
      supabase
        .from("post_comments")
        .select("id", { count: "exact", head: true })
        .eq("post_id", post.id)
        .is("deleted_at", null)
        .is("parent_comment_id", null),
    ]);

  const postItem = {
    id: post.id,
    body: post.body,
    createdAt: post.created_at,
    editedAt: post.edited_at,
    author: {
      id: post.author_id,
      fullName: deriveDisplayName(authorProfile?.full_name ?? null, authorProfile?.email ?? null),
      avatarUrl: authorProfile?.avatar_url ?? null,
      jobTitle: authorProfile?.job_title ?? null,
      currentCompany: authorProfile?.current_company ?? null,
      email: null,
      phone: null,
    },
    media: (media ?? []).map((m) => ({
      mediaType: m.media_type,
      storagePath: m.storage_path,
      orderIndex: m.order_index,
    })),
    reactionCount: reactionCount ?? 0,
    viewerHasReacted: Boolean(myReaction),
    commentCount: commentCount ?? 0,
  };

  return NextResponse.json({ post: postItem });
}

/** Edit a post's text. RLS scopes the update to `auth.uid() = author_id`. */
export async function PATCH(
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

  let payload: { body?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const text = typeof payload.body === "string" ? payload.body.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "Post body can't be empty" }, { status: 400 });
  }
  if (text.length > MAX_BODY_LENGTH) {
    return NextResponse.json(
      { error: `Posts can be at most ${MAX_BODY_LENGTH} characters` },
      { status: 400 }
    );
  }

  const { data: updated, error, count } = await supabase
    .from("posts")
    .update({ body: text, edited_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", id)
    .select("id, body, edited_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Could not update post" }, { status: 500 });
  }
  if (!updated && !count) {
    // Either the post doesn't exist, or RLS blocked it because the caller
    // isn't the author — both look the same from here, so we don't leak
    // which one it was.
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  return NextResponse.json({ post: updated });
}

/**
 * Soft delete only — `posts` intentionally has no DB delete policy (see
 * the schema migration notes), so a real `.delete()` call would be
 * rejected by RLS. `.update({ deleted_at: now() })` is the actual removal
 * path, scoped to the author by RLS.
 */
export async function DELETE(
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

  const { data: updated, error, count } = await supabase
    .from("posts")
    .update({ deleted_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Could not delete post" }, { status: 500 });
  }
  if (!updated && !count) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
