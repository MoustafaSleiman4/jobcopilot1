import type { SupabaseClient } from "@supabase/supabase-js";
import type { Job, WorkType } from "@/lib/jobSources";

// Shared vocab reused by the employer job-posting form, the company profile
// form, and the search/Auto Apply merge below — kept here (not duplicated
// inline in each component) so the posting form and the DB check
// constraints in supabase/employer-companies.sql can't quietly drift apart.
export const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "internship"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"] as const;
export type CompanySize = (typeof COMPANY_SIZES)[number];

export type Company = {
  id: string;
  owner_id: string;
  name: string;
  website: string | null;
  industry: string | null;
  company_size: CompanySize | null;
  logo_url: string | null;
  description: string | null;
  hq_location: string | null;
  contact_email: string | null;
  created_at: string;
  updated_at: string;
};

export type CompanyJobStatus = "active" | "closed" | "draft";
export type ApplyMethod = "url" | "email";

export type CompanyJob = {
  id: string;
  company_id: string;
  title: string;
  description: string;
  responsibilities: string | null;
  requirements: string | null;
  location: string;
  work_type: WorkType;
  employment_type: EmploymentType;
  industry: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  apply_method: ApplyMethod;
  apply_url: string | null;
  apply_email: string | null;
  status: CompanyJobStatus;
  created_at: string;
  updated_at: string;
};

type CompanyJobWithCompanyName = CompanyJob & { companies: { name: string } | null };

/**
 * Turns one active employer-posted job (plus its company's name) into the
 * same shared `Job` shape every other source (Greenhouse, the cached Jooble/
 * Careerjet/SerpApi pool, RemoteOK, the curated fallback list) already
 * produces — this is what lets company_jobs slot straight into
 * app/api/jobs/search/route.ts's and Auto Apply's existing result pools
 * with zero special-casing downstream.
 */
function toJob(row: CompanyJobWithCompanyName): Job {
  return {
    id: `company-job-${row.id}`,
    title: row.title,
    company: row.companies?.name || "—",
    location: row.location,
    applyUrl:
      row.apply_method === "email" && row.apply_email
        ? `mailto:${row.apply_email}?subject=${encodeURIComponent(`Application: ${row.title}`)}`
        : row.apply_url || "",
    applyType: "external",
    industry: row.industry || "Other",
    workType: row.work_type,
    // Real posting date — when the employer created this listing.
    postedAt: row.created_at,
  };
}

/**
 * Every currently-active employer-posted job, mapped to the shared `Job`
 * shape — call alongside fetchFreeSourceJobs()/getCachedJobs() and spread
 * the result into the same combined pool (see app/api/jobs/search/route.ts
 * and both Auto Apply routes). Cheap: a single indexed read
 * (company_jobs_status_idx), no pagination needed yet at the volume a
 * free-tier employer-posting feature will see for a long while — if that
 * ever changes, this is the one place to add the same .range() pagination
 * getCachedJobs() already uses.
 */
export async function getActiveCompanyJobs(admin: SupabaseClient): Promise<Job[]> {
  const { data, error } = await admin
    .from("company_jobs")
    .select(
      "id, company_id, title, description, responsibilities, requirements, location, work_type, employment_type, industry, salary_min, salary_max, salary_currency, apply_method, apply_url, apply_email, status, created_at, updated_at, companies ( name )"
    )
    .eq("status", "active");

  if (error || !data) return [];
  return (data as unknown as CompanyJobWithCompanyName[]).map(toJob);
}
