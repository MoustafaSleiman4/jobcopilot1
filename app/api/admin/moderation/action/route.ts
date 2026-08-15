import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Moderation action on a report — dismiss it, or remove the reported
 * content (soft-delete the underlying post/comment) and mark the report
 * resolved. Gated by a shared secret (ADMIN_SECRET) rather than a role
 * system, exact same pattern as app/api/admin/whish/confirm/route.ts.
 *
 * This is the one route in the social-feature API that legitimately uses
 * the service-role admin client: `reports` has no select policy for
 * `authenticated` at all, and taking action on someone *else's* post/
 * comment is exactly the kind of cross-user write RLS is meant to block
 * for every other route — moderation is the sanctioned exception.
 */
export async function POST(request: NextRequest) {
  const { secret, reportId, action } = (await request.json()) as {
    secret?: string;
    reportId?: string;
    action?: "dismiss" | "remove_content";
  };

  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    return NextResponse.json(
      { error: "ADMIN_SECRET is not set on the server — set it in Vercel before using this." },
      { status: 500 }
    );
  }
  if (!secret || secret !== adminSecret) {
    return NextResponse.json({ error: "Invalid admin secret" }, { status: 401 });
  }
  if (!reportId || (action !== "dismiss" && action !== "remove_content")) {
    return NextResponse.json({ error: "Missing reportId or invalid action" }, { status: 400 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (err) {
    console.error("Moderation action: admin client not configured", err);
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  const { data: report, error: findError } = await admin
    .from("reports")
    .select("id, target_type, target_id, status")
    .eq("id", reportId)
    .maybeSingle();

  if (findError || !report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  if (action === "remove_content") {
    const table = report.target_type === "post" ? "posts" : "post_comments";
    const { error: removeError } = await admin
      .from(table)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", report.target_id);
    if (removeError) {
      console.error("Moderation action: failed to soft-delete", table, report.target_id, removeError);
      return NextResponse.json({ error: "Failed to remove content — check server logs" }, { status: 500 });
    }
  }

  const { error: statusError } = await admin
    .from("reports")
    .update({ status: action === "remove_content" ? "removed" : "dismissed" })
    .eq("id", report.id);

  if (statusError) {
    console.error("Moderation action: failed to update report status", report.id, statusError);
    return NextResponse.json({ error: "Failed to update report status — check server logs" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, action, reportId: report.id });
}
