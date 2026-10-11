import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Edits one of the caller's own education entries. RLS scopes this to `auth.uid() = user_id`. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { id } = await params;
  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (typeof payload.school === "string") update.school = payload.school.trim();
  if (payload.degree === null || typeof payload.degree === "string") update.degree = payload.degree || null;
  if (payload.fieldOfStudy === null || typeof payload.fieldOfStudy === "string") update.field_of_study = payload.fieldOfStudy || null;
  if (payload.startDate === null || typeof payload.startDate === "string") update.start_date = payload.startDate || null;
  if (payload.endDate === null || typeof payload.endDate === "string") update.end_date = payload.endDate || null;
  if (payload.description === null || typeof payload.description === "string") update.description = payload.description || null;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("profile_education")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Could not update education" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

/** Removes one of the caller's own education entries. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { id } = await params;
  const { error } = await supabase.from("profile_education").delete().eq("id", id).eq("user_id", user.id);
  if (error) {
    return NextResponse.json({ error: "Could not remove education" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
