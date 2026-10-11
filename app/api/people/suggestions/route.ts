import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { visibleContact } from "@/lib/contactVisibility";
import { deriveDisplayName } from "@/lib/displayName";

export const runtime = "nodejs";

const LIMIT = 10;
// How many recent-first candidates to pull before excluding/ranking in JS —
// generous relative to LIMIT so that even a user with many existing
// connections (who'll have a lot to exclude) still gets a full page of
// suggestions rather than running out of candidates. See the empty-results
// bug this replaced, below.
const CANDIDATE_POOL_SIZE = 200;

/**
 * "People you may know" — every visible, not-yet-connected profile, ranked
 * so a shared-connections match (people_you_may_know(), see
 * supabase/network-pro-upgrade.sql — "connections of your connections,
 * most-mutuals-first") dominates the ranking, a country or target_roles
 * match comes next, and everything else still appears below that rather
 * than being excluded outright.
 *
 * This used to run country/target_roles as a hard SQL `.or()` filter, so
 * when NO other visible profile happened to share the caller's country/role
 * (or every one that did was already connected/pending), the query came
 * back completely empty — "Find People" showing nothing — even when there
 * were plenty of other real, unconnected profiles just from different
 * countries. Confirmed live: a caller in Lebanon with target_roles unset
 * only matched the 6 other Lebanon-country profiles, and all 6 already had
 * a connection, so the filtered query returned zero rows while 32 other
 * eligible profiles sat unseen. Fetching the full eligible pool first and
 * only using mutual-connection-count/country/role as a ranking signal
 * (scoreOf below) fixes that: the default view always shows every
 * unconnected account there is, with more relevant ones simply listed
 * first when a genuine match exists.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const [{ data: me }, { data: existingConnections }, { data: mutualWeighted }] = await Promise.all([
    supabase.from("profiles").select("country, target_roles").eq("id", user.id).maybeSingle(),
    supabase
      .from("connections")
      .select("requester_id, addressee_id, status")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .in("status", ["pending", "accepted"]),
    // "People you may know" via shared connections — empty for a caller
    // with few/no connections yet, which is fine: everything below still
    // falls back to the plain country/role/recency ranking in that case.
    supabase.rpc("people_you_may_know", { limit_count: 50 }),
  ]);

  const excludeIds = new Set<string>([user.id]);
  for (const row of existingConnections ?? []) {
    excludeIds.add(row.requester_id === user.id ? row.addressee_id : row.requester_id);
  }

  const mutualCountById = new Map<string, number>();
  for (const row of (mutualWeighted ?? []) as { member_id: string; mutual_count: number }[]) {
    if (!excludeIds.has(row.member_id)) mutualCountById.set(row.member_id, row.mutual_count);
  }

  const country = me?.country ?? null;
  const targetRoles = new Set((me?.target_roles as string[] | null) ?? []);

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, job_title, current_company, country, target_roles, email, phone, show_email, show_phone, created_at")
    .neq("id", user.id)
    .eq("hidden_from_discovery", false)
    .order("created_at", { ascending: false })
    .limit(CANDIDATE_POOL_SIZE);

  if (error) {
    return NextResponse.json({ error: "Could not load suggestions" }, { status: 500 });
  }

  type Candidate = {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    job_title: string | null;
    current_company: string | null;
    country: string | null;
    target_roles: string[] | null;
    email: string | null;
    phone: string | null;
    show_email: boolean | null;
    show_phone: boolean | null;
  };

  const candidatesById = new Map<string, Candidate>();
  for (const profile of (profiles ?? []) as Candidate[]) {
    if (!excludeIds.has(profile.id)) candidatesById.set(profile.id, profile);
  }

  // A strong shared-connections match can easily be someone who joined long
  // ago and fell outside the "most recent 200" window above — fetch those
  // explicitly rather than silently dropping them from the ranking.
  const missingMutualIds = Array.from(mutualCountById.keys()).filter((id) => !candidatesById.has(id));
  if (missingMutualIds.length > 0) {
    const { data: extraProfiles } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, job_title, current_company, country, target_roles, email, phone, show_email, show_phone")
      .in("id", missingMutualIds)
      .eq("hidden_from_discovery", false);
    for (const profile of (extraProfiles ?? []) as Candidate[]) {
      candidatesById.set(profile.id, profile);
    }
  }

  // Ranking: a shared-connections match dominates (weighted heavily enough
  // that even one mutual connection outranks a plain country/role match,
  // matching how prominently LinkedIn surfaces "N mutual connections" on
  // its own suggestions), then country, then any overlapping target_roles.
  function scoreOf(profile: Candidate): number {
    let score = (mutualCountById.get(profile.id) ?? 0) * 100;
    if (country && profile.country === country) score += 2;
    if (profile.target_roles?.some((role) => targetRoles.has(role))) score += 1;
    return score;
  }

  const ranked = Array.from(candidatesById.values()).sort((a, b) => scoreOf(b) - scoreOf(a));
  const page = ranked.slice(0, LIMIT);
  const pageIds = page.map((p) => p.id);

  const { data: degreeRows } = pageIds.length > 0 ? await supabase.rpc("connection_degrees", { target_ids: pageIds }) : { data: [] };
  const degreeById = new Map<string, 0 | 1 | 2 | 3>();
  for (const row of (degreeRows ?? []) as { target_id: string; degree: 0 | 1 | 2 | 3 }[]) {
    degreeById.set(row.target_id, row.degree);
  }

  const items = page.map((profile) => {
    const contact = visibleContact(profile, user.id);
    return {
      id: profile.id,
      fullName: deriveDisplayName(profile.full_name, profile.email),
      avatarUrl: profile.avatar_url,
      jobTitle: profile.job_title,
      currentCompany: profile.current_company,
      country: profile.country,
      email: contact.email,
      phone: contact.phone,
      connectionDegree: degreeById.get(profile.id) ?? 2,
      mutualConnectionsCount: mutualCountById.get(profile.id) ?? 0,
    };
  });

  return NextResponse.json({ items });
}
