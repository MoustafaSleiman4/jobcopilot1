import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { visibleContact } from "@/lib/contactVisibility";
import { deriveDisplayName } from "@/lib/displayName";

export const runtime = "nodejs";

// A person's whole network can genuinely run long for someone active on
// this app; this caps what a single fetch has to carry (matches the same
// "cap it, tell the UI the true total separately" pattern already used by
// GET /api/people/[id]'s mutual-connections preview).
const LIMIT = 50;

/**
 * A given person's own connections list — "click a connection to see who
 * they're connected to." Distinct from GET /api/people/[id]'s
 * `mutualConnections` (only the overlap with the CALLER's own network):
 * this is that person's actual list, gated by
 * public.person_connections(uuid) (supabase/person-connections-list.sql) —
 * you can see it if you're connected to them yourself, or it's your own
 * profile. Anyone else gets an empty list, same as any other RLS-shaped
 * "nothing to show" in this app; the client tells those two cases apart
 * using the connectionStatus it already has from GET /api/people/[id].
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

  const { data: memberRows, error } = await supabase.rpc("person_connections", { target_id: id });
  if (error) {
    return NextResponse.json({ error: "Could not load connections" }, { status: 500 });
  }

  const all = (memberRows ?? []) as { member_id: string; connected_at: string }[];
  const totalCount = all.length;
  const page = all.slice(0, LIMIT);
  const ids = page.map((row) => row.member_id);

  let items: Array<{
    id: string;
    fullName: string;
    avatarUrl: string | null;
    jobTitle: string | null;
    currentCompany: string | null;
    country: string | null;
    email: string | null;
    phone: string | null;
  }> = [];

  if (ids.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, job_title, current_company, country, email, phone, show_email, show_phone")
      .in("id", ids);
    const profilesById = new Map((profiles ?? []).map((p) => [p.id as string, p]));
    items = page
      .map((row) => {
        const profile = profilesById.get(row.member_id);
        if (!profile) return null;
        const contact = visibleContact(
          profile as { id: string; email: string | null; phone: string | null; show_email: boolean | null; show_phone: boolean | null },
          user.id
        );
        return {
          id: profile.id as string,
          fullName: deriveDisplayName(profile.full_name as string | null, profile.email as string | null),
          avatarUrl: profile.avatar_url as string | null,
          jobTitle: profile.job_title as string | null,
          currentCompany: profile.current_company as string | null,
          country: profile.country as string | null,
          email: contact.email,
          phone: contact.phone,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);
  }

  return NextResponse.json({ items, totalCount });
}
