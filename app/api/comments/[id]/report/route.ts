import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Same shape as posts/[id]/report/route.ts — see that file's comment for
// why the regular RLS-scoped client is enough here (insert-only).
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

  let payload: { reason?: unknown } = {};
  try {
    payload = await request.json();
  } catch {
    // A report with no body/reason is fine.
  }
  const reason = typeof payload.reason === "string" ? payload.reason.trim().slice(0, 1000) : null;

  const { error } = await supabase.from("reports").insert({
    reporter_id: user.id,
    target_type: "comment",
    target_id: id,
    reason,
  });

  if (error) {
    return NextResponse.json({ error: "Could not submit report" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
