import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ExperiencePayload = {
  title?: unknown;
  company?: unknown;
  employmentType?: unknown;
  location?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  description?: unknown;
};

const EMPLOYMENT_TYPES = new Set(["full_time", "part_time", "contract", "internship"]);

function parseExperiencePayload(payload: ExperiencePayload) {
  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const company = typeof payload.company === "string" ? payload.company.trim() : "";
  if (!title || !company) return null;

  const employmentType =
    typeof payload.employmentType === "string" && EMPLOYMENT_TYPES.has(payload.employmentType) ? payload.employmentType : null;
  const location = typeof payload.location === "string" && payload.location.trim() ? payload.location.trim() : null;
  const startDate = typeof payload.startDate === "string" && payload.startDate ? payload.startDate : null;
  const endDate = typeof payload.endDate === "string" && payload.endDate ? payload.endDate : null;
  const description = typeof payload.description === "string" && payload.description.trim() ? payload.description.trim() : null;

  return { title, company, employment_type: employmentType, location, start_date: startDate, end_date: endDate, description };
}

/** Adds one work-history entry to the caller's own profile, appended after their existing entries. */
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let payload: ExperiencePayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = parseExperiencePayload(payload);
  if (!parsed) {
    return NextResponse.json({ error: "Title and company are required" }, { status: 400 });
  }

  const { count: existingCount } = await supabase
    .from("profile_experience")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  const { data, error } = await supabase
    .from("profile_experience")
    .insert({ ...parsed, user_id: user.id, order_index: existingCount ?? 0 })
    .select("id, title, company, employment_type, location, start_date, end_date, description")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Could not add experience" }, { status: 500 });
  }

  return NextResponse.json(
    {
      item: {
        id: data.id,
        title: data.title,
        company: data.company,
        employmentType: data.employment_type,
        location: data.location,
        startDate: data.start_date,
        endDate: data.end_date,
        description: data.description,
      },
    },
    { status: 201 }
  );
}
