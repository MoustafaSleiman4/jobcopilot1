"use client";

import { useEffect, useState, FormEvent } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import Logo from "@/components/Logo";
import AuthShell from "@/components/AuthShell";
import { createClient } from "@/lib/supabase/client";
import { useAuthUser } from "@/lib/useAuthUser";
import { MailCheck, Loader2 } from "lucide-react";

export default function SignupForm() {
  const t = useTranslations("auth.signup");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: checkingSession } = useAuthUser();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Set once signUp() succeeds but Supabase reports no active session — this
  // means the project has "Confirm email" enabled and the account can't log
  // in yet until the confirmation link is clicked. Previously the code just
  // pushed straight to /dashboard regardless, which silently bounced an
  // unconfirmed user back to /login with zero explanation of why signup
  // "didn't work."
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  // Set when arriving from the pricing page's Pro CTA ("/signup?plan=monthly"
  // or "?plan=yearly") — carries the intent to pay through account creation
  // so signing up doesn't strand the person back on a dashboard with no way
  // to finish upgrading.
  const planParam = searchParams.get("plan");
  const pendingPlan = planParam === "monthly" || planParam === "yearly" ? planParam : null;

  useEffect(() => {
    if (!checkingSession && user) {
      router.replace("/dashboard");
    }
  }, [checkingSession, user, router]);

  // Shared by both paths that can end with a real session: signing up
  // straight into an already-confirmed session (confirmation disabled), and
  // successfully verifying the 6-digit code after confirmation was
  // required. Either way, from here on the account is usable.
  async function proceedAfterSession(uid: string | undefined) {
    if (pendingPlan && uid) {
      try {
        const redirectUrl = `${window.location.origin}/${locale}/dashboard?upgraded=1`;
        const res = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId: pendingPlan, userId: uid, email, redirectUrl }),
        });
        const checkout = await res.json();
        if (res.ok && checkout.url) {
          window.location.href = checkout.url;
          return;
        }
      } catch {
        // Checkout couldn't be started (billing not configured yet, or a
        // network hiccup) — fall through to the dashboard rather than
        // blocking account creation, which already succeeded.
      }
    }
    router.push("/dashboard");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name } },
      });
      if (error) throw error;

      if (!data.session) {
        // No session back means email confirmation is required before this
        // account can actually log in — Supabase already sent the
        // confirmation email (and, since the "Confirm signup" template
        // includes {{ .Token }}, a 6-digit code alongside the link) as part
        // of signUp(). Show that state instead of pretending signup
        // finished and sending them somewhere that will just redirect them
        // straight to /login.
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

  // The clickable link in the confirmation email is vulnerable to email
  // providers (notably Outlook/Hotmail's "Safe Links") auto-opening it to
  // scan for safety, which silently burns the one-time link before the
  // person ever clicks it themselves — this is exactly what happened when
  // testing with a hotmail.com address. Typing in the 6-digit code instead
  // isn't affected by link-prescanning at all, since nothing auto-enters a
  // code from a scanned email body.
  async function handleVerifyCode(e: FormEvent) {
    e.preventDefault();
    setCodeError(null);
    setVerifying(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: code.trim(),
        type: "signup",
      });
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
      <AuthShell>
        <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-sm">
          <Link href="/" className="mb-8 flex justify-center lg:hidden">
            <Logo />
          </Link>
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <MailCheck size={26} />
          </div>
          <h1 className="text-xl font-bold text-foreground">{t("confirmTitle")}</h1>
          <p className="mt-2 text-sm text-foreground/70">
            {t("confirmBody", { email })}
          </p>
          <p className="mt-4 text-xs text-foreground/50">{t("confirmSpam")}</p>

          <form onSubmit={handleVerifyCode} className="mt-6 text-start">
            <label className="mb-1.5 block text-sm font-medium text-foreground/80">
              {t("codeLabel")}
            </label>
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

          <p className="mt-4 text-xs text-foreground/50">{t("orClickLink")}</p>

          <button
            type="button"
            onClick={handleResend}
            disabled={resendState === "sending"}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-sand-100 disabled:opacity-60"
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
            <Link href="/login" className="font-semibold text-emerald-600 hover:underline">
              {t("backToLogin")}
            </Link>
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-sm">
        <Link href="/" className="mb-8 flex justify-center lg:hidden">
          <Logo />
        </Link>
        <h1 className="text-center text-2xl font-bold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-center text-sm text-foreground/60">{t("subtitle")}</p>

        {pendingPlan && (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-center text-xs font-medium text-emerald-700">
            {t("pendingPlanNotice")}
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground/80">
              {t("name")}
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground/80">
              {t("email")}
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground/80">
              {t("password")}
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-emerald-600 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-60"
          >
            {loading && pendingPlan ? t("redirectingToCheckout") : t("submit")}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-foreground/60">
          {t("hasAccount")}{" "}
          <Link href="/login" className="font-semibold text-emerald-600 hover:underline">
            {t("loginLink")}
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
