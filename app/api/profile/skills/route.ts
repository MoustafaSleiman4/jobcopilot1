import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_SKILL_CHARS = 60;
const MAX_SKILLS = 50;

/** Adds one skill to the caller's own profile. De-duped case-insensitively by the DB's unique index. */
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let payload: { name?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Skill name is required" }, { status: 400 });
  }
  if (name.length > MAX_SKILL_CHARS) {
    return NextResponse.json({ error: `Skill names must be at most ${MAX_SKILL_CHARS} characters` }, { status: 400 });
  }

  const { count: existingCount } = await supabase.from("profile_skills").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  if ((existingCount ?? 0) >= MAX_SKILLS) {
    return NextResponse.json({ error: `You can list up to ${MAX_SKILLS} skills` }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("profile_skills")
    .insert({ name, user_id: user.id, order_index: existingCount ?? 0 })
    .select("id, name")
    .single();

  if (error) {
    // 23505 = the case-insensitive unique index — "you already listed this skill."
    if (error.code === "23505") {
      return NextResponse.json({ error: "You've already added that skill" }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not add skill" }, { status: 500 });
  }

  return NextResponse.json({ item: { id: data.id, name: data.name, endorsementCount: 0, endorsedByViewer: false } }, { status: 201 });
}
