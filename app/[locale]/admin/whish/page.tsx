"use client";

import { useState } from "react";
import { ShieldCheck, Loader2, CheckCircle2, XCircle } from "lucide-react";

/**
 * Minimal admin tool to approve or reject a manually-submitted Whish
 * payment claim (see app/api/billing/whish/claim/route.ts and
 * lib/billing/whish-links.ts for the full context on why this manual flow
 * exists). Gated by ADMIN_SECRET rather than a real admin-role system —
 * intentionally not linked from anywhere in the app's nav; only reachable
 * by URL. The secret is kept in component state only (never persisted to
 * localStorage), so it has to be re-entered each visit — a deliberate
 * trade-off favoring not leaving it sitting in browser storage.
 *
 * No next-intl usage here on purpose: this is an internal tool for the
 * account owner, not user-facing product surface, so it doesn't need
 * Arabic/English translation.
 */
export default function AdminWhishPage() {
  const [secret, setSecret] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState<"confirm" | "reject" | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function act(action: "confirm" | "reject") {
    setSubmitting(action);
    setResult(null);
    try {
      const res = await fetch("/api/admin/whish/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, email, action, note: note || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ ok: false, message: data.error || "Request failed" });
      } else {
        setResult({
          ok: true,
          message:
            action === "confirm"
              ? `Confirmed — ${email} is now Pro (${data.plan}).`
              : `Rejected the pending claim for ${email}.`,
        });
        setEmail("");
        setNote("");
      }
    } catch {
      setResult({ ok: false, message: "Network error — request did not reach the server." });
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <div className="flex items-center gap-2.5">
        <ShieldCheck className="h-5 w-5 text-emerald-700" />
        <h1 className="text-lg font-bold text-foreground">Whish payment claims — approve/reject</h1>
      </div>
      <p className="mt-2 text-sm text-foreground/60">
        Check your Whish wallet for a matching payment before confirming. This immediately upgrades the
        user to Pro and records a subscription row with provider &quot;whish&quot; — the same effect a
        real Stripe/Lemon Squeezy webhook has.
      </p>

      <div className="mt-8 space-y-4 rounded-2xl border border-border bg-surface p-6">
        <div>
          <label className="block text-sm font-medium text-foreground">Admin secret</label>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="ADMIN_SECRET"
            className="mt-1.5 w-full rounded-lg border border-border bg-background p-2.5 text-sm text-foreground focus:border-emerald-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground">User&apos;s email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            className="mt-1.5 w-full rounded-lg border border-border bg-background p-2.5 text-sm text-foreground focus:border-emerald-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground">Note (optional, shown only on reject)</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. no matching payment found"
            className="mt-1.5 w-full rounded-lg border border-border bg-background p-2.5 text-sm text-foreground focus:border-emerald-500 focus:outline-none"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => act("confirm")}
            disabled={!secret || !email || submitting !== null}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-emerald-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
          >
            {submitting === "confirm" && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirm — make Pro
          </button>
          <button
            type="button"
            onClick={() => act("reject")}
            disabled={!secret || !email || submitting !== null}
            className="flex flex-1 items-center justify-center gap-2 rounded-full border border-border py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-sand-100 disabled:opacity-60"
          >
            {submitting === "reject" && <Loader2 className="h-4 w-4 animate-spin" />}
            Reject
          </button>
        </div>

        {result && (
          <div
            className={`flex items-start gap-2 rounded-lg p-3 text-sm ${
              result.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
            }`}
          >
            {result.ok ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none" />
            ) : (
              <XCircle className="mt-0.5 h-4 w-4 flex-none" />
            )}
            {result.message}
          </div>
        )}
      </div>
    </div>
  );
}
