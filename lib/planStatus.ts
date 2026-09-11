// Shared logic for turning a raw public.subscriptions row into something the
// UI can show a user: an expiry/renewal date, and whether they'll need to
// pay something to keep Pro past that date. Used by both a client component
// (DashboardShell's account menu, via useAuthUser) and a server component
// (the dashboard overview page's plan pill), so this stays a pure function
// with no Supabase/i18n calls of its own — callers fetch the row and
// translate the returned `kind` themselves.

export type PlanBillingRow = {
  provider: string | null;
  status: string | null;
  renewsAt: string | null;
};

// "Auto-renewing" providers charge a saved payment method automatically —
// the user doesn't need to do anything for the date in renewsAt to keep
// being true. Everything else (gift/manual/whish) is a fixed grant that
// lapses on that date unless the user goes and pays again themselves.
const AUTO_RENEWING_PROVIDERS = new Set(["stripe", "lemonsqueezy"]);

export type PlanStatusKind =
  | "free"
  // Auto-renewing subscription, in good standing, and we actually know the
  // next charge date (requires the billing webhook to have supplied one —
  // see lib/billing/provider.ts's periodEnd).
  | "autoRenewing"
  // Auto-renewing subscription, in good standing, but no renewal date is on
  // file yet (e.g. it predates the webhook change that started recording
  // one — it'll be filled in on the next renewal).
  | "autoRenewingUnknownDate"
  // Auto-renewing subscription whose last charge failed — Stripe/Lemon
  // Squeezy will keep retrying, but this needs to be surfaced as an actual
  // "you may lose Pro" warning, not routine renewal info.
  | "pastDue"
  // A fixed-term grant (gift, manual, or Whish's pay-then-manually-confirm
  // flow) with a known end date — no automatic payment behind it, so the
  // user needs to know they'll have to act before then to keep Pro.
  | "expiring"
  // A fixed-term grant with no end date on file — treated as indefinite
  // complimentary access.
  | "indefinite";

export function getPlanStatus(
  plan: "free" | "pro",
  billing: PlanBillingRow | null
): { kind: PlanStatusKind; renewsAt: string | null } {
  if (plan !== "pro") return { kind: "free", renewsAt: null };

  const provider = billing?.provider ?? null;
  const status = billing?.status ?? null;
  const renewsAt = billing?.renewsAt ?? null;
  const autoRenewing = provider !== null && AUTO_RENEWING_PROVIDERS.has(provider);

  if (autoRenewing && status === "past_due") {
    return { kind: "pastDue", renewsAt };
  }
  if (autoRenewing) {
    return renewsAt ? { kind: "autoRenewing", renewsAt } : { kind: "autoRenewingUnknownDate", renewsAt: null };
  }
  // gift / manual / whish / unknown provider (or no subscriptions row at
  // all, e.g. a plan flipped by hand) — never auto-charges.
  return renewsAt ? { kind: "expiring", renewsAt } : { kind: "indefinite", renewsAt: null };
}
