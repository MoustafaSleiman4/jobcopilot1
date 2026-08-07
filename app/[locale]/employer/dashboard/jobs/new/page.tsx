"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuthUser } from "@/lib/useAuthUser";
import CompanyJobForm from "@/components/CompanyJobForm";

/**
 * Thin wrapper that resolves the signed-in employer's companyId before
 * rendering the shared CompanyJobForm in "create" mode (no initialJob).
 * CompanyJobForm itself handles the insert and the redirect back to
 * /employer/dashboard once saved — this page's only job is looking up
 * companyId, which the layout above has already confirmed exists (it
 * redirects to /employer/onboarding otherwise), so the lookup here is
 * expected to always succeed for anyone who reaches this route normally.
 */
export default function NewCompanyJobPage() {
  const t = useTranslations("employer.jobForm");
  const { loading: userLoading } = useAuthUser();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
        if (!cancelled) setCompanyId((company?.id as string) ?? null);
      } catch {
        // Handled by the empty state below.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [userLoading]);

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/employer/dashboard"
        className="mb-4 flex w-fit items-center gap-1.5 text-sm font-medium text-foreground/60 hover:text-foreground"
      >
        <ArrowLeft size={15} />
        {t("backToPostings")}
      </Link>
      <h1 className="text-2xl font-bold text-foreground">{t("newTitle")}</h1>
      <p className="mt-1 text-sm text-foreground/60">{t("newSubtitle")}</p>

      <div className="mt-6">
        {loading || userLoading ? (
          <p className="text-sm text-foreground/50">{t("loadingForm")}</p>
        ) : companyId ? (
          <CompanyJobForm companyId={companyId} onSaved={() => {}} />
        ) : (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{t("companyLookupError")}</p>
        )}
      </div>
    </div>
  );
}
