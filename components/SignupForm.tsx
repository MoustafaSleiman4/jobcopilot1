"use client";

import { useEffect, useState, FormEvent } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import Logo from "@/components/Logo";
import { createClient } from "@/lib/supabase/client";
import { useAuthUser } from "@/lib/useAuthUser";

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

      const uid = data.user?.id;
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  if (user) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-sand-100 px-6 py-16">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-sm">
        <Link href="/" className="mb-8 flex justify-center">
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
    </div>
  );
}
