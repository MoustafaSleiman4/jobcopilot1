"use client";

import { useState, FormEvent, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import Logo from "@/components/Logo";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordForm() {
  const t = useTranslations("auth.resetPassword");
  const router = useRouter();
  const searchParams = useSearchParams();

  // Supabase's password-recovery email link can land here in one of two
  // shapes depending on the project's auth flow setting: a `?code=...` query
  // param (PKCE — needs exchanging for a session) or `#access_token=...` in
  // the URL hash, which the browser client already auto-detects on load
  // (createBrowserClient defaults detectSessionInUrl to true). This checks
  // for both so the reset link works regardless of which flow is active.
  const [checkingLink, setCheckingLink] = useState(true);
  const [linkValid, setLinkValid] = useState(false);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function verifyRecoveryLink() {
      try {
        const supabase = createClient();
        const code = searchParams.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }
        // Give the implicit-flow hash fragment a brief moment to be parsed
        // by the client SDK, then check whether we actually have a session.
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!cancelled) setLinkValid(Boolean(session));
      } catch {
        if (!cancelled) setLinkValid(false);
      } finally {
        if (!cancelled) setCheckingLink(false);
      }
    }

    verifyRecoveryLink();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError(t("mismatch"));
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
      setTimeout(() => router.push("/dashboard"), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-sand-100 px-6 py-16">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-sm">
        <Link href="/" className="mb-8 flex justify-center">
          <Logo />
        </Link>
        <h1 className="text-center text-2xl font-bold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-center text-sm text-foreground/60">{t("subtitle")}</p>

        {checkingLink ? (
          <p className="mt-8 text-center text-sm text-foreground/50">…</p>
        ) : success ? (
          <p className="mt-8 rounded-lg bg-emerald-50 px-4 py-3 text-center text-sm text-emerald-700">
            {t("success")}
          </p>
        ) : !linkValid ? (
          <div className="mt-8 space-y-4 text-center">
            <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
              {t("invalidLink")}
            </p>
            <Link
              href="/forgot-password"
              className="inline-block font-semibold text-emerald-600 hover:underline"
            >
              {t("requestNewLink")}
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
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
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground/80">
                {t("confirmPassword")}
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
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
              {t("submit")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
