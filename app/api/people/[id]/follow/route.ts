import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Follow — deliberately separate from Connect/public.connections (see
 * supabase/network-pro-upgrade.sql's `follows` table comment). No
 * acceptance step, no notification type for it (unlike connection_request):
 * following someone is a one-sided, silent signal, exactly like following
 * a public figure rather than sending them a request.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { id } = await params;
  if (id === user.id) {
    return NextResponse.json({ error: "You can't follow yourself" }, { status: 400 });
  }

  const { error } = await supabase.from("follows").insert({ follower_id: user.id, followee_id: id });
  if (error && error.code !== "23505") {
    return NextResponse.json({ error: "Could not follow" }, { status: 500 });
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
  const { error } = await supabase.from("follows").delete().eq("follower_id", user.id).eq("followee_id", id);
  if (error) {
    return NextResponse.json({ error: "Could not unfollow" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
