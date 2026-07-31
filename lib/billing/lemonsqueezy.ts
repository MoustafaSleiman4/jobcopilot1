import crypto from "node:crypto";
import type { BillingProvider, NormalizedBillingEvent, PlanId } from "./provider";

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

  async createCheckoutSession({ planId, userId, email, redirectUrl }) {
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
            // Without this, Lemon Squeezy leaves the buyer on its own
            // generic "thank you" page after payment with no way back into
            // the app — they'd have to navigate back to gulfjobcopilot.com
            // manually, which is exactly what was reported as "nothing
            // happened when I come back to the system."
            ...(redirectUrl && {
              product_options: { redirect_url: redirectUrl },
            }),
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

  async parseWebhookEvent({ rawBody, signature }) {
    const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
    if (!secret || !signature) return null;

    // Lemon Squeezy signs the raw request body with HMAC-SHA256 using your
    // webhook signing secret, sent as a hex digest in the X-Signature header.
    // See https://docs.lemonsqueezy.com/help/webhooks/signing-requests.
    const digest = Buffer.from(
      crypto.createHmac("sha256", secret).update(rawBody).digest("hex"),
      "utf8"
    );
    const signatureBuffer = Buffer.from(signature, "utf8");
    if (
      digest.length !== signatureBuffer.length ||
      !crypto.timingSafeEqual(digest, signatureBuffer)
    ) {
      console.error("Lemon Squeezy webhook: signature verification failed");
      return null;
    }

    let payload: {
      meta?: { event_name?: string; custom_data?: { user_id?: string } };
      data?: { attributes?: { variant_id?: number | string } };
    };
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return null;
    }

    const eventName = payload.meta?.event_name;
    const userId = payload.meta?.custom_data?.user_id;
    if (!userId) {
      console.error("Lemon Squeezy webhook: missing custom_data.user_id — was checkout_data.custom set?");
      return null;
    }

    const variantId = String(payload.data?.attributes?.variant_id ?? "");
    const plan: PlanId = variantId === process.env.LEMONSQUEEZY_YEARLY_VARIANT_ID ? "yearly" : "monthly";

    const eventMap: Record<string, NormalizedBillingEvent> = {
      subscription_created: { type: "subscription.created", userId, plan },
      subscription_payment_success: { type: "subscription.renewed", userId, plan },
      subscription_resumed: { type: "subscription.renewed", userId, plan },
      subscription_cancelled: { type: "subscription.cancelled", userId },
      subscription_expired: { type: "subscription.cancelled", userId },
    };

    return eventName ? eventMap[eventName] ?? null : null;
  },
};
