import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Same shape as accept/route.ts — see the comment there for why the
// addressee/pending checks are explicit rather than relying on RLS alone.
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

  const { data: row, error: fetchError } = await supabase
    .from("connections")
    .select("id, addressee_id, status")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !row) {
    return NextResponse.json({ error: "Connection request not found" }, { status: 404 });
  }
  if (row.addressee_id !== user.id) {
    return NextResponse.json({ error: "Only the addressee can decline this request" }, { status: 403 });
  }
  if (row.status !== "pending") {
    return NextResponse.json({ error: `Request is already ${row.status}` }, { status: 409 });
  }

  const { error: updateError } = await supabase
    .from("connections")
    .update({ status: "declined", responded_at: new Date().toISOString() })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: "Could not decline connection request" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: "declined" });
}
