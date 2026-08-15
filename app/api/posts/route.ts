import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_BODY_LENGTH = 3000; // matches posts.body's DB check constraint
const MAX_PER_DAY = 20;
const DEFAULT_LIMIT = 20;

type MediaInput = {
  storagePath: string;
  mediaType: "image" | "video";
  orderIndex: number;
};

/**
 * The client uploads media directly to the `post-media` storage bucket
 * first (same upload-then-persist order as the existing resume-photo
 * pattern in app/[locale]/dashboard/resume/page.tsx), then calls this
 * route with the already-uploaded paths. This route never touches
 * Storage — it only persists the post row + post_media rows that point at
 * paths the client already wrote.
 *
 * Post + media inserts are not wrapped in a DB transaction: if the post
 * insert succeeds but a post_media insert then fails, we log it and still
 * return success for the post — matching how invite/route.ts treats its
 * referrals upsert as non-fatal after the email already went out. Worst
 * case for v1: a post with fewer media rows than intended, not a stuck
 * request.
 */
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let payload: { body?: unknown; media?: unknown };
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

  const rawMedia = Array.isArray(payload.media) ? payload.media : [];
  const media: MediaInput[] = [];
  for (const item of rawMedia) {
    if (!item || typeof item !== "object") continue;
    const storagePath = (item as Record<string, unknown>).storagePath;
    const mediaType = (item as Record<string, unknown>).mediaType;
    const orderIndex = (item as Record<string, unknown>).orderIndex;
    if (typeof storagePath !== "string" || !storagePath) continue;
    if (mediaType !== "image" && mediaType !== "video") continue;
    if (typeof orderIndex !== "number") continue;
    media.push({ storagePath, mediaType, orderIndex });
  }
  // UX guidance only — the storage bucket's own 100MB file_size_limit is
  // the real enforcement point; this just keeps a post from mixing a
  // video with images (see the storage-setup migration notes) or piling
  // up more images than the UI is designed to lay out.
  const videoCount = media.filter((m) => m.mediaType === "video").length;
  const imageCount = media.filter((m) => m.mediaType === "image").length;
  if (videoCount > 0 && imageCount > 0) {
    return NextResponse.json({ error: "A post can include images or a video, not both" }, { status: 400 });
  }
  if (videoCount > 1) {
    return NextResponse.json({ error: "Only one video per post" }, { status: 400 });
  }
  if (imageCount > 6) {
    return NextResponse.json({ error: "Up to 6 images per post" }, { status: 400 });
  }

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: postedToday } = await supabase
    .from("posts")
    .select("id", { count: "exact", head: true })
    .eq("author_id", user.id)
    .gte("created_at", dayAgo);
  if ((postedToday ?? 0) >= MAX_PER_DAY) {
    return NextResponse.json(
      { error: "You've reached today's posting limit. Try again tomorrow." },
      { status: 429 }
    );
  }

  const { data: post, error: postError } = await supabase
    .from("posts")
    .insert({ author_id: user.id, body: text })
    .select("id, author_id, body, created_at, edited_at, deleted_at")
    .single();

  if (postError || !post) {
    return NextResponse.json({ error: "Could not create post" }, { status: 500 });
  }

  if (media.length > 0) {
    const { error: mediaError } = await supabase.from("post_media").insert(
      media.map((m) => ({
        post_id: post.id,
        media_type: m.mediaType,
        storage_path: m.storagePath,
        order_index: m.orderIndex,
      }))
    );
    if (mediaError) {
      // Non-fatal — see the function comment above.
      console.error("[posts] post_media insert failed for post", post.id, mediaError.message);
    }
  }

  // The client feeds this response straight into the feed's PostCard list
  // (see PostComposer's onPosted callback) without a page reload, so it
  // must be a fully-shaped PostItem — the same shape GET /api/posts
  // returns — not the bare inserted row. Returning just the DB columns
  // here previously crashed PostCard on `post.author.id` (undefined),
  // which from the user's side looked exactly like "posting doesn't work"
  // even though the row had actually saved.
  const { data: authorProfile } = await supabase
    .from("profiles")
    .select("full_name, avatar_url, job_title, current_company")
    .eq("id", user.id)
    .maybeSingle();

  const postItem = {
    id: post.id,
    body: post.body,
    createdAt: post.created_at,
    editedAt: post.edited_at,
    author: {
      id: user.id,
      fullName: authorProfile?.full_name ?? null,
      avatarUrl: authorProfile?.avatar_url ?? null,
      jobTitle: authorProfile?.job_title ?? null,
      currentCompany: authorProfile?.current_company ?? null,
      // Contact info is never surfaced on post authors, regardless of
      // show_email/show_phone — the feed isn't a context that calls for it.
      email: null,
      phone: null,
    },
    media: media.map((m) => ({ mediaType: m.mediaType, storagePath: m.storagePath, orderIndex: m.orderIndex })),
    reactionCount: 0,
    viewerHasReacted: false,
    commentCount: 0,
  };

  return NextResponse.json({ post: postItem }, { status: 201 });
}

