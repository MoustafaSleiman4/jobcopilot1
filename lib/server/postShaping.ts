import { deriveDisplayName } from "@/lib/displayName";
import type { Person, PostItem, ReactionBreakdown, ReactionType, RepostedPost } from "@/lib/social-types";

// Minimal shape of a Supabase server client — avoids importing the actual
// client type here (which would couple this file to the exact Supabase SDK
// version/generic params) since every call site already has one.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

type PostRow = {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  repost_of_id?: string | null;
};

/**
 * Shared batched-join logic for turning raw `posts` rows into fully-shaped
 * `PostItem`s — factored out of GET /api/posts (the feed) and GET
 * /api/posts/[id] (the single-post notification-deep-link fetch) once both
 * needed the same new joins (reaction breakdown, repost preview, repost
 * count, saved state). Keeping this in one place means a future field
 * addition (e.g. a 7th reaction type) only needs changing here, not in two
 * routes that would otherwise drift exactly the way GET /api/posts and GET
 * /api/posts/[id] already had drifted once before (see the comment on
 * viewerHasReacted's past naming mismatch in app/api/posts/route.ts).
 *
 * `viewerId` is required (every call site already requires auth) — there's
 * no "anonymous" shape for a PostItem.
 */
export async function shapePostRows(supabase: SupabaseLike, rows: PostRow[], viewerId: string): Promise<PostItem[]> {
  if (rows.length === 0) return [];

  const postIds = rows.map((p) => p.id);
  const repostOfIds = Array.from(new Set(rows.map((p) => p.repost_of_id).filter((id): id is string => Boolean(id))));

  // Fetch the reposted-from originals (for the embedded preview card) up
  // front, so their author ids can be folded into the one profiles query
  // below instead of running a second profiles round trip.
  const { data: originalRows } =
    repostOfIds.length > 0
      ? await supabase
          .from("posts")
          .select("id, author_id, body, created_at, deleted_at")
          .in("id", repostOfIds)
      : { data: [] as { id: string; author_id: string; body: string; created_at: string; deleted_at: string | null }[] };

  const authorIds = Array.from(
    new Set([...rows.map((p) => p.author_id), ...(originalRows ?? []).map((p: { author_id: string }) => p.author_id)])
  );
  const allPostIdsForMedia = Array.from(new Set([...postIds, ...repostOfIds]));

  // Commenting is gated to the author or a direct (1st-degree, accepted)
  // connection of theirs (supabase/posts-open-feed-gated-comments.sql) —
  // same computation GET /api/posts has always done, factored in here too
  // so GET /api/posts/[id] (the notification deep-link fetch) stops
  // silently omitting it, which previously made "connect to comment" never
  // show up for a post opened via a notification link.
  const connectionStatusByAuthor = new Map<string, "pending_sent" | "pending_received" | "connected">();
  if (authorIds.length > 0) {
    const { data: relevantConnections } = await supabase
      .from("connections")
      .select("requester_id, addressee_id, status")
      .or(`requester_id.eq.${viewerId},addressee_id.eq.${viewerId}`)
      .in("status", ["pending", "accepted"]);
    for (const row of relevantConnections ?? []) {
      const otherId = row.requester_id === viewerId ? row.addressee_id : row.requester_id;
      if (!authorIds.includes(otherId)) continue;
      if (row.status === "accepted") connectionStatusByAuthor.set(otherId, "connected");
      else if (row.status === "pending") connectionStatusByAuthor.set(otherId, row.requester_id === viewerId ? "pending_sent" : "pending_received");
    }
  }

  const [profilesRes, mediaRes, reactionsRes, commentsRes, repostCountRes, viewerRepostRes, savedRes] = await Promise.all([
    authorIds.length > 0
      ? supabase.from("profiles").select("id, full_name, avatar_url, job_title, current_company, email").in("id", authorIds)
      : Promise.resolve({ data: [] as never[] }),
    allPostIdsForMedia.length > 0
      ? supabase.from("post_media").select("post_id, media_type, storage_path, order_index").in("post_id", allPostIdsForMedia).order("order_index", { ascending: true })
      : Promise.resolve({ data: [] as never[] }),
    postIds.length > 0 ? supabase.from("post_reactions").select("post_id, user_id, reaction_type").in("post_id", postIds) : Promise.resolve({ data: [] as never[] }),
    postIds.length > 0
      ? supabase.from("post_comments").select("post_id").in("post_id", postIds).is("deleted_at", null).is("parent_comment_id", null)
      : Promise.resolve({ data: [] as never[] }),
    postIds.length > 0 ? supabase.from("posts").select("repost_of_id, author_id").in("repost_of_id", postIds) : Promise.resolve({ data: [] as never[] }),
    postIds.length > 0
      ? supabase.from("posts").select("repost_of_id").in("repost_of_id", postIds).eq("author_id", viewerId)
      : Promise.resolve({ data: [] as never[] }),
    postIds.length > 0 ? supabase.from("saved_posts").select("post_id").in("post_id", postIds).eq("user_id", viewerId) : Promise.resolve({ data: [] as never[] }),
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

  const breakdownByPost = new Map<string, ReactionBreakdown>();
  const viewerReactionByPost = new Map<string, ReactionType>();
  for (const row of reactionsRes.data ?? []) {
    const r = row as { post_id: string; user_id: string; reaction_type: ReactionType };
    const breakdown = breakdownByPost.get(r.post_id) ?? {};
    breakdown[r.reaction_type] = (breakdown[r.reaction_type] ?? 0) + 1;
    breakdownByPost.set(r.post_id, breakdown);
    if (r.user_id === viewerId) viewerReactionByPost.set(r.post_id, r.reaction_type);
  }

  const commentCountByPost = new Map<string, number>();
  for (const row of commentsRes.data ?? []) {
    const postId = (row as Record<string, unknown>).post_id as string;
    commentCountByPost.set(postId, (commentCountByPost.get(postId) ?? 0) + 1);
  }

  const repostCountByOriginal = new Map<string, number>();
  for (const row of repostCountRes.data ?? []) {
    const originalId = (row as Record<string, unknown>).repost_of_id as string;
    repostCountByOriginal.set(originalId, (repostCountByOriginal.get(originalId) ?? 0) + 1);
  }

  const viewerRepostedOriginals = new Set((viewerRepostRes.data ?? []).map((row: Record<string, unknown>) => row.repost_of_id as string));
  const savedPostIds = new Set((savedRes.data ?? []).map((row: Record<string, unknown>) => row.post_id as string));

  const originalById = new Map<string, { id: string; author_id: string; body: string; created_at: string; deleted_at: string | null }>();
  for (const row of originalRows ?? []) {
    originalById.set(row.id, row);
  }

  // Explicit return type (rather than letting it be inferred) so
  // `connectionStatus`'s literal union isn't widened to plain `string` in
  // the inferred signature — without this, every call site below fails to
  // satisfy Person's `connectionStatus?: ConnectionStatus` field.
  function personFor(authorId: string): Person {
    const author = profilesById.get(authorId);
    return {
      id: authorId,
      fullName: deriveDisplayName((author?.full_name as string | null) ?? null, (author?.email as string | null) ?? null),
      avatarUrl: (author?.avatar_url as string | null) ?? null,
      jobTitle: (author?.job_title as string | null) ?? null,
      currentCompany: (author?.current_company as string | null) ?? null,
      // Not selected in the profiles query above (post authors never show
      // country in the feed) — same "always null here" treatment as
      // email/phone, just not optional on the Person type.
      country: null,
      email: null,
      phone: null,
      connectionStatus: connectionStatusByAuthor.get(authorId) ?? "none",
    };
  }

  function mediaFor(postId: string) {
    return (mediaByPost.get(postId) ?? []).map((m) => ({
      mediaType: m.media_type as "image" | "video",
      storagePath: m.storage_path as string,
      orderIndex: m.order_index as number,
    }));
  }

  return rows.map((post): PostItem => {
    const breakdown = breakdownByPost.get(post.id) ?? {};
    const reactionCount = Object.values(breakdown).reduce((sum, n) => sum + (n ?? 0), 0);

    let repostOf: RepostedPost | null = null;
    if (post.repost_of_id) {
      const original = originalById.get(post.repost_of_id);
      if (original) {
        repostOf = {
          id: original.id,
          body: original.deleted_at ? "" : original.body,
          createdAt: original.created_at,
          author: personFor(original.author_id),
          media: original.deleted_at ? [] : mediaFor(original.id),
          deleted: Boolean(original.deleted_at),
        };
      } else {
        // The original was deleted outright (not soft-deleted — e.g. an
        // old row from before soft-delete) or otherwise unreachable; render
        // the repost as "original post unavailable" rather than crashing.
        repostOf = { id: post.repost_of_id, body: "", createdAt: post.created_at, author: personFor(post.author_id), media: [], deleted: true };
      }
    }

    return {
      id: post.id,
      body: post.body,
      createdAt: post.created_at,
      editedAt: post.edited_at,
      author: personFor(post.author_id),
      media: mediaFor(post.id),
      reactionCount,
      viewerHasReacted: viewerReactionByPost.has(post.id),
      reactionBreakdown: breakdown,
      viewerReactionType: viewerReactionByPost.get(post.id) ?? null,
      commentCount: commentCountByPost.get(post.id) ?? 0,
      repostOf,
      repostCount: repostCountByOriginal.get(post.id) ?? 0,
      viewerHasReposted: viewerRepostedOriginals.has(post.id),
      viewerHasSaved: savedPostIds.has(post.id),
    };
  });
}
