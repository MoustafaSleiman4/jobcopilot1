"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Check, Loader2, BadgeCheck, ShieldCheck, RefreshCw, CreditCard } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuthUser } from "@/lib/useAuthUser";
import { createClient } from "@/lib/supabase/client";

export default function PricingCards() {
  const t = useTranslations("pricing");
  const locale = useLocale();
  const router = useRouter();
  const { user, loading: checkingSession, configured } = useAuthUser();
  const [yearly, setYearly] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  // "pro" here only ever means "already has an active Pro subscription" —
  // used purely to stop a Pro user from opening a second Lemon Squeezy
  // checkout for a plan they already have (which previously silently
  // created a second, redundant subscription/order every time they clicked
  // the card again — see the July 31 billing investigation, which turned up
  // 11 paid orders from repeated test clicks before that mismatch was found).
  const [currentPlan, setCurrentPlan] = useState<"free" | "pro" | null>(null);

  useEffect(() => {
    if (checkingSession || !configured || !user) {
      setCurrentPlan(user ? null : "free");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.from("profiles").select("plan").eq("id", user.id).single();
        if (!cancelled) setCurrentPlan(data?.plan === "pro" ? "pro" : "free");
      } catch {
        if (!cancelled) setCurrentPlan("free");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, checkingSession, configured]);

  const freeFeatures = t.raw("free.features") as string[];
  const proFeatures = t.raw("pro.features") as string[];
  const planId = yearly ? "yearly" : "monthly";
  const isAlreadyPro = currentPlan === "pro";

  // The Pro card's CTA used to just link to /signup, which meant nobody
  // could actually pay — signup never started a checkout, and an existing
  // logged-in free user clicking it had no path to Lemon Squeezy at all.
  // Now: logged in -> start checkout directly and hand off to Lemon
  // Squeezy's hosted page. Logged out -> go create an account first, with
  // the chosen plan carried through via ?plan= so SignupForm can start
  // checkout itself right after signup succeeds.
  async function handleProClick() {
    if (checkingSession || isAlreadyPro) return;
    if (!user) {
      router.push(`/signup?plan=${planId}`);
      return;
    }
    setCheckingOut(true);
    setCheckoutError(null);
    try {
      const redirectUrl = `${window.location.origin}/${locale}/dashboard?upgraded=1`;
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, userId: user.id, email: user.email, redirectUrl }),
      });
      const data = await res.json();
      if (data.error === "already_subscribed") {
        setCurrentPlan("pro");
        throw new Error(t("pro.currentPlanNote"));
      }
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Checkout failed");
      }
      window.location.href = data.url;
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : t("checkoutError"));
      setCheckingOut(false);
    }
  }

  return (
    <div>
      <div className="mx-auto flex w-fit items-center gap-1 rounded-full border border-border bg-surface p-1">
        <button
          onClick={() => setYearly(false)}
          className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
            !yearly ? "bg-emerald-600 text-white" : "text-foreground/60"
          }`}
        >
          {t("monthly")}
        </button>
        <button
          onClick={() => setYearly(true)}
          className={`flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
            yearly ? "bg-emerald-600 text-white" : "text-foreground/60"
          }`}
        >
          {t("yearly")}
          <span className="rounded-full bg-gold-400 px-2 py-0.5 text-[10px] font-bold text-emerald-900">
            {t("yearlySave")}
          </span>
        </button>
      </div>

      <div className="mx-auto mt-12 grid max-w-3xl gap-8 sm:grid-cols-2">
        {/* Free plan — flex flex-col + mt-auto on the CTA block keeps its
            button aligned with Pro's, regardless of the two plans having a
            very different number of feature lines (3 vs 11) — previously
            the Free card's button sat right under its short list, leaving a
            large dead gap below it down to the card's (grid-stretched)
            full height, which read as unfinished/unbalanced next to Pro. */}
        <div className="flex h-full flex-col rounded-2xl border border-border bg-surface p-8">
          <h3 className="text-xl font-bold text-foreground">{t("free.name")}</h3>
          <p className="mt-1 text-sm text-foreground/60">{t("free.desc")}</p>
          <p className="mt-6 text-4xl font-extrabold text-foreground">
            {t("free.price")}
            <span className="text-base font-medium text-foreground/50"> / {t("free.period")}</span>
          </p>
          <ul className="mt-8 space-y-3">
            {freeFeatures.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-sm text-foreground/80">
                <Check className="mt-0.5 h-4 w-4 flex-none text-emerald-600" />
                {f}
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-8">
            <Link
              href="/signup"
              className="block rounded-full border border-border py-3 text-center text-sm font-semibold text-foreground transition-colors hover:bg-sand-100"
            >
              {t("free.name")}
            </Link>
            <p className="mt-3 text-center text-xs text-foreground/40">{t("free.noCardRequired")}</p>
          </div>
        </div>

        {/* Pro plan */}
        <div className="relative flex h-full flex-col rounded-2xl border-2 border-gold-400 bg-surface p-8 shadow-lg shadow-gold-400/10">
          <span className="absolute -top-3 left-8 rounded-full bg-gold-400 px-3 py-1 text-xs font-bold text-emerald-900">
            {t("pro.badge")}
          </span>
          <h3 className="text-xl font-bold text-foreground">{t("pro.name")}</h3>
          <p className="mt-1 text-sm text-foreground/60">{t("pro.desc")}</p>
          <p className="mt-6 text-4xl font-extrabold text-foreground">
            {yearly ? t("pro.yearlyPrice") : t("pro.monthlyPrice")}
            <span className="text-base font-medium text-foreground/50">
              {" "}
              {yearly ? t("pro.yearlyPeriod") : t("pro.monthlyPeriod")}
            </span>
          </p>
          <ul className="mt-8 space-y-3">
            {proFeatures.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-sm text-foreground/80">
                <Check className="mt-0.5 h-4 w-4 flex-none text-emerald-600" />
                {f}
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-8">
            {isAlreadyPro ? (
              <div className="flex w-full items-center justify-center gap-2 rounded-full border-2 border-emerald-200 bg-emerald-50 py-3 text-center text-sm font-semibold text-emerald-700">
                <BadgeCheck className="h-4 w-4" />
                {t("pro.currentPlan")}
              </div>
            ) : (
              <button
                type="button"
                onClick={handleProClick}
                disabled={checkingOut || checkingSession}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 py-3 text-center text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-70"
              >
                {checkingOut && <Loader2 className="h-4 w-4 animate-spin" />}
                {checkingOut ? t("startingCheckout") : t("pro.cta")}
              </button>
            )}
            {isAlreadyPro && (
              <p className="mt-3 text-center text-xs text-foreground/50">{t("pro.currentPlanNote")}</p>
            )}
            {checkoutError && <p className="mt-3 text-center text-xs text-red-600">{checkoutError}</p>}
          </div>
        </div>
      </div>

      {/* Reassurance row — generic, verifiable trust signals only (no
          specific refund/billing-policy claims, which this component has no
          authoritative source for). "No card for Free" and "Secure
          checkout" are true by construction of the signup/checkout flow;
          "Cancel anytime" reflects Lemon Squeezy's standard self-serve
          subscription handling, not an app-specific promise. */}
      <div className="mx-auto mt-10 flex max-w-3xl flex-wrap items-center justify-center gap-x-8 gap-y-2 text-xs font-medium text-foreground/50">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
          {t("trust.secureCheckout")}
        </span>
        <span className="flex items-center gap-1.5">
          <RefreshCw className="h-3.5 w-3.5 text-emerald-600" />
          {t("trust.cancelAnytime")}
        </span>
        <span className="flex items-center gap-1.5">
          <CreditCard className="h-3.5 w-3.5 text-emerald-600" />
          {t("trust.noHiddenFees")}
        </span>
      </div>

      {/* Bridges to the employer side — a job seeker landing on /pricing is
          never who this is for, but a hiring manager who lands here by
          mistake (or via a generic "pricing" search) should find their way
          to the free employer flow in one click instead of bouncing. */}
      <div className="mx-auto mt-10 flex max-w-3xl flex-col items-center justify-between gap-4 rounded-2xl border border-border bg-surface px-6 py-5 text-center sm:flex-row sm:text-start">
        <div>
          <p className="text-sm font-semibold text-foreground">{t("employerBanner.title")}</p>
          <p className="mt-0.5 text-sm text-foreground/60">{t("employerBanner.subtitle")}</p>
        </div>
        <Link
          href="/employer/signup"
          className="flex flex-none items-center gap-1.5 rounded-full border border-emerald-600 px-5 py-2.5 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-50"
        >
          {t("employerBanner.cta")}
        </Link>
      </div>
    </div>
  );
}
