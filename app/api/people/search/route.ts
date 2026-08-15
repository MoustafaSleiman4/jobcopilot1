import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

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
 */
export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q) {
    return NextResponse.json({ items: [] });
  }

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, job_title, current_company")
    .ilike("full_name", `%${q}%`)
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

  const items = (profiles ?? []).map((profile) => ({
    id: profile.id,
    fullName: profile.full_name,
    avatarUrl: profile.avatar_url,
    jobTitle: profile.job_title,
    currentCompany: profile.current_company,
    connectionStatus: statusByOtherId.get(profile.id as string) ?? "none",
  }));

  return NextResponse.json({ items });
}
