import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_HEADLINE_CHARS = 220;
const MAX_ABOUT_CHARS = 2600;

/**
 * Edits the viewer's own profile-header fields. Deliberately a separate
 * route from the resume builder's profile-save flow (app/dashboard/resume) —
 * those edit job_title/current_company/country/target_roles for the resume
 * side of the app; this edits the rich-profile-page fields that only exist
 * for the network feature. Both end up on the same `profiles` row, but
 * keeping the write paths separate avoids this route having to also
 * understand (and risk clobbering) resume-builder fields it has no reason
 * to touch.
 */
export async function PATCH(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let payload: { headline?: unknown; about?: unknown; openToWork?: unknown; privateProfileViews?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  if (payload.headline !== undefined) {
    const headline = typeof payload.headline === "string" ? payload.headline.trim() : "";
    if (headline.length > MAX_HEADLINE_CHARS) {
      return NextResponse.json({ error: `Headline must be at most ${MAX_HEADLINE_CHARS} characters` }, { status: 400 });
    }
    update.headline = headline || null;
  }

  if (payload.about !== undefined) {
    const about = typeof payload.about === "string" ? payload.about.trim() : "";
    if (about.length > MAX_ABOUT_CHARS) {
      return NextResponse.json({ error: `About must be at most ${MAX_ABOUT_CHARS} characters` }, { status: 400 });
    }
    update.about = about || null;
  }

  if (payload.openToWork !== undefined) {
    update.open_to_work = Boolean(payload.openToWork);
  }

  if (payload.privateProfileViews !== undefined) {
    update.private_profile_views = Boolean(payload.privateProfileViews);
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { error } = await supabase.from("profiles").update(update).eq("id", user.id);
  if (error) {
    return NextResponse.json({ error: "Could not update profile" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
