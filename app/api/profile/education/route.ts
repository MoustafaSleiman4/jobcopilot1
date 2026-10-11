import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type EducationPayload = {
  school?: unknown;
  degree?: unknown;
  fieldOfStudy?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  description?: unknown;
};

function parseEducationPayload(payload: EducationPayload) {
  const school = typeof payload.school === "string" ? payload.school.trim() : "";
  if (!school) return null;

  const degree = typeof payload.degree === "string" && payload.degree.trim() ? payload.degree.trim() : null;
  const fieldOfStudy = typeof payload.fieldOfStudy === "string" && payload.fieldOfStudy.trim() ? payload.fieldOfStudy.trim() : null;
  const startDate = typeof payload.startDate === "string" && payload.startDate ? payload.startDate : null;
  const endDate = typeof payload.endDate === "string" && payload.endDate ? payload.endDate : null;
  const description = typeof payload.description === "string" && payload.description.trim() ? payload.description.trim() : null;

  return { school, degree, field_of_study: fieldOfStudy, start_date: startDate, end_date: endDate, description };
}

/** Adds one education entry to the caller's own profile, appended after their existing entries. */
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let payload: EducationPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = parseEducationPayload(payload);
  if (!parsed) {
    return NextResponse.json({ error: "School is required" }, { status: 400 });
  }

  const { count: existingCount } = await supabase
    .from("profile_education")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  const { data, error } = await supabase
    .from("profile_education")
    .insert({ ...parsed, user_id: user.id, order_index: existingCount ?? 0 })
    .select("id, school, degree, field_of_study, start_date, end_date, description")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Could not add education" }, { status: 500 });
  }

  return NextResponse.json(
    {
      item: {
        id: data.id,
        school: data.school,
        degree: data.degree,
        fieldOfStudy: data.field_of_study,
        startDate: data.start_date,
        endDate: data.end_date,
        description: data.description,
      },
    },
    { status: 201 }
  );
}
