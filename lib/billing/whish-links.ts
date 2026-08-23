import type { PlanId } from "./provider";

/**
 * Whish Money has no public self-serve checkout/webhook API — merchant
 * integration is only available after a direct sales conversation with
 * Whish (see the corporate-solutions contact form on whish.money), and the
 * real technical spec + credentials are handed out privately once
 * onboarded. Rather than block Lebanese users on that process, this ships a
 * manual flow today: you create two static payment links from your own
 * Whish App/Wallet (Whish → "Create a payment link" — see the app's Payment
 * Links feature) for the monthly and yearly prices, paste them here (or set
 * the env vars below), and a Lebanese user pays through Whish directly,
 * then tells us they paid via the claim flow in
 * app/api/billing/whish/claim/route.ts. You confirm receipt in your own
 * Whish wallet and approve the claim at /admin/whish (or POST
 * /api/admin/whish/confirm), which upgrades them to Pro the same way a real
 * webhook would.
 *
 * This intentionally does NOT implement the `BillingProvider` interface
 * (lib/billing/provider.ts) — that interface assumes an API you can call to
 * create a checkout session and a webhook you can verify, neither of which
 * Whish currently offers self-serve. If Whish or MontyPay (a Lebanon-based
 * gateway that may offer Whish as a routed local payment method — see plan
 * doc §3) ever provides real API credentials, this file's job is done by a
 * proper lib/billing/whish.ts implementing BillingProvider instead, and the
 * manual claim flow can be retired.
 */
export const WHISH_LINKS: Record<PlanId, string | undefined> = {
  monthly: process.env.WHISH_MONTHLY_LINK,
  yearly: process.env.WHISH_YEARLY_LINK,
};

export function isWhishConfigured(): boolean {
  return Boolean(WHISH_LINKS.monthly && WHISH_LINKS.yearly);
}
