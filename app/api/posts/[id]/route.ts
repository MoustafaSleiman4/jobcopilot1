import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_BODY_LENGTH = 3000;

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
