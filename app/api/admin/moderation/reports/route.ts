import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Lists open reports for the admin moderation page. Uses the service-role
 * admin client (same as POST .../action) because `reports` has no select
 * policy for `authenticated` at all — this is the read-side counterpart to
 * that route, gated by the same ADMIN_SECRET shared-secret check.
 */
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");

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

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (err) {
    console.error("Moderation reports: admin client not configured", err);
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  const { data: reports, error } = await admin
    .from("reports")
    .select("id, reporter_id, target_type, target_id, reason, status, created_at")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("Moderation reports: failed to load reports", error);
    return NextResponse.json({ error: "Could not load reports" }, { status: 500 });
  }

  const reporterIds = Array.from(new Set((reports ?? []).map((r) => r.reporter_id as string)));
  const profilesById = new Map<string, { full_name: string | null; avatar_url: string | null }>();
  if (reporterIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, full_name, avatar_url")
      .in("id", reporterIds);
    for (const profile of profiles ?? []) {
      profilesById.set(profile.id as string, {
        full_name: profile.full_name as string | null,
        avatar_url: profile.avatar_url as string | null,
      });
    }
  }

  const postIds = (reports ?? []).filter((r) => r.target_type === "post").map((r) => r.target_id as string);
  const commentIds = (reports ?? []).filter((r) => r.target_type === "comment").map((r) => r.target_id as string);

  const postSnippetById = new Map<string, string>();
  const commentSnippetById = new Map<string, string>();

  const [postsRes, commentsRes] = await Promise.all([
    postIds.length > 0
      ? admin.from("posts").select("id, body").in("id", postIds)
      : Promise.resolve({ data: [] as { id: string; body: string }[] }),
    commentIds.length > 0
      ? admin.from("post_comments").select("id, body").in("id", commentIds)
      : Promise.resolve({ data: [] as { id: string; body: string }[] }),
  ]);

  for (const post of postsRes.data ?? []) {
    postSnippetById.set(post.id as string, ((post.body as string) ?? "").slice(0, 200));
  }
  for (const comment of commentsRes.data ?? []) {
    commentSnippetById.set(comment.id as string, ((comment.body as string) ?? "").slice(0, 200));
  }

  const items = (reports ?? []).map((report) => {
    const reporter = profilesById.get(report.reporter_id as string);
    const snippet =
      report.target_type === "post"
        ? postSnippetById.get(report.target_id as string) ?? null
        : commentSnippetById.get(report.target_id as string) ?? null;
    return {
      id: report.id,
      targetType: report.target_type,
      targetId: report.target_id,
      reason: report.reason,
      status: report.status,
      createdAt: report.created_at,
      reporter: {
        id: report.reporter_id,
        fullName: reporter?.full_name ?? null,
        avatarUrl: reporter?.avatar_url ?? null,
      },
      targetSnippet: snippet,
    };
  });

  return NextResponse.json({ items });
}
