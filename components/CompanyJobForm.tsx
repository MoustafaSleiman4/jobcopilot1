"use client";

import { useState, FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { LOCATIONS, INDUSTRY_KEYWORDS } from "@/lib/jobSources";
import { EMPLOYMENT_TYPES, type CompanyJob, type ApplyMethod } from "@/lib/companyJobs";
import { Loader2 } from "lucide-react";

const WORK_TYPES = ["remote", "hybrid", "onsite"] as const;
const CURRENCIES = ["USD", "AED", "SAR", "QAR", "KWD", "BHD", "OMR", "EGP", "LBP", "JOD"];
const INDUSTRY_NAMES = INDUSTRY_KEYWORDS.map(([name]) => name);

export type CompanyJobFormValues = {
  title: string;
  description: string;
  responsibilities: string;
  requirements: string;
  location: string;
  work_type: (typeof WORK_TYPES)[number];
  employment_type: (typeof EMPLOYMENT_TYPES)[number];
  industry: string;
  salary_min: string;
  salary_max: string;
  salary_currency: string;
  apply_method: ApplyMethod;
  apply_url: string;
  apply_email: string;
};

const EMPTY_VALUES: CompanyJobFormValues = {
  title: "",
  description: "",
  responsibilities: "",
  requirements: "",
  location: LOCATIONS[0],
  work_type: "onsite",
  employment_type: "full_time",
  industry: "",
  salary_min: "",
  salary_max: "",
  salary_currency: "USD",
  apply_method: "url",
  apply_url: "",
  apply_email: "",
};

function jobToValues(job: CompanyJob): CompanyJobFormValues {
  return {
    title: job.title,
    description: job.description,
    responsibilities: job.responsibilities || "",
    requirements: job.requirements || "",
    location: job.location,
    work_type: job.work_type,
    employment_type: job.employment_type,
    industry: job.industry || "",
    salary_min: job.salary_min != null ? String(job.salary_min) : "",
    salary_max: job.salary_max != null ? String(job.salary_max) : "",
    salary_currency: job.salary_currency || "USD",
    apply_method: job.apply_method,
    apply_url: job.apply_url || "",
    apply_email: job.apply_email || "",
  };
}

/**
 * Shared create/edit form for an employer job posting — used by both
 * app/[locale]/employer/dashboard/jobs/new/page.tsx and .../jobs/[id]/page.tsx
 * so the two flows can't drift out of sync on fields/validation. Direct
 * client-side Supabase insert/update (same convention as the job-seeker
 * dashboard's applications page), relying on the RLS policies in
 * supabase/employer-companies.sql rather than a custom API route.
 */
export default function CompanyJobForm({
  companyId,
  initialJob,
  onSaved,
}: {
  companyId: string;
  initialJob?: CompanyJob;
  onSaved: (job: CompanyJob) => void;
}) {
  const t = useTranslations("employer.jobForm");
  const router = useRouter();
  const [values, setValues] = useState<CompanyJobFormValues>(initialJob ? jobToValues(initialJob) : EMPTY_VALUES);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<"draft" | "active" | "update" | null>(null);

  function set<K extends keyof CompanyJobFormValues>(key: K, value: CompanyJobFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function buildPayload(status: CompanyJob["status"]) {
    return {
      company_id: companyId,
      title: values.title.trim(),
      description: values.description.trim(),
      responsibilities: values.responsibilities.trim() || null,
      requirements: values.requirements.trim() || null,
      location: values.location,
      work_type: values.work_type,
      employment_type: values.employment_type,
      industry: values.industry || null,
      salary_min: values.salary_min ? Number(values.salary_min) : null,
      salary_max: values.salary_max ? Number(values.salary_max) : null,
      salary_currency: values.salary_currency || "USD",
      apply_method: values.apply_method,
      apply_url: values.apply_method === "url" ? values.apply_url.trim() : null,
      apply_email: values.apply_method === "email" ? values.apply_email.trim() : null,
      status,
    };
  }

  async function handleSubmit(e: FormEvent, statusOverride?: CompanyJob["status"]) {
    e.preventDefault();
    setError(null);

    if (values.apply_method === "url" && !values.apply_url.trim()) {
      setError(t("applyUrlRequired"));
      return;
    }
    if (values.apply_method === "email" && !values.apply_email.trim()) {
      setError(t("applyEmailRequired"));
      return;
    }

    const status = statusOverride ?? initialJob?.status ?? "active";
    setSaving(initialJob ? "update" : status === "draft" ? "draft" : "active");
    try {
      const supabase = createClient();
      const payload = buildPayload(status);

      if (initialJob) {
        const { data, error } = await supabase
          .from("company_jobs")
          .update(payload)
          .eq("id", initialJob.id)
          .select()
          .single();
        if (error) throw error;
        onSaved(data as CompanyJob);
      } else {
        const { data, error } = await supabase.from("company_jobs").insert(payload).select().single();
        if (error) throw error;
        onSaved(data as CompanyJob);
      }
      router.push("/employer/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(null);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20";
  const labelClass = "mb-1.5 block text-sm font-medium text-foreground/80";

  return (
    <form onSubmit={(e) => handleSubmit(e)} className="space-y-6">
      <div className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold text-foreground">{t("basicsHeading")}</h2>
        <div className="mt-4 space-y-4">
          <div>
            <label className={labelClass}>{t("title")}</label>
            <input
              type="text"
              required
              value={values.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder={t("titlePlaceholder")}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>{t("description")}</label>
            <textarea
              required
              rows={5}
              value={values.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder={t("descriptionPlaceholder")}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>{t("responsibilities")}</label>
            <textarea
              rows={4}
              value={values.responsibilities}
              onChange={(e) => set("responsibilities", e.target.value)}
              placeholder={t("responsibilitiesPlaceholder")}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>{t("requirements")}</label>
            <textarea
              rows={4}
              value={values.requirements}
              onChange={(e) => set("requirements", e.target.value)}
              placeholder={t("requirementsPlaceholder")}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold text-foreground">{t("detailsHeading")}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>{t("location")}</label>
            <select value={values.location} onChange={(e) => set("location", e.target.value)} className={inputClass}>
              {LOCATIONS.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>{t("workType")}</label>
            <select
              value={values.work_type}
              onChange={(e) => set("work_type", e.target.value as CompanyJobFormValues["work_type"])}
              className={inputClass}
            >
              {WORK_TYPES.map((wt) => (
                <option key={wt} value={wt}>
                  {t(`workTypes.${wt}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>{t("employmentType")}</label>
            <select
              value={values.employment_type}
              onChange={(e) => set("employment_type", e.target.value as CompanyJobFormValues["employment_type"])}
              className={inputClass}
            >
              {EMPLOYMENT_TYPES.map((et) => (
                <option key={et} value={et}>
                  {t(`employmentTypes.${et}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>{t("industry")}</label>
            <select value={values.industry} onChange={(e) => set("industry", e.target.value)} className={inputClass}>
              <option value="">{t("industryUnset")}</option>
              {INDUSTRY_NAMES.map((ind) => (
                <option key={ind} value={ind}>
                  {ind}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4">
          <label className={labelClass}>{t("salaryRange")}</label>
          <div className="grid grid-cols-3 gap-3">
            <input
              type="number"
              min={0}
              value={values.salary_min}
              onChange={(e) => set("salary_min", e.target.value)}
              placeholder={t("salaryMin")}
              className={inputClass}
            />
            <input
              type="number"
              min={0}
              value={values.salary_max}
              onChange={(e) => set("salary_max", e.target.value)}
              placeholder={t("salaryMax")}
              className={inputClass}
            />
            <select
              value={values.salary_currency}
              onChange={(e) => set("salary_currency", e.target.value)}
              className={inputClass}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <p className="mt-1.5 text-xs text-foreground/50">{t("salaryOptionalHint")}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold text-foreground">{t("applyHeading")}</h2>
        <div className="mt-4 flex gap-4">
          <label className="flex items-center gap-2 text-sm text-foreground/80">
            <input
              type="radio"
              name="apply_method"
              checked={values.apply_method === "url"}
              onChange={() => set("apply_method", "url")}
              className="h-4 w-4 text-emerald-600"
            />
            {t("applyViaUrl")}
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground/80">
            <input
              type="radio"
              name="apply_method"
              checked={values.apply_method === "email"}
              onChange={() => set("apply_method", "email")}
              className="h-4 w-4 text-emerald-600"
            />
            {t("applyViaEmail")}
          </label>
        </div>
        <div className="mt-3">
          {values.apply_method === "url" ? (
            <input
              type="url"
              value={values.apply_url}
              onChange={(e) => set("apply_url", e.target.value)}
              placeholder="https://yourcompany.com/careers/role"
              className={inputClass}
            />
          ) : (
            <input
              type="email"
              value={values.apply_email}
              onChange={(e) => set("apply_email", e.target.value)}
              placeholder="careers@yourcompany.com"
              className={inputClass}
            />
          )}
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        {initialJob ? (
          <button
            type="submit"
            disabled={saving !== null}
            className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {saving === "update" && <Loader2 className="animate-spin" size={15} />}
            {t("saveChanges")}
          </button>
        ) : (
          <>
            <button
              type="submit"
              disabled={saving !== null}
              className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              onClick={(e) => handleSubmit(e, "active")}
            >
              {saving === "active" && <Loader2 className="animate-spin" size={15} />}
              {t("publish")}
            </button>
            <button
              type="button"
              disabled={saving !== null}
              onClick={(e) => handleSubmit(e, "draft")}
              className="flex items-center gap-1.5 rounded-full border border-border px-6 py-3 text-sm font-semibold text-foreground hover:bg-sand-100 disabled:opacity-60"
            >
              {saving === "draft" && <Loader2 className="animate-spin" size={15} />}
              {t("saveDraft")}
            </button>
          </>
        )}
      </div>
    </form>
  );
}
