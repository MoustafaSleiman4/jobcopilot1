import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * `post_reactions` has PK (post_id, user_id), so reacting twice raises a
 * Postgres 23505 conflict — treated as a no-op success (the caller already
 * reacted, which is the state they wanted) rather than an error.
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

  const { error } = await supabase.from("post_reactions").insert({ post_id: id, user_id: user.id });

  if (error && error.code !== "23505") {
    return NextResponse.json({ error: "Could not react to post" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
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
