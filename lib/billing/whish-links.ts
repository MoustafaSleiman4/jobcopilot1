/**
 * Whish Money has no public self-serve checkout/webhook API, and its
 * "create a payment link" feature turned out to require the same business
 * (merchant) account that's still pending KYB paperwork — see the original
 * comment history on this file. A personal Whish wallet can still receive
 * a direct Whish-to-Whish transfer today, so this ships that instead: a
 * customer sends a transfer for the plan's price straight to your Whish
 * phone number, then tells us they paid via the claim flow in
 * app/api/billing/whish/claim/route.ts. You confirm receipt in your own
 * Whish wallet and approve the claim at /admin/whish (or POST
 * /api/admin/whish/confirm), which upgrades them to Pro the same way a
 * real webhook would.
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
export const WHISH_TRANSFER = {
  // The phone number customers send a Whish-to-Whish transfer to. Shown
  // directly on /dashboard/pay-with-whish — not a secret, just kept as an
  // env var so it can change without a code deploy.
  phone: process.env.WHISH_TRANSFER_PHONE,
  // Optional — shown alongside the number so a customer can double-check
  // they're sending to the right account before transferring.
  accountName: process.env.WHISH_ACCOUNT_NAME,
};

export function isWhishConfigured(): boolean {
  return Boolean(WHISH_TRANSFER.phone);
}
