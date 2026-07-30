"use client";

import { useState, FormEvent } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import Logo from "@/components/Logo";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordForm() {
  const t = useTranslations("auth.forgotPassword");
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/${locale}/reset-password`
          : undefined;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      // Always show the same success state whether or not the email is
      // registered — never reveal account existence via this form.
      setSent(true);
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

        {sent ? (
          <p className="mt-8 rounded-lg bg-emerald-50 px-4 py-3 text-center text-sm text-emerald-700">
            {t("success")}
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
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

        <p className="mt-6 text-center text-sm text-foreground/60">
          <Link href="/login" className="font-semibold text-emerald-600 hover:underline">
            {t("backToLogin")}
          </Link>
        </p>
      </div>
    </div>
  );
}
