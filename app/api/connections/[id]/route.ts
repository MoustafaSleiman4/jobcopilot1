import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Either party can remove a connection, whether it's still 'pending'
 * (cancelling a sent/received request) or already 'accepted' (removing an
 * existing connection). RLS already scopes deletes to rows where
 * auth.uid() in (requester_id, addressee_id), so a plain delete is safe —
 * no extra ownership check needed here.
 */
export async function DELETE(
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

  const { error, count } = await supabase
    .from("connections")
    .delete({ count: "exact" })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: "Could not remove connection" }, { status: 500 });
  }
  if (!count) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
