import type { BillingProvider, PlanId } from "./provider";

const PRICE_IDS: Record<PlanId, string | undefined> = {
  monthly: process.env.STRIPE_MONTHLY_PRICE_ID,
  yearly: process.env.STRIPE_YEARLY_PRICE_ID,
};

/**
 * Stripe as a drop-in alternative to Lemon Squeezy (see plan doc §3).
 * Fill in STRIPE_SECRET_KEY and the price IDs in .env.local, then flip
 * getBillingProvider() in ./index.ts to use this instead.
 */
export const stripeProvider: BillingProvider = {
  name: "stripe",

  async createCheckoutSession({ planId, userId, email }) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    const priceId = PRICE_IDS[planId];

    if (!secretKey || !priceId) {
      throw new Error(
        "Stripe is not configured yet. Set STRIPE_SECRET_KEY and the price IDs in .env.local."
      );
    }

    const params = new URLSearchParams({
      mode: "subscription",
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      customer_email: email,
      "metadata[user_id]": userId,
      success_url: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/dashboard?checkout=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/pricing`,
    });

    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });

    if (!res.ok) {
      throw new Error(`Stripe checkout session creation failed: ${res.status}`);
    }

    const json = await res.json();
    return { url: json.url as string };
  },

  async parseWebhookEvent({ rawBody }) {
    // Signature verification via STRIPE_WEBHOOK_SECRET goes here once configured.
    void rawBody;
    return null;
  },
};