/**
 * Feed: keyset-paginated (`?cursor=<createdAt>_<id>&limit=`), ordered
 * created_at desc, id desc — avoids the skip/duplicate glitches offset
 * pagination gets under concurrent inserts. Each post is joined with the
 * author's profile, its media rows, its reaction count, whether the
 * caller reacted, and its top-level comment count. Comment *bodies* are
 * intentionally not included here — those come from
 * GET /api/posts/[id]/comments, fetched per-post on demand.
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
    .from("posts")
    .select("id, author_id, body, created_at, edited_at, deleted_at")
    .is("deleted_at", null)
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

  const { data: posts, error } = await query;
  if (error) {
    return NextResponse.json({ error: "Could not load feed" }, { status: 500 });
  }

  const postIds = (posts ?? []).map((p) => p.id as string);
  const authorIds = Array.from(new Set((posts ?? []).map((p) => p.author_id as string)));

  const [profilesRes, mediaRes, reactionsRes, myReactionsRes, commentsRes] = await Promise.all([
    authorIds.length > 0
      ? supabase.from("profiles").select("id, full_name, avatar_url, job_title, current_company").in("id", authorIds)
      : Promise.resolve({ data: [] as never[] }),
    postIds.length > 0
      ? supabase.from("post_media").select("id, post_id, media_type, storage_path, order_index").in("post_id", postIds).order("order_index", { ascending: true })
      : Promise.resolve({ data: [] as never[] }),
    postIds.length > 0
      ? supabase.from("post_reactions").select("post_id").in("post_id", postIds)
      : Promise.resolve({ data: [] as never[] }),
    postIds.length > 0
      ? supabase.from("post_reactions").select("post_id").in("post_id", postIds).eq("user_id", user.id)
      : Promise.resolve({ data: [] as never[] }),
    postIds.length > 0
      ? supabase.from("post_comments").select("post_id").in("post_id", postIds).is("deleted_at", null).is("parent_comment_id", null)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const profilesById = new Map<string, Record<string, unknown>>();
  for (const profile of profilesRes.data ?? []) {
    profilesById.set((profile as Record<string, unknown>).id as string, profile as Record<string, unknown>);
  }

  const mediaByPost = new Map<string, Record<string, unknown>[]>();
  for (const row of mediaRes.data ?? []) {
    const postId = (row as Record<string, unknown>).post_id as string;
    const list = mediaByPost.get(postId) ?? [];
    list.push(row as Record<string, unknown>);
    mediaByPost.set(postId, list);
  }

  const reactionCountByPost = new Map<string, number>();
  for (const row of reactionsRes.data ?? []) {
    const postId = (row as Record<string, unknown>).post_id as string;
    reactionCountByPost.set(postId, (reactionCountByPost.get(postId) ?? 0) + 1);
  }

  const myReactedPosts = new Set((myReactionsRes.data ?? []).map((row) => (row as Record<string, unknown>).post_id as string));

  const commentCountByPost = new Map<string, number>();
  for (const row of commentsRes.data ?? []) {
    const postId = (row as Record<string, unknown>).post_id as string;
    commentCountByPost.set(postId, (commentCountByPost.get(postId) ?? 0) + 1);
  }

  const items = (posts ?? []).map((post) => {
    const author = profilesById.get(post.author_id as string);
    const media = (mediaByPost.get(post.id as string) ?? []).map((m) => ({
      id: m.id,
      mediaType: m.media_type,
      storagePath: m.storage_path,
      orderIndex: m.order_index,
    }));
    return {
      id: post.id,
      body: post.body,
      createdAt: post.created_at,
      editedAt: post.edited_at,
      author: {
        id: post.author_id,
        fullName: author?.full_name ?? null,
        avatarUrl: author?.avatar_url ?? null,
        jobTitle: author?.job_title ?? null,
        currentCompany: author?.current_company ?? null,
        email: null,
        phone: null,
      },
      media,
      reactionCount: reactionCountByPost.get(post.id as string) ?? 0,
      // Field name must match lib/social-types.ts's PostItem.viewerHasReacted
      // and what PostCard.tsx actually reads — this was previously named
      // `hasReacted` here, a silent mismatch that made every post's like
      // button reset to "not liked" on every feed load regardless of the
      // viewer's real reaction.
      viewerHasReacted: myReactedPosts.has(post.id as string),
      commentCount: commentCountByPost.get(post.id as string) ?? 0,
    };
  });

  const last = posts && posts.length > 0 ? posts[posts.length - 1] : null;
  const nextCursor = last && posts && posts.length === limit ? `${last.created_at}_${last.id}` : null;

  return NextResponse.json({ items, nextCursor });
}
