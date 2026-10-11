import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_TITLE_CHARS = 120;
const MAX_DESCRIPTION_CHARS = 400;
const MAX_FEATURED = 10;

/** Adds one "Featured" item (a link to showcase — a project, article, certificate, etc.) to the caller's own profile. */
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let payload: { title?: unknown; url?: unknown; description?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  if (title.length > MAX_TITLE_CHARS) {
    return NextResponse.json({ error: `Title must be at most ${MAX_TITLE_CHARS} characters` }, { status: 400 });
  }

  let url: string | null = null;
  if (typeof payload.url === "string" && payload.url.trim()) {
    const trimmed = payload.url.trim();
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("bad protocol");
      url = parsed.toString();
    } catch {
      return NextResponse.json({ error: "URL must be a valid http(s) link" }, { status: 400 });
    }
  }

  const description = typeof payload.description === "string" && payload.description.trim() ? payload.description.trim() : null;
  if (description && description.length > MAX_DESCRIPTION_CHARS) {
    return NextResponse.json({ error: `Description must be at most ${MAX_DESCRIPTION_CHARS} characters` }, { status: 400 });
  }

  const { count: existingCount } = await supabase.from("profile_featured").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  if ((existingCount ?? 0) >= MAX_FEATURED) {
    return NextResponse.json({ error: `You can feature up to ${MAX_FEATURED} items` }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("profile_featured")
    .insert({ title, url, description, user_id: user.id, order_index: existingCount ?? 0 })
    .select("id, title, url, description")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Could not add featured item" }, { status: 500 });
  }

  return NextResponse.json({ item: { id: data.id, title: data.title, url: data.url, description: data.description } }, { status: 201 });
}
