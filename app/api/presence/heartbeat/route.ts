import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Called periodically (roughly every 45-60s) by a client component while
 * the dashboard is open, plus once on mount, to keep `profiles.last_seen_at`
 * fresh — that column is what GET /api/connections and GET /api/messages
 * use to compute `isOnline` (see ONLINE_WINDOW_MS in those routes). No
 * body needed; this only ever touches the caller's own row.
 */
export async function POST() {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { error } = await supabase
    .from("profiles")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: "Could not update presence" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
