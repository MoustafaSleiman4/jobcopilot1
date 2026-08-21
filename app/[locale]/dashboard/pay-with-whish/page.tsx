"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Wallet, CheckCircle2, Loader2, ArrowLeft, ShieldAlert, Copy, Check } from "lucide-react";
import { useAuthUser } from "@/lib/useAuthUser";
import { PLAN_PRICES, type PlanId } from "@/lib/billing";

/**
 * Manual "pay Pro via Whish-to-Whish transfer" flow for Lebanese users —
 * see lib/billing/whish-links.ts for why this exists instead of an
 * automated checkout (or even a Whish payment link — that feature also
 * needs a business account). Reached from the Pro card's "Pay with Whish
 * (Lebanon)" link on /pricing. WHISH_TRANSFER_PHONE / WHISH_ACCOUNT_NAME
 * are read server-side by /api/billing/whish/links so they never need to
 * ship to the client bundle unconfigured; if the phone number isn't set
 * yet, this page says so plainly instead of showing blank transfer details.
 */
function PayWithWhishContent() {
  const t = useTranslations("whish");
  const searchParams = useSearchParams();
  const { user, loading: checkingSession } = useAuthUser();
  const planId: PlanId = searchParams.get("plan") === "yearly" ? "yearly" : "monthly";

  const [transfer, setTransfer] = useState<{ phone?: string; accountName?: string } | null>(null);
  const [note, setNote] = useState("");
  const [claimed, setClaimed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/billing/whish/links")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setTransfer(data);
      })
      .catch(() => {
        if (!cancelled) setTransfer({});
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const configured = Boolean(transfer?.phone);

  async function handleCopyNumber() {
    if (!transfer?.phone) return;
    try {
      await navigator.clipboard.writeText(transfer.phone);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail (permissions, insecure context) — the number
      // is still shown as plain text right above the button either way.
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

  if (checkingSession || transfer === null) {
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

        {!configured ? (
          <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-gold-400/50 bg-gold-50 p-4 text-sm text-foreground/80">
            <ShieldAlert className="mt-0.5 h-4 w-4 flex-none text-gold-600" />
            <p>{t("notConfigured")}</p>
          </div>
        ) : claimed ? (
          <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-emerald-600" />
            <p>{t("claimSubmitted")}</p>
          </div>
        ) : (
          <>
            <ol className="mt-6 space-y-4 text-sm text-foreground/80">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">1</span>
                <span>{t("step1")}</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">2</span>
                <span>{t("step2")}</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">3</span>
                <span>{t("step3")}</span>
              </li>
            </ol>

            <div className="mt-6 rounded-xl border border-border bg-background p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground/50">
                {t("amountLabel")}
              </p>
              <p className="mt-1 text-2xl font-extrabold text-foreground">{PLAN_PRICES[planId].label}</p>

              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-foreground/50">
                {t("transferToLabel")}
              </p>
              <div className="mt-1 flex items-center gap-2">
                <p className="flex-1 truncate text-lg font-bold tracking-wide text-foreground" dir="ltr">
                  {transfer?.phone}
                </p>
                <button
                  type="button"
                  onClick={handleCopyNumber}
                  className="flex flex-none items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground/70 transition-colors hover:bg-sand-100"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? t("numberCopied") : t("copyNumber")}
                </button>
              </div>
              {transfer?.accountName && (
                <p className="mt-2 text-xs text-foreground/50">
                  {t("accountNameLabel")}: {transfer.accountName}
                </p>
              )}
            </div>

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
              <p className="mt-3 text-center text-xs text-foreground/40">{t("verificationNote")}</p>
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
