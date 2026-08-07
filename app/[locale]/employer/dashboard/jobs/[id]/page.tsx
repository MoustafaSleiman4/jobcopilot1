"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuthUser } from "@/lib/useAuthUser";
import CompanyJobForm from "@/components/CompanyJobForm";
import type { CompanyJob } from "@/lib/companyJobs";

/**
 * Edit wrapper for an existing posting. Mirrors jobs/new/page.tsx's
 * companyId lookup, then also fetches the company_jobs row by id — scoped
 * to `.eq("company_id", company.id)` (not just `.eq("id", id)`) so this
 * route can never load, and CompanyJobForm can never resave, a posting that
 * belongs to a different employer's company, even though RLS would already
 * block the actual write.
 */
export default function EditCompanyJobPage() {
  const t = useTranslations("employer.jobForm");
  const params = useParams<{ id: string }>();
  const jobId = params.id;
  const { loading: userLoading } = useAuthUser();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [job, setJob] = useState<CompanyJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

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
          .select("id")
          .eq("owner_id", uid)
          .maybeSingle();
        if (cancelled || !company) return;
        setCompanyId(company.id as string);

        const { data: row } = await supabase
          .from("company_jobs")
          .select("*")
          .eq("id", jobId)
          .eq("company_id", company.id)
          .maybeSingle();
        if (cancelled) return;
        if (!row) {
          setNotFound(true);
        } else {
          setJob(row as CompanyJob);
        }
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [userLoading, jobId]);

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/employer/dashboard"
        className="mb-4 flex w-fit items-center gap-1.5 text-sm font-medium text-foreground/60 hover:text-foreground"
      >
        <ArrowLeft size={15} />
        {t("backToPostings")}
      </Link>
      <h1 className="text-2xl font-bold text-foreground">{t("editTitle")}</h1>
      <p className="mt-1 text-sm text-foreground/60">{t("editSubtitle")}</p>

      <div className="mt-6">
        {loading || userLoading ? (
          <p className="text-sm text-foreground/50">{t("loadingForm")}</p>
        ) : notFound || !companyId || !job ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{t("jobNotFound")}</p>
        ) : (
          <CompanyJobForm companyId={companyId} initialJob={job} onSaved={() => {}} />
        )}
      </div>
    </div>
  );
}
