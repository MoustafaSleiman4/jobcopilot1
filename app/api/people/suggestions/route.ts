import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { visibleContact } from "@/lib/contactVisibility";
import { deriveDisplayName } from "@/lib/displayName";

export const runtime = "nodejs";

const LIMIT = 10;

/**
 * v1 "people you may know" heuristic: other visible profiles sharing the
 * caller's country or overlapping any of the caller's target_roles.
 * Expressed as a single `.from("profiles")` query with `.or(...)` (an
 * `ilike`-adjacent overlap filter for the array column, `eq` for country) —
 * no `.rpc()` needed. If the caller has neither a country nor any
 * target_roles set there's nothing to match on, so we fall back to the
 * simplest reasonable v1 list: the most recently created visible profiles,
 * still excluding self/hidden/connected.
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
  const targetRoles = (me?.target_roles as string[] | null) ?? [];

  const orFilters: string[] = [];
  if (country) {
    orFilters.push(`country.eq.${country}`);
  }
  if (targetRoles.length > 0) {
    const list = targetRoles.map((role) => role.replace(/[{}"]/g, "")).join(",");
    orFilters.push(`target_roles.ov.{${list}}`);
  }

  let query = supabase
    .from("profiles")
    .select("id, full_name, avatar_url, job_title, current_company, email, phone, show_email, show_phone, created_at")
    .neq("id", user.id)
    .eq("hidden_from_discovery", false)
    .order("created_at", { ascending: false })
    .limit(LIMIT + excludeIds.size);

  if (orFilters.length > 0) {
    query = query.or(orFilters.join(","));
  }

  const { data: profiles, error } = await query;
  if (error) {
    return NextResponse.json({ error: "Could not load suggestions" }, { status: 500 });
  }

  const items = (profiles ?? [])
    .filter((profile) => !excludeIds.has(profile.id as string))
    .slice(0, LIMIT)
    .map((profile) => {
      const contact = visibleContact(profile as { id: string; email: string | null; phone: string | null; show_email: boolean | null; show_phone: boolean | null }, user.id);
      return {
        id: profile.id,
        fullName: deriveDisplayName(profile.full_name as string | null, profile.email as string | null),
        avatarUrl: profile.avatar_url,
        jobTitle: profile.job_title,
        currentCompany: profile.current_company,
        email: contact.email,
        phone: contact.phone,
      };
    });

  return NextResponse.json({ items });
}
