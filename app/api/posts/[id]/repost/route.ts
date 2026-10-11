import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { shapePostRows } from "@/lib/server/postShaping";
import { extractHashtags, extractMentionIds } from "@/lib/postText";

export const runtime = "nodejs";

const MAX_COMMENT_LENGTH = 3000; // same cap as posts.body itself
const MAX_PER_DAY = 20; // shares POST /api/posts's daily cap — a repost is a posts row too

/**
 * Repost, with or without added commentary — "Share with your thoughts" vs
 * a plain reshare. Implemented as a NEW row in `posts` with `repost_of_id`
 * pointing at the original (see supabase/network-pro-upgrade.sql's §4
 * comment for why: it reuses every existing post-rendering/reaction/
 * comment path for free instead of needing a parallel one). `body` holds
 * only the REPOSTER's own added commentary — possibly empty, for a plain
 * reshare — never a copy of the original's text, which is instead fetched
 * fresh via the `repostOf` embed on read (see lib/server/postShaping.ts),
 * so an edit to the original is reflected on every existing repost of it.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { id: originalId } = await params;

  const { data: original } = await supabase.from("posts").select("id, deleted_at").eq("id", originalId).maybeSingle();
  if (!original || original.deleted_at) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }
  // A repost of a repost always points at the ORIGINAL, matching LinkedIn's
  // own behavior — otherwise a long re-share chain would bury the actual
  // source further with every hop.
  const { data: originalRow } = await supabase.from("posts").select("repost_of_id").eq("id", originalId).maybeSingle();
  const targetId = (originalRow?.repost_of_id as string | null) ?? originalId;

  let comment = "";
  try {
    const payload = (await request.json()) as { comment?: unknown };
    if (typeof payload.comment === "string") comment = payload.comment.trim();
  } catch {
    // No body at all is a valid plain reshare.
  }
  if (comment.length > MAX_COMMENT_LENGTH) {
    return NextResponse.json({ error: `Reposts can be at most ${MAX_COMMENT_LENGTH} characters` }, { status: 400 });
  }

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: postedToday } = await supabase
    .from("posts")
    .select("id", { count: "exact", head: true })
    .eq("author_id", user.id)
    .gte("created_at", dayAgo);
  if ((postedToday ?? 0) >= MAX_PER_DAY) {
    return NextResponse.json({ error: "You've reached today's posting limit. Try again tomorrow." }, { status: 429 });
  }

  const { data: inserted, error } = await supabase
    .from("posts")
    .insert({ author_id: user.id, body: comment, repost_of_id: targetId })
    .select("id, author_id, body, created_at, edited_at, repost_of_id")
    .single();

  if (error || !inserted) {
    // A unique-ish "you already reposted this" isn't enforced at the DB
    // level (unlike reactions/saves) — LinkedIn itself allows reposting the
    // same thing more than once (e.g. with different added commentary),
    // so this is a genuine insert failure, not a conflict to swallow.
    return NextResponse.json({ error: "Could not repost" }, { status: 500 });
  }

  if (comment) {
    const hashtags = extractHashtags(comment);
    if (hashtags.length > 0) {
      await supabase.from("post_hashtags").insert(hashtags.map((tag) => ({ post_id: inserted.id, tag }))).then(() => {}, () => {});
    }
    const mentionIds = extractMentionIds(comment).filter((mid) => mid !== user.id);
    if (mentionIds.length > 0) {
      await supabase
        .from("post_mentions")
        .insert(mentionIds.map((mentionedUserId) => ({ post_id: inserted.id, mentioned_user_id: mentionedUserId })))
        .then(() => {}, () => {});
    }
  }

  const [shaped] = await shapePostRows(supabase, [inserted], user.id);
  return NextResponse.json({ post: shaped }, { status: 201 });
}

/** Un-repost: soft-deletes the CALLER's own repost row for this original (there may be more than one). */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { id: originalId } = await params;

  const { error } = await supabase
    .from("posts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("author_id", user.id)
    .eq("repost_of_id", originalId)
    .is("deleted_at", null);

  if (error) {
    return NextResponse.json({ error: "Could not remove repost" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
