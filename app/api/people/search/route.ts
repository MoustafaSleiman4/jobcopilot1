import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { visibleContact } from "@/lib/contactVisibility";
import { deriveDisplayName } from "@/lib/displayName";

export const runtime = "nodejs";

const LIMIT = 20;

/**
 * Name search implementation choice: plain `ilike '%q%'` rather than a
 * pg_trgm similarity `.rpc()`. pg_trgm is installed in this project and
 * would give fuzzier/typo-tolerant matching, but that needs a dedicated
 * SQL function to call via `.rpc()` (Supabase's query builder can't express
 * `similarity()` directly), which is more moving parts than a v1 "find
 * people by name" box needs. `ilike` is simple, uses the existing column,
 * and is easy to swap for a `.rpc("search_people", { q })` pg_trgm version
 * later without changing this route's response shape.
 *
 * Also matches on email, regardless of that profile's show_email setting —
 * "findable by an address you already know" and "shown in search results"
 * are kept as two separate permissions on purpose: you can still locate
 * someone by typing (part of) an email you have, exactly like searching a
 * contact by phone number in a messaging app, but the response below still
 * runs every row through visibleContact(), so the matched profile's actual
 * email only appears in the result if that person has opted show_email on
 * — matching stays possible, disclosure stays gated.
 */
export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const url = new URL(request.url);
  const rawQ = (url.searchParams.get("q") ?? "").trim();
  // Strip characters with special meaning in a PostgREST filter string
  // (`,` separates conditions, `(` `)` group them) — this string is
  // interpolated directly into the .or() filter below, so an unescaped
  // comma/paren in user input could otherwise smuggle in extra filter
  // clauses, e.g. bypassing the `show_email.eq.true` gate. Stripping them
  // is simpler and safer here than trying to escape-and-preserve them.
  const q = rawQ.replace(/[,()]/g, "").trim();
  if (!q) {
    return NextResponse.json({ items: [] });
  }

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, job_title, current_company, email, phone, show_email, show_phone")
    .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
    .neq("id", user.id)
    .eq("hidden_from_discovery", false)
    .limit(LIMIT);

  if (error) {
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }

  const ids = (profiles ?? []).map((p) => p.id as string);
  const statusByOtherId = new Map<string, "pending_sent" | "pending_received" | "connected">();

  if (ids.length > 0) {
    const { data: relevantConnections } = await supabase
      .from("connections")
      .select("requester_id, addressee_id, status")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .in("status", ["pending", "accepted"]);

    for (const row of relevantConnections ?? []) {
      const otherId = row.requester_id === user.id ? row.addressee_id : row.requester_id;
      if (!ids.includes(otherId)) continue;
      if (row.status === "accepted") {
        statusByOtherId.set(otherId, "connected");
      } else if (row.status === "pending") {
        statusByOtherId.set(
          otherId,
          row.requester_id === user.id ? "pending_sent" : "pending_received"
        );
      }
    }
  }

  const items = (profiles ?? []).map((profile) => {
    const contact = visibleContact(profile as { id: string; email: string | null; phone: string | null; show_email: boolean | null; show_phone: boolean | null }, user.id);
    return {
      id: profile.id,
      fullName: deriveDisplayName(profile.full_name as string | null, profile.email as string | null),
      avatarUrl: profile.avatar_url,
      jobTitle: profile.job_title,
      currentCompany: profile.current_company,
      email: contact.email,
      phone: contact.phone,
      connectionStatus: statusByOtherId.get(profile.id as string) ?? "none",
    };
  });

  return NextResponse.json({ items });
}
