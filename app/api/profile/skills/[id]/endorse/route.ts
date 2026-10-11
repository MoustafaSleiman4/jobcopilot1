import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Endorse someone else's skill (LinkedIn's "+1 this skill"). `id` here is
 * the skill's id, not a person's — RLS (public.skill_endorsements' "Users
 * endorse others skills" policy, see supabase/network-pro-upgrade.sql)
 * blocks endorsing your own skill and the unique (skill_id, endorser_id)
 * index makes a second endorsement a no-op conflict rather than a second row,
 * same pattern as POST /api/posts/[id]/react's 23505 handling.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { id } = await params;
  const { error } = await supabase.from("skill_endorsements").insert({ skill_id: id, endorser_id: user.id });

  if (error && error.code !== "23505") {
    // RLS violation (42501) covers "that's your own skill" — surfaced as a
    // normal 400 rather than a 500, since it's a predictable client error.
    const status = error.code === "42501" ? 400 : 500;
    return NextResponse.json({ error: "Could not endorse this skill" }, { status });
  }

  return NextResponse.json({ ok: true });
}

/** Retract the caller's own endorsement of this skill. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { id } = await params;
  const { error } = await supabase.from("skill_endorsements").delete().eq("skill_id", id).eq("endorser_id", user.id);
  if (error) {
    return NextResponse.json({ error: "Could not remove endorsement" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
