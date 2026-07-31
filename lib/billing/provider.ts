/**
 * Provider-agnostic billing interface. Swap the active provider in
 * getBillingProvider() without touching any calling code — the checkout
 * routes, webhook handler, and UI only ever talk to this interface.
 *
 * Why this exists: payout/checkout provider support varies a lot by country
 * (see the plan doc's payments section — Lebanon in particular is not
 * supported by Lemon Squeezy or Stripe as an account-holder country, so the
 * merchant entity and processor may need to change before launch without
 * that becoming an app-wide rewrite).
 */

export type PlanId = "monthly" | "yearly";

export interface CheckoutSession {
  url: string;
}

export interface BillingProvider {
  name: string;
  /**
   * Creates a hosted checkout session URL for the given plan and user.
   * `redirectUrl`, when given, is where the provider should send the buyer
   * back to after a successful payment — without it, the buyer is left on
   * the provider's own generic receipt page with no way back into the app.
   */
  createCheckoutSession(params: {
    planId: PlanId;
    userId: string;
    email: string;
    redirectUrl?: string;
  }): Promise<CheckoutSession>;
  /** Verifies and parses an inbound webhook payload into a normalized event. */
  parseWebhookEvent(params: {
    rawBody: string;
    signature: string | null;
  }): Promise<NormalizedBillingEvent | null>;
}

export type NormalizedBillingEvent =
  | { type: "subscription.created"; userId: string; plan: PlanId }
  | { type: "subscription.renewed"; userId: string; plan: PlanId }
  | { type: "subscription.cancelled"; userId: string };

export const PLAN_PRICES: Record<PlanId, { amount: number; currency: "USD"; label: string }> = {
  monthly: { amount: 9.99, currency: "USD", label: "$9.99 / month" },
  yearly: { amount: 99.9, currency: "USD", label: "$99.90 / year" },
};
