import type { BillingProvider } from "./provider";
import { lemonSqueezyProvider } from "./lemonsqueezy";
import { stripeProvider } from "./stripe";

/**
 * Single switch point for which payment processor is live. Change the
 * BILLING_PROVIDER env var (or this default) to swap providers without
 * touching checkout routes, webhooks, or UI. See plan doc §3 for why this
 * needs to stay swappable given the Lebanon payout constraint.
 */
export function getBillingProvider(): BillingProvider {
  const provider = process.env.BILLING_PROVIDER ?? "lemonsqueezy";
  return provider === "stripe" ? stripeProvider : lemonSqueezyProvider;
}

export * from "./provider";
