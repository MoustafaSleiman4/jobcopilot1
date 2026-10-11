import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Bookmark a post ("Save" — private to the viewer, not a public signal like a reaction). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { id } = await params;
  const { error } = await supabase.from("saved_posts").insert({ user_id: user.id, post_id: id });
  if (error && error.code !== "23505") {
    return NextResponse.json({ error: "Could not save post" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { id } = await params;
  const { error } = await supabase.from("saved_posts").delete().eq("post_id", id).eq("user_id", user.id);
  if (error) {
    return NextResponse.json({ error: "Could not unsave post" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
