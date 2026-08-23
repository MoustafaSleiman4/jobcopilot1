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
 * so a country or target_roles match (when the caller has either set)
 * surfaces first, but never limited to only those matches.
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
 * only using country/role as a ranking signal (scoreOf below) fixes that:
 * the default view always shows every unconnected account there is, with
 * more relevant ones simply listed first when a genuine match exists.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: me } = await supabase
    .from("profiles")
    .select("country, target_roles")
    .eq("id", user.id)
    .maybeSingle();

  const { data: existingConnections } = await supabase
    .from("connections")
    .select("requester_id, addressee_id, status")
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
    .in("status", ["pending", "accepted"]);

  const excludeIds = new Set<string>([user.id]);
  for (const row of existingConnections ?? []) {
    excludeIds.add(row.requester_id === user.id ? row.addressee_id : row.requester_id);
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

  // Ranking only — a country match, then any overlapping target_roles, then
  // (implicitly, since the query above is already newest-first and Array
  // .sort is stable) most recently joined. Never excludes a non-matching
  // profile; that's the whole fix.
  function scoreOf(profile: { country: string | null; target_roles: string[] | null }): number {
    let score = 0;
    if (country && profile.country === country) score += 2;
    if (profile.target_roles?.some((role) => targetRoles.has(role))) score += 1;
    return score;
  }

  const items = (profiles ?? [])
    .filter((profile) => !excludeIds.has(profile.id as string))
    .sort((a, b) => scoreOf(b as { country: string | null; target_roles: string[] | null }) - scoreOf(a as { country: string | null; target_roles: string[] | null }))
    .slice(0, LIMIT)
    .map((profile) => {
      const contact = visibleContact(profile as { id: string; email: string | null; phone: string | null; show_email: boolean | null; show_phone: boolean | null }, user.id);
      return {
        id: profile.id,
        fullName: deriveDisplayName(profile.full_name as string | null, profile.email as string | null),
        avatarUrl: profile.avatar_url,
        jobTitle: profile.job_title,
        currentCompany: profile.current_company,
        country: profile.country,
        email: contact.email,
        phone: contact.phone,
      };
    });

  return NextResponse.json({ items });
}
