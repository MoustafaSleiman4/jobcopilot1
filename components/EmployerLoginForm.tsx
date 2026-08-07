"use client";

import { useEffect, useState, FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import Logo from "@/components/Logo";
import EmployerAuthShell from "@/components/EmployerAuthShell";
import { createClient } from "@/lib/supabase/client";
import { useAuthUser } from "@/lib/useAuthUser";
import { Briefcase } from "lucide-react";

/**
 * Employer login — same Supabase Auth as job-seeker login (see
 * EmployerSignupForm's comment), just redirects into /employer/dashboard
 * instead of /dashboard. The dashboard layout itself is what actually
 * verifies this session owns a company row; a job seeker who wandered in
 * here and somehow signed in would just get redirected to
 * /employer/onboarding from there rather than seeing an error here.
 */
export default function EmployerLoginForm() {
  const t = useTranslations("employer.login");
  const router = useRouter();
  const { user, loading: checkingSession } = useAuthUser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!checkingSession && user) {
      router.replace("/employer/dashboard");
    }
  }, [checkingSession, user, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.push("/employer/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  if (user) return null;

  return (
    <EmployerAuthShell>
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-sm">
        <Link href="/" className="mb-8 flex justify-center lg:hidden">
          <Logo />
        </Link>
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <Briefcase size={22} />
        </div>
        <h1 className="text-center text-2xl font-bold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-center text-sm text-foreground/60">{t("subtitle")}</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground/80">{t("email")}</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="mb-1.5 block text-sm font-medium text-foreground/80">{t("password")}</label>
              <Link href="/forgot-password" className="mb-1.5 text-sm font-medium text-emerald-600 hover:underline">
                {t("forgotLink")}
              </Link>
            </div>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-emerald-600 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-60"
          >
            {t("submit")}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-foreground/60">
          {t("noAccount")}{" "}
          <Link href="/employer/signup" className="font-semibold text-emerald-600 hover:underline">
            {t("signupLink")}
          </Link>
        </p>
      </div>
    </EmployerAuthShell>
  );
}
