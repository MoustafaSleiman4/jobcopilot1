"use client";

import { useEffect, useState, FormEvent } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useAuthUser } from "@/lib/useAuthUser";
import { COMPANY_SIZES, type Company, type CompanySize } from "@/lib/companyJobs";
import { LOCATIONS, INDUSTRY_KEYWORDS } from "@/lib/jobSources";
import { Loader2, CheckCircle2 } from "lucide-react";

const INDUSTRY_NAMES = INDUSTRY_KEYWORDS.map(([name]) => name);

type FormValues = {
  name: string;
  website: string;
  industry: string;
  company_size: CompanySize | "";
  logo_url: string;
  description: string;
  hq_location: string;
  contact_email: string;
};

const EMPTY_VALUES: FormValues = {
  name: "",
  website: "",
  industry: "",
  company_size: "",
  logo_url: "",
  description: "",
  hq_location: "",
  contact_email: "",
};

/**
 * Company profile editor — the fields deliberately deferred off the signup
 * form (see EmployerSignupForm's comment) live here instead, filled in at
 * the employer's own pace. Direct client-side Supabase update on the
 * companies row, same convention as CompanyJobForm.
 */
export default function EmployerProfilePage() {
  const t = useTranslations("employer.profile");
  const { user, loading: userLoading } = useAuthUser();
  const [values, setValues] = useState<FormValues>(EMPTY_VALUES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (userLoading) return;
    let cancelled = false;
    async function load() {
      try {
        const supabase = createClient();
        const { data: authData } = await supabase.auth.getUser();
        const uid = authData.user?.id;
        if (!uid) return;
        const { data: company } = await supabase
          .from("companies")
          .select("*")
          .eq("owner_id", uid)
          .maybeSingle();
        if (cancelled) return;
        if (company) {
          const c = company as Company;
          setValues({
            name: c.name || "",
            website: c.website || "",
            industry: c.industry || "",
            company_size: c.company_size || "",
            logo_url: c.logo_url || "",
            description: c.description || "",
            hq_location: c.hq_location || "",
            contact_email: c.contact_email || "",
          });
        }
      } catch {
        // Handled by disabled form state below.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [userLoading]);

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setSaved(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);
    setSaving(true);
    setSaved(false);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("companies")
        .update({
          name: values.name.trim(),
          website: values.website.trim() || null,
          industry: values.industry || null,
          company_size: values.company_size || null,
          logo_url: values.logo_url.trim() || null,
          description: values.description.trim() || null,
          hq_location: values.hq_location || null,
          contact_email: values.contact_email.trim() || null,
        })
        .eq("owner_id", user.id);
      if (error) throw error;
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20";
  const labelClass = "mb-1.5 block text-sm font-medium text-foreground/80";

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
      <p className="mt-1 text-sm text-foreground/60">{t("subtitle")}</p>

      {loading || userLoading ? (
        <p className="mt-6 text-sm text-foreground/50">{t("loading")}</p>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4 rounded-2xl border border-border bg-surface p-6">
          <div>
            <label className={labelClass}>{t("companyName")}</label>
            <input
              type="text"
              required
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>{t("website")}</label>
            <input
              type="url"
              value={values.website}
              onChange={(e) => set("website", e.target.value)}
              placeholder="https://yourcompany.com"
              className={inputClass}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
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
            <div>
              <label className={labelClass}>{t("companySize")}</label>
              <select
                value={values.company_size}
                onChange={(e) => set("company_size", e.target.value as FormValues["company_size"])}
                className={inputClass}
              >
                <option value="">{t("companySizeUnset")}</option>
                {COMPANY_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className={labelClass}>{t("hqLocation")}</label>
            <select value={values.hq_location} onChange={(e) => set("hq_location", e.target.value)} className={inputClass}>
              <option value="">{t("hqLocationUnset")}</option>
              {LOCATIONS.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>{t("logoUrl")}</label>
            <input
              type="url"
              value={values.logo_url}
              onChange={(e) => set("logo_url", e.target.value)}
              placeholder="https://yourcompany.com/logo.png"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>{t("description")}</label>
            <textarea
              rows={5}
              value={values.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder={t("descriptionPlaceholder")}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>{t("contactEmail")}</label>
            <input
              type="email"
              value={values.contact_email}
              onChange={(e) => set("contact_email", e.target.value)}
              className={inputClass}
            />
          </div>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving && <Loader2 className="animate-spin" size={15} />}
              {saving ? t("saving") : t("save")}
            </button>
            {saved && (
              <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                <CheckCircle2 size={15} />
                {t("saved")}
              </span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
