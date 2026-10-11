import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const REACTION_TYPES = new Set(["like", "celebrate", "support", "love", "insightful", "curious"]);

/**
 * React to a post with one of six types (see
 * supabase/network-pro-upgrade.sql's post_reactions_reaction_type_check).
 * `post_reactions` still has PK (post_id, user_id) — one reaction PER USER
 * per post — so this is an upsert: reacting again with a different type
 * changes the existing row's type rather than erroring or adding a second
 * row. The request body is optional for backward compatibility with any
 * already-cached client build that still POSTs with no body at all — that
 * degrades to a plain "like," matching the old boolean-like behavior.
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

  let reactionType = "like";
  try {
    const payload = (await request.json()) as { type?: unknown };
    if (typeof payload.type === "string" && REACTION_TYPES.has(payload.type)) {
      reactionType = payload.type;
    }
  } catch {
    // No/invalid JSON body — fall back to "like", see the doc comment above.
  }

  const { error } = await supabase
    .from("post_reactions")
    .upsert({ post_id: id, user_id: user.id, reaction_type: reactionType }, { onConflict: "post_id,user_id" });

  if (error) {
    return NextResponse.json({ error: "Could not react to post" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, type: reactionType });
}

/** Remove the caller's own reaction. RLS scopes this to `auth.uid() = user_id`. */
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

  const { error } = await supabase
    .from("post_reactions")
    .delete()
    .eq("post_id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: "Could not remove reaction" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
