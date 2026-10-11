import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Logs one "this post entered the viewer's viewport" impression — called by
 * PostCard via an IntersectionObserver, once per post per page load (see
 * the `reportedRef` guard in PostCard.tsx). Deliberately fire-and-forget
 * from the client's perspective (no loading state, errors swallowed) since
 * this is a soft analytics signal, never something a user-visible action
 * should block on. Always returns `{ ok: true }` even when the insert
 * fails — see the catch below — for the same reason.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { id } = await params;
  try {
    await supabase.from("post_impressions").insert({ post_id: id, viewer_id: user.id });
  } catch {
    // Best-effort — see the doc comment above.
  }

  return NextResponse.json({ ok: true });
}
