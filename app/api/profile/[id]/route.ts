import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { visibleContact } from "@/lib/contactVisibility";
import { deriveDisplayName } from "@/lib/displayName";
import type { PersonPreview, ProfileDetail, ExperienceItem, EducationItem, SkillItem, FeaturedItem } from "@/lib/social-types";

export const runtime = "nodejs";

const MUTUAL_PREVIEW_LIMIT = 12;

/**
 * The rich profile page's data — a superset of GET /api/people/[id]
 * (connection headline stats, mutual connections, contact info) plus every
 * section LinkedIn-style rich profiles are built from: experience,
 * education, skills + endorsements, featured items, the connection-degree
 * badge, Follow state, and (self-only) the two analytics counters shown at
 * the top of the "profile strength" area.
 *
 * Deliberately a separate route from GET /api/people/[id] rather than that
 * route extended in place: PersonDetailModal (a quick-glance popup opened
 * from a list row) only ever needs the lighter shape and is on a tight
 * perf budget since it can be opened many times per session, while this
 * route backs a dedicated page view and can afford the extra joins.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
  const isSelf = id === user.id;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select(
      "id, full_name, avatar_url, job_title, current_company, country, email, phone, show_email, show_phone, headline, about, open_to_work, private_profile_views"
    )
    .eq("id", id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: "Could not load profile" }, { status: 500 });
  }
  if (!profile) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

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

  const [
    { data: connectionsCount },
    { data: mutualIds },
    { data: degree },
    { data: followingRow },
    { data: followerRow },
    { data: experienceRows },
    { data: educationRows },
    { data: skillRows },
    { data: featuredRows },
  ] = await Promise.all([
    supabase.rpc("connection_count", { target_id: id }),
    isSelf ? Promise.resolve({ data: [] as { member_id: string }[] }) : supabase.rpc("mutual_connections", { target_id: id }),
    isSelf ? Promise.resolve({ data: 0 }) : supabase.rpc("connection_degree", { target_id: id }),
    isSelf ? Promise.resolve({ data: null }) : supabase.from("follows").select("follower_id").eq("follower_id", user.id).eq("followee_id", id).maybeSingle(),
    isSelf ? Promise.resolve({ data: null }) : supabase.from("follows").select("follower_id").eq("follower_id", id).eq("followee_id", user.id).maybeSingle(),
    supabase
      .from("profile_experience")
      .select("id, title, company, employment_type, location, start_date, end_date, description")
      .eq("user_id", id)
      .order("order_index", { ascending: true })
      .order("start_date", { ascending: false, nullsFirst: true }),
    supabase
      .from("profile_education")
      .select("id, school, degree, field_of_study, start_date, end_date, description")
      .eq("user_id", id)
      .order("order_index", { ascending: true })
      .order("start_date", { ascending: false, nullsFirst: true }),
    supabase.from("profile_skills").select("id, name").eq("user_id", id).order("order_index", { ascending: true }),
    supabase
      .from("profile_featured")
      .select("id, title, url, description")
      .eq("user_id", id)
      .order("order_index", { ascending: true }),
  ]);

  const mutualAll = (mutualIds ?? []) as { member_id: string }[];
  const mutualConnectionsCount = mutualAll.length;
  const previewIds = mutualAll.slice(0, MUTUAL_PREVIEW_LIMIT).map((row) => row.member_id);

  let mutualConnections: PersonPreview[] = [];
  if (previewIds.length > 0) {
    const { data: mutualProfiles } = await supabase.from("profiles").select("id, full_name, avatar_url, email").in("id", previewIds);
    mutualConnections = (mutualProfiles ?? []).map((p) => ({
      id: p.id as string,
      fullName: deriveDisplayName(p.full_name as string | null, p.email as string | null),
      avatarUrl: p.avatar_url as string | null,
    }));
  }

  const skills = (skillRows ?? []) as { id: string; name: string }[];
  const skillIds = skills.map((s) => s.id);

  const endorsementCountBySkill = new Map<string, number>();
  const endorsedByViewerSkillIds = new Set<string>();
  if (skillIds.length > 0) {
    const { data: endorsementRows } = await supabase
      .from("skill_endorsements")
      .select("skill_id, endorser_id")
      .in("skill_id", skillIds);
    for (const row of endorsementRows ?? []) {
      const skillId = row.skill_id as string;
      endorsementCountBySkill.set(skillId, (endorsementCountBySkill.get(skillId) ?? 0) + 1);
      if (row.endorser_id === user.id) endorsedByViewerSkillIds.add(skillId);
    }
  }

  // Analytics counters are self-only — profile_views/search_appearances RLS
  // already scopes reads to the subject of the row, so a non-self caller
  // would just get an empty count here anyway; skipping the queries
  // entirely for a stranger's profile avoids two pointless round trips.
  let profileViewCount: number | null = null;
  let searchAppearanceCount: number | null = null;
  if (isSelf) {
    const [{ count: viewCount }, { count: searchCount }] = await Promise.all([
      supabase.from("profile_views").select("id", { count: "exact", head: true }).eq("viewed_id", user.id),
      supabase.from("search_appearances").select("id", { count: "exact", head: true }).eq("searched_user_id", user.id),
    ]);
    profileViewCount = viewCount ?? 0;
    searchAppearanceCount = searchCount ?? 0;
  } else {
    // "Someone viewed your profile" — logged here (not in a client-side
    // effect) so it fires exactly once per page load and can't be skipped
    // by a client that never mounts the tracking effect. Best-effort: a
    // failed insert here shouldn't fail the whole profile fetch.
    await supabase.from("profile_views").insert({ viewer_id: user.id, viewed_id: id }).then(
      () => {},
      () => {}
    );
  }

  const experience: ExperienceItem[] = (experienceRows ?? []).map((row) => ({
    id: row.id as string,
    title: row.title as string,
    company: row.company as string,
    employmentType: (row.employment_type as string | null) ?? null,
    location: (row.location as string | null) ?? null,
    startDate: (row.start_date as string | null) ?? null,
    endDate: (row.end_date as string | null) ?? null,
    description: (row.description as string | null) ?? null,
  }));

  const education: EducationItem[] = (educationRows ?? []).map((row) => ({
    id: row.id as string,
    school: row.school as string,
    degree: (row.degree as string | null) ?? null,
    fieldOfStudy: (row.field_of_study as string | null) ?? null,
    startDate: (row.start_date as string | null) ?? null,
    endDate: (row.end_date as string | null) ?? null,
    description: (row.description as string | null) ?? null,
  }));

  const skillItems: SkillItem[] = skills.map((s) => ({
    id: s.id,
    name: s.name,
    endorsementCount: endorsementCountBySkill.get(s.id) ?? 0,
    endorsedByViewer: endorsedByViewerSkillIds.has(s.id),
  }));

  const featured: FeaturedItem[] = (featuredRows ?? []).map((row) => ({
    id: row.id as string,
    title: row.title as string,
    url: (row.url as string | null) ?? null,
    description: (row.description as string | null) ?? null,
  }));

  const result: ProfileDetail = {
    id: profile.id as string,
    fullName: deriveDisplayName(profile.full_name as string | null, profile.email as string | null),
    avatarUrl: profile.avatar_url as string | null,
    jobTitle: profile.job_title as string | null,
    currentCompany: profile.current_company as string | null,
    country: profile.country as string | null,
    email: contact.email,
    phone: contact.phone,
    headline: (profile.headline as string | null) ?? null,
    about: (profile.about as string | null) ?? null,
    openToWork: Boolean(profile.open_to_work),
    privateProfileViews: Boolean(profile.private_profile_views),
    connectionStatus,
    connectionId,
    connectionsCount: typeof connectionsCount === "number" ? connectionsCount : 0,
    connectionDegree: isSelf ? 0 : ((degree as 0 | 1 | 2 | 3 | null) ?? 3),
    mutualConnectionsCount,
    mutualConnections,
    isFollowedByViewer: Boolean(followingRow),
    isFollowingViewer: Boolean(followerRow),
    experience,
    education,
    skills: skillItems,
    featured,
    profileViewCount,
    searchAppearanceCount,
  };

  return NextResponse.json(result);
}
