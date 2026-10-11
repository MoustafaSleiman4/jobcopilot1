import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { shapePostRows } from "@/lib/server/postShaping";
import { extractHashtags, extractMentionIds } from "@/lib/postText";

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

  // Hashtags/mentions: extracted server-side from the final saved body
  // (not trusted from the client) — see lib/postText.ts. Both are
  // non-fatal on failure for the same reason the media insert above is:
  // the post itself already saved successfully.
  const hashtags = extractHashtags(text);
  if (hashtags.length > 0) {
    const { error: hashtagError } = await supabase.from("post_hashtags").insert(hashtags.map((tag) => ({ post_id: post.id, tag })));
    if (hashtagError) console.error("[posts] post_hashtags insert failed for post", post.id, hashtagError.message);
  }
  const mentionIds = extractMentionIds(text).filter((id) => id !== user.id);
  if (mentionIds.length > 0) {
    const { error: mentionError } = await supabase
      .from("post_mentions")
      .insert(mentionIds.map((mentionedUserId) => ({ post_id: post.id, mentioned_user_id: mentionedUserId })));
    if (mentionError) console.error("[posts] post_mentions insert failed for post", post.id, mentionError.message);
  }

  // The client feeds this response straight into the feed's PostCard list
  // (see PostComposer's onPosted callback) without a page reload, so it
  // must be a fully-shaped PostItem — the same shape GET /api/posts
  // returns — not the bare inserted row. Returning just the DB columns
  // here previously crashed PostCard on `post.author.id` (undefined),
  // which from the user's side looked exactly like "posting doesn't work"
  // even though the row had actually saved. Now built via shapePostRows()
  // (which involves a few extra, already-empty-for-a-brand-new-post
  // queries like reactions/comments) rather than hand-assembled, so this
  // response can never again drift from GET /api/posts's shape by a field.
  const [shaped] = await shapePostRows(supabase, [{ id: post.id, author_id: user.id, body: post.body, created_at: post.created_at, edited_at: post.edited_at, repost_of_id: null }], user.id);

  return NextResponse.json({ post: shaped }, { status: 201 });
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
  // #hashtag discovery (clicking a hashtag link — see lib/socialFormat.tsx)
  // and "only what I've saved" (the Saved tab) both reuse this same feed
  // query shape rather than being separate endpoints, since they're really
  // just the normal feed with one extra filter.
  const hashtag = (url.searchParams.get("hashtag") ?? "").trim().toLowerCase();
  // "Posts" tab on a profile page (app/[locale]/dashboard/profile/[id]) —
  // same feed shape, filtered to one author. Deliberately NOT restricted
  // to reposts-excluded: a repost IS a `posts` row with this author_id, so
  // it correctly shows up on the reposter's own profile feed, same as a
  // plain post would.
  const authorId = url.searchParams.get("authorId");

  let postIdFilter: string[] | null = null;
  if (hashtag) {
    const { data: taggedRows } = await supabase.from("post_hashtags").select("post_id").eq("tag", hashtag);
    postIdFilter = (taggedRows ?? []).map((r) => r.post_id as string);
    if (postIdFilter.length === 0) {
      return NextResponse.json({ items: [], nextCursor: null });
    }
  }

  let query = supabase
    .from("posts")
    .select("id, author_id, body, created_at, edited_at, deleted_at, repost_of_id")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (postIdFilter) {
    query = query.in("id", postIdFilter);
  }
  if (authorId) {
    query = query.eq("author_id", authorId);
  }

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

  const items = await shapePostRows(supabase, posts ?? [], user.id);

  const last = posts && posts.length > 0 ? posts[posts.length - 1] : null;
  const nextCursor = last && posts && posts.length === limit ? `${last.created_at}_${last.id}` : null;

  return NextResponse.json({ items, nextCursor });
}
