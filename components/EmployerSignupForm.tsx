"use client";

import { useEffect, useState, FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import Logo from "@/components/Logo";
import EmployerAuthShell from "@/components/EmployerAuthShell";
import { createClient } from "@/lib/supabase/client";
import { useAuthUser } from "@/lib/useAuthUser";
import { isProfessionalEmail } from "@/lib/professionalEmail";
import { MailCheck, Loader2, Briefcase } from "lucide-react";

/**
 * Employer signup — deliberately minimal (company name, work email,
 * password) rather than asking for the full company profile up front. The
 * rest (website, industry, size, logo, description, HQ) gets filled in on
 * the Company Profile page inside the employer dashboard, at the
 * employer's own pace, right before or after their first posting — the
 * same "collect the minimum to create the account, complete the profile
 * later" pattern most B2B signup flows use, rather than a long form that
 * risks losing someone before they even have an account.
 *
 * Uses the SAME Supabase Auth (auth.users) as job-seeker signup — an
 * employer account isn't a different auth system, just a different account
 * that also owns a row in public.companies. That row is what the employer
 * dashboard layout checks for (see app/[locale]/employer/dashboard/layout.tsx)
 * to tell an employer session apart from a job-seeker one; nothing on
 * public.profiles is touched or relied on here.
 */
export default function EmployerSignupForm() {
  const t = useTranslations("employer.signup");
  const router = useRouter();
  const { user, loading: checkingSession } = useAuthUser();
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Same defensive "email confirmation might be on" handling as the
  // job-seeker SignupForm — in practice confirmation is disabled for this
  // project (signup logs straight in), but this keeps the employer flow
  // from silently breaking if that setting ever changes.
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (!checkingSession && user) {
      router.replace("/employer/dashboard");
    }
  }, [checkingSession, user, router]);

  // Shared by both paths that can end with a real session: an immediate
  // session from signUp() (confirmation disabled), and a session obtained
  // after verifying the 6-digit code. Either way, this is the one place
  // that actually creates the companies row — upsert on owner_id so a retry
  // after a transient failure never errors on the unique constraint.
  async function proceedAfterSession(uid: string | undefined) {
    if (!uid) {
      router.push("/employer/dashboard");
      return;
    }
    try {
      const supabase = createClient();
      await supabase
        .from("companies")
        .upsert({ owner_id: uid, name: companyName, contact_email: email }, { onConflict: "owner_id" });
    } catch {
      // The dashboard layout falls back to /employer/onboarding if no
      // company row ends up existing — not a dead end even if this failed.
    }
    router.push("/employer/dashboard");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isProfessionalEmail(email)) {
      setError(t("professionalEmailError"));
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: companyName, account_type: "employer" } },
      });
      if (error) throw error;

      if (!data.session) {
        setNeedsConfirmation(true);
        setLoading(false);
        return;
      }

      await proceedAfterSession(data.user?.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResendState("sending");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resend({ type: "signup", email });
      if (error) throw error;
      setResendState("sent");
    } catch {
      setResendState("error");
    }
  }

  async function handleVerifyCode(e: FormEvent) {
    e.preventDefault();
    setCodeError(null);
    setVerifying(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: "signup" });
      if (error) throw error;
      await proceedAfterSession(data.user?.id);
    } catch (err) {
      setCodeError(err instanceof Error ? err.message : t("codeError"));
    } finally {
      setVerifying(false);
    }
  }

  if (user) return null;

  if (needsConfirmation) {
    return (
      <EmployerAuthShell>
        <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-sm">
          <Link href="/" className="mb-8 flex justify-center lg:hidden">
            <Logo />
          </Link>
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <MailCheck size={26} />
          </div>
          <h1 className="text-xl font-bold text-foreground">{t("confirmTitle")}</h1>
          <p className="mt-2 text-sm text-foreground/70">{t("confirmBody", { email })}</p>

          <form onSubmit={handleVerifyCode} className="mt-6 text-start">
            <label className="mb-1.5 block text-sm font-medium text-foreground/80">{t("codeLabel")}</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t("codePlaceholder")}
              className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-center text-lg font-semibold tracking-widest focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
            {codeError && <p className="mt-2 text-xs font-medium text-red-600">{codeError}</p>}
            <button
              type="submit"
              disabled={verifying || !code.trim()}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {verifying && <Loader2 className="animate-spin" size={15} />}
              {verifying ? t("verifying") : t("verifyCode")}
            </button>
          </form>

          <button
            type="button"
            onClick={handleResend}
            disabled={resendState === "sending"}
            className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-sand-100 disabled:opacity-60"
          >
            {resendState === "sending" && <Loader2 className="animate-spin" size={15} />}
            {resendState === "sending" ? t("resendSending") : t("resendButton")}
          </button>
          {resendState === "sent" && (
            <p className="mt-2 text-xs font-medium text-emerald-600">{t("resendSent")}</p>
          )}
          {resendState === "error" && (
            <p className="mt-2 text-xs font-medium text-red-600">{t("resendError")}</p>
          )}

          <p className="mt-6 text-sm text-foreground/60">
            <Link href="/employer/login" className="font-semibold text-emerald-600 hover:underline">
              {t("backToLogin")}
            </Link>
          </p>
        </div>
      </EmployerAuthShell>
    );
  }

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
            <label className="mb-1.5 block text-sm font-medium text-foreground/80">{t("companyName")}</label>
            <input
              type="text"
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground/80">{t("workEmail")}</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("workEmailPlaceholder")}
              className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
            <p className="mt-1.5 text-xs text-foreground/50">{t("workEmailHint")}</p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground/80">{t("password")}</label>
            <input
              type="password"
              required
              minLength={8}
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
            {loading ? t("submitting") : t("submit")}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-foreground/60">
          {t("hasAccount")}{" "}
          <Link href="/employer/login" className="font-semibold text-emerald-600 hover:underline">
            {t("loginLink")}
          </Link>
        </p>
        <p className="mt-3 text-center text-xs text-foreground/40">
          {t("jobSeeker")}{" "}
          <Link href="/signup" className="font-medium text-foreground/60 hover:underline">
            {t("jobSeekerLink")}
          </Link>
        </p>
      </div>
    </EmployerAuthShell>
  );
}
