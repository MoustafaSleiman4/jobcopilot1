import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { visibleContact } from "@/lib/contactVisibility";
import { deriveDisplayName } from "@/lib/displayName";
import type { PersonPreview } from "@/lib/social-types";

export const runtime = "nodejs";

// How many mutual connections to resolve full profile info for and hand
// back to the client — enough for a "peek" avatar stack + expandable list
// without turning a single profile-detail fetch into an unbounded query.
// mutualConnectionsCount (the true total from the DB function) is returned
// separately so the UI can say "5 of 12 mutual connections" rather than
// silently capping.
const MUTUAL_PREVIEW_LIMIT = 12;

/**
 * Full "click a person to see their profile" detail view — the data behind
 * PersonDetailModal. Distinct from GET /api/people/search and /suggestions
 * (which return list-row shapes for many people at once): this fetches
 * everything for exactly ONE person, including the two cross-user stats
 * (connection_count / mutual_connections) that need the security-definer
 * SQL functions in supabase/people-profile-detail.sql because plain
 * `connections` RLS only lets a caller read rows they're a party to.
 *
 * Deliberately does NOT filter on hidden_from_discovery — that flag only
 * affects being *found* via search/suggestions, not being *viewed* once you
 * already have their id (from a connection, a request, a comment, a post).
 */
export async function GET(
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
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, job_title, current_company, country, email, phone, show_email, show_phone")
    .eq("id", id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: "Could not load profile" }, { status: 500 });
  }
  if (!profile) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isSelf = id === user.id;
  const contact = visibleContact(
    profile as { id: string; email: string | null; phone: string | null; show_email: boolean | null; show_phone: boolean | null },
    user.id
  );

  let connectionStatus: "none" | "pending_sent" | "pending_received" | "connected" = "none";
  let connectionId: string | null = null;
  if (!isSelf) {
    const { data: relation } = await supabase
      .from("connections")
      .select("id, requester_id, status")
      .or(`and(requester_id.eq.${user.id},addressee_id.eq.${id}),and(requester_id.eq.${id},addressee_id.eq.${user.id})`)
      .maybeSingle();
    if (relation) {
      connectionId = relation.id as string;
      if (relation.status === "accepted") {
        connectionStatus = "connected";
      } else if (relation.status === "pending") {
        connectionStatus = relation.requester_id === user.id ? "pending_sent" : "pending_received";
      }
    }
  }

  // Both cross-user stats run in parallel — independent reads, no reason to
  // serialize them.
  const [{ data: connectionsCount }, { data: mutualIds }] = await Promise.all([
    supabase.rpc("connection_count", { target_id: id }),
    // "Mutual connections" isn't a meaningful concept against your own
    // profile (it would just be your whole network) — skip the RPC and
    // return an empty list rather than a confusing self-intersection.
    isSelf ? Promise.resolve({ data: [] as { member_id: string }[] }) : supabase.rpc("mutual_connections", { target_id: id }),
  ]);

  const mutualAll = (mutualIds ?? []) as { member_id: string }[];
  const mutualConnectionsCount = mutualAll.length;
  const previewIds = mutualAll.slice(0, MUTUAL_PREVIEW_LIMIT).map((row) => row.member_id);

  let mutualConnections: PersonPreview[] = [];
  if (previewIds.length > 0) {
    const { data: mutualProfiles } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, email")
      .in("id", previewIds);
    mutualConnections = (mutualProfiles ?? []).map((p) => ({
      id: p.id as string,
      fullName: deriveDisplayName(p.full_name as string | null, p.email as string | null),
      avatarUrl: p.avatar_url as string | null,
    }));
  }

  return NextResponse.json({
    id: profile.id,
    fullName: deriveDisplayName(profile.full_name as string | null, profile.email as string | null),
    avatarUrl: profile.avatar_url,
    jobTitle: profile.job_title,
    currentCompany: profile.current_company,
    country: profile.country,
    email: contact.email,
    phone: contact.phone,
    connectionStatus,
    connectionId,
    connectionsCount: typeof connectionsCount === "number" ? connectionsCount : 0,
    mutualConnectionsCount,
    mutualConnections,
  });
}
