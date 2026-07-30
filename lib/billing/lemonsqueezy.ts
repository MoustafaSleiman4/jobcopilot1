import type { BillingProvider, PlanId } from "./provider";

const VARIANT_IDS: Record<PlanId, string | undefined> = {
  monthly: process.env.LEMONSQUEEZY_MONTHLY_VARIANT_ID,
  yearly: process.env.LEMONSQUEEZY_YEARLY_VARIANT_ID,
};

/**
 * Lemon Squeezy is the primary recommendation (see plan doc §3): it acts as
 * merchant of record, handles Gulf card acceptance + tax, and supports UAE
 * bank payouts. Fill in LEMONSQUEEZY_API_KEY / STORE_ID / VARIANT_IDs and
 * LEMONSQUEEZY_WEBHOOK_SECRET in .env.local once your store is set up.
 */
export const lemonSqueezyProvider: BillingProvider = {
  name: "lemonsqueezy",

  async createCheckoutSession({ planId, userId, email }) {
    const apiKey = process.env.LEMONSQUEEZY_API_KEY;
    const storeId = process.env.LEMONSQUEEZY_STORE_ID;
    const variantId = VARIANT_IDS[planId];

    if (!apiKey || !storeId || !variantId) {
      throw new Error(
        "Lemon Squeezy is not configured yet. Set LEMONSQUEEZY_API_KEY, LEMONSQUEEZY_STORE_ID, and the variant IDs in .env.local."
      );
    }

    const res = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
      method: "POST",
      headers: {
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        data: {
          type: "checkouts",
          attributes: {
            checkout_data: {
              email,
              custom: { user_id: userId },
            },
          },
          relationships: {
            store: { data: { type: "stores", id: storeId } },
            variant: { data: { type: "variants", id: variantId } },
          },
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`Lemon Squeezy checkout creation failed: ${res.status}`);
    }

    const json = await res.json();
    return { url: json.data.attributes.url as string };
  },

  async parseWebhookEvent({ rawBody }) {
    // Signature verification + payload parsing goes here once
    // LEMONSQUEEZY_WEBHOOK_SECRET is configured. Left as a stub for now.
    void rawBody;
    return null;
  },
};
