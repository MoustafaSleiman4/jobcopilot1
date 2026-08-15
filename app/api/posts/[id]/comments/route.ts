import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { deriveDisplayName } from "@/lib/displayName";

export const runtime = "nodejs";

const MAX_BODY_LENGTH = 1000;
const MAX_PER_HOUR = 60;

/**
 * Top-level comments + one level of replies for a post, oldest-first, each
 * joined with the commenter's profile. `post_comments.author_id`
 * references `auth.users`, not `profiles`, so (same as connections/posts)
 * we fetch comments then batch-fetch profiles rather than relying on a
 * PostgREST FK embed.
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

  const { data: comments, error } = await supabase
    .from("post_comments")
    .select("id, post_id, author_id, parent_comment_id, body, created_at")
    .eq("post_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Could not load comments" }, { status: 500 });
  }

  const authorIds = Array.from(new Set((comments ?? []).map((c) => c.author_id as string)));
  const profilesById = new Map<string, { full_name: string | null; avatar_url: string | null; email: string | null }>();
  if (authorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, email")
      .in("id", authorIds);
    for (const profile of profiles ?? []) {
      profilesById.set(profile.id as string, {
        full_name: profile.full_name as string | null,
        avatar_url: profile.avatar_url as string | null,
        email: profile.email as string | null,
      });
    }
  }

  const toShape = (comment: (typeof comments)[number]) => {
    const author = profilesById.get(comment.author_id as string);
    return {
      id: comment.id,
      postId: comment.post_id,
      parentCommentId: comment.parent_comment_id,
      body: comment.body,
      createdAt: comment.created_at,
      author: {
        id: comment.author_id,
        fullName: deriveDisplayName(author?.full_name ?? null, author?.email ?? null),
        avatarUrl: author?.avatar_url ?? null,
      },
    };
  };

  const topLevel = (comments ?? []).filter((c) => !c.parent_comment_id).map(toShape);
  const repliesByParent = new Map<string, ReturnType<typeof toShape>[]>();
  for (const comment of comments ?? []) {
    if (!comment.parent_comment_id) continue;
    const list = repliesByParent.get(comment.parent_comment_id as string) ?? [];
    list.push(toShape(comment));
    repliesByParent.set(comment.parent_comment_id as string, list);
  }

  const items = topLevel.map((comment) => ({
    ...comment,
    replies: repliesByParent.get(comment.id as string) ?? [],
  }));

  return NextResponse.json({ items });
}

/**
 * Add a comment, or a reply to a top-level comment. The "one level of
 * replies only" rule is enforced here server-side (not just trusted from
 * the client): if `parentCommentId` is given, we look it up and reject
 * unless it belongs to the same post and itself has no parent.
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

  let payload: { body?: unknown; parentCommentId?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const text = typeof payload.body === "string" ? payload.body.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "Comment can't be empty" }, { status: 400 });
  }
  if (text.length > MAX_BODY_LENGTH) {
    return NextResponse.json(
      { error: `Comments can be at most ${MAX_BODY_LENGTH} characters` },
      { status: 400 }
    );
  }

  const parentCommentId =
    typeof payload.parentCommentId === "string" && payload.parentCommentId ? payload.parentCommentId : null;

  if (parentCommentId) {
    const { data: parent, error: parentError } = await supabase
      .from("post_comments")
      .select("id, post_id, parent_comment_id")
      .eq("id", parentCommentId)
      .maybeSingle();

    if (parentError || !parent) {
      return NextResponse.json({ error: "Comment being replied to was not found" }, { status: 404 });
    }
    if (parent.post_id !== id) {
      return NextResponse.json({ error: "Comment being replied to belongs to a different post" }, { status: 400 });
    }
    if (parent.parent_comment_id) {
      return NextResponse.json({ error: "Replies can only be one level deep" }, { status: 400 });
    }
  }

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: commentedThisHour } = await supabase
    .from("post_comments")
    .select("id", { count: "exact", head: true })
    .eq("author_id", user.id)
    .gte("created_at", hourAgo);
  if ((commentedThisHour ?? 0) >= MAX_PER_HOUR) {
    return NextResponse.json(
      { error: "You've reached the hourly comment limit. Try again soon." },
      { status: 429 }
    );
  }

  const { data: comment, error } = await supabase
    .from("post_comments")
    .insert({
      post_id: id,
      author_id: user.id,
      parent_comment_id: parentCommentId,
      body: text,
    })
    .select("id, post_id, author_id, parent_comment_id, body, created_at")
    .single();

  if (error || !comment) {
    return NextResponse.json({ error: "Could not add comment" }, { status: 500 });
  }

  // CommentThread.tsx feeds this response straight into its comment list
  // without a refetch and reads `comment.author.fullName` unconditionally —
  // the same shape contract as POST /api/posts, and the same bug that
  // route had (returning the bare inserted row instead of a full
  // CommentItem) previously made posting silently crash right after a
  // successful insert. Constructing the full author shape here avoids
  // repeating that.
  const { data: authorProfile } = await supabase
    .from("profiles")
    .select("full_name, avatar_url, email")
    .eq("id", user.id)
    .maybeSingle();

  const commentItem = {
    id: comment.id,
    postId: comment.post_id,
    parentCommentId: comment.parent_comment_id,
    body: comment.body,
    createdAt: comment.created_at,
    author: {
      id: user.id,
      fullName: deriveDisplayName(authorProfile?.full_name ?? null, authorProfile?.email ?? user.email ?? null),
      avatarUrl: authorProfile?.avatar_url ?? null,
    },
  };

  return NextResponse.json({ comment: commentItem }, { status: 201 });
}
