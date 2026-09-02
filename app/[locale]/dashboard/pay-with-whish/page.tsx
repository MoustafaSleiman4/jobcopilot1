"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Wallet, CheckCircle2, Loader2, ArrowLeft, Copy, Check } from "lucide-react";
import { useAuthUser } from "@/lib/useAuthUser";
import type { PlanId } from "@/lib/billing";

/**
 * Manual "pay Pro via Whish" flow for Lebanese users — see
 * lib/billing/whish-links.ts for why this exists instead of an automated
 * checkout. Reached from the Pro card's "Pay with Whish (Lebanon)" link on
 * /pricing.
 *
 * There's no Whish merchant/payment-link integration yet (see
 * lib/billing/whish-links.ts), so this collects payment the low-tech way:
 * the user sends a fixed amount directly to the owner's personal Whish
 * number, puts their account email in the transfer description so it can be
 * matched by hand, then hits "I've paid" to notify the admin, who confirms
 * receipt in their own Whish wallet and approves the claim at /admin/whish
 * (app/api/billing/whish/claim + admin/whish confirm — unchanged).
 */
const WHISH_NUMBER = "03835512";
const WHISH_AMOUNT: Record<PlanId, string> = {
  monthly: "$10",
  yearly: "$100",
};

function PayWithWhishContent() {
  const t = useTranslations("whish");
  const searchParams = useSearchParams();
  const { user, loading: checkingSession } = useAuthUser();
  const planId: PlanId = searchParams.get("plan") === "yearly" ? "yearly" : "monthly";
  const amount = WHISH_AMOUNT[planId];

  const [note, setNote] = useState("");
  const [claimed, setClaimed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleCopyNumber() {
    try {
      await navigator.clipboard.writeText(WHISH_NUMBER);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable (permissions, non-secure context);
      // the number is also shown as plain selectable text, so this is a
      // silent no-op rather than an error state.
    }
  }

  async function handleClaim() {
    if (!user) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/whish/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, email: user.email, planId, note: note || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || t("claimError"));
      }
      setClaimed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("claimError"));
    } finally {
      setSubmitting(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-foreground/40" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <Link href="/pricing" className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-foreground/60 hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        {t("backToPricing")}
      </Link>

      <div className="rounded-2xl border border-border bg-surface p-8">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-emerald-50">
            <Wallet className="h-5 w-5 text-emerald-700" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">{t("title")}</h1>
            <p className="text-sm text-foreground/60">
              {planId === "yearly" ? t("planYearly") : t("planMonthly")}
            </p>
          </div>
        </div>

        {claimed ? (
          <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-emerald-600" />
            <p>{t("claimSubmitted")}</p>
          </div>
        ) : (
          <>
            {/* Amount + number, front and center — this is the whole payment
                method (no hosted checkout to hand off to), so it has to be
                the thing a user can't miss, not buried inside step 1. */}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border bg-background p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-foreground/50">{t("amountLabel")}</p>
                <p className="mt-1 text-2xl font-extrabold text-foreground">{amount}</p>
              </div>
              <div className="rounded-xl border border-border bg-background p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-foreground/50">{t("numberLabel")}</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="text-2xl font-extrabold text-foreground" dir="ltr">{WHISH_NUMBER}</p>
                  <button
                    type="button"
                    onClick={handleCopyNumber}
                    className="flex flex-none items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-foreground/60 transition-colors hover:bg-sand-100"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? t("copiedNumber") : t("copyNumber")}
                  </button>
                </div>
              </div>
            </div>

            <ol className="mt-6 space-y-4 text-sm text-foreground/80">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">1</span>
                <span>{t("step1", { amount, number: WHISH_NUMBER })}</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">2</span>
                <span>{t("step2", { email: user?.email ?? "" })}</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">3</span>
                <span>{t("step3")}</span>
              </li>
            </ol>

            <p className="mt-4 rounded-xl border border-gold-400/50 bg-gold-50 p-3 text-xs text-foreground/80">
              {t("descriptionWarning")}
            </p>

            <div className="mt-6 border-t border-border pt-6">
              <label className="block text-sm font-medium text-foreground">{t("noteLabel")}</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("notePlaceholder")}
                rows={2}
                className="mt-2 w-full rounded-lg border border-border bg-background p-3 text-sm text-foreground placeholder:text-foreground/40 focus:border-emerald-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleClaim}
                disabled={submitting || !user}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border-2 border-emerald-600 py-3 text-center text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-60"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("iPaidCta")}
              </button>
              {error && <p className="mt-3 text-center text-xs text-red-600">{error}</p>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function PayWithWhishPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-foreground/40" /></div>}>
      <PayWithWhishContent />
    </Suspense>
  );
}
