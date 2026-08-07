"use client";

import { useEffect, useState, FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import Logo from "@/components/Logo";
import { createClient } from "@/lib/supabase/client";
import { useAuthUser } from "@/lib/useAuthUser";
import { Building2 } from "lucide-react";

/**
 * Fallback landing spot for a signed-in account with no public.companies
 * row yet — normally EmployerSignupForm creates that row right after
 * signup, so this page is only reached if that insert failed transiently,
 * or a job seeker's session ended up at /employer/dashboard directly (see
 * the layout's redirect). Either way, one field gets them unblocked instead
 * of a dead end.
 */
export default function EmployerOnboardingPage() {
  const t = useTranslations("employer.onboarding");
  const router = useRouter();
  const { user, loading: checkingSession } = useAuthUser();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!checkingSession && !user) {
      router.replace("/employer/login");
    }
  }, [checkingSession, user, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("companies")
        .upsert({ owner_id: user.id, name, contact_email: user.email }, { onConflict: "owner_id" });
      if (error) throw error;
      router.push("/employer/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  if (checkingSession || !user) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-sand-100 px-6 py-16">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-sm">
        <Link href="/" className="mb-8 flex justify-center">
          <Logo />
        </Link>
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <Building2 size={22} />
        </div>
        <h1 className="text-center text-2xl font-bold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-center text-sm text-foreground/60">{t("subtitle")}</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground/80">{t("companyName")}</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-full bg-emerald-600 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-60"
          >
            {saving ? t("saving") : t("continue")}
          </button>
        </form>
      </div>
    </div>
  );
}
