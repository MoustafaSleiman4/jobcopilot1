import crypto from "node:crypto";
import type { BillingProvider, NormalizedBillingEvent, PlanId } from "./provider";

const PRICE_IDS: Record<PlanId, string | undefined> = {
  monthly: process.env.STRIPE_MONTHLY_PRICE_ID,
  yearly: process.env.STRIPE_YEARLY_PRICE_ID,
};

// How much clock drift to tolerate between when Stripe signed a webhook
// request and when we verify it — Stripe's own recommended default, guards
// against a captured request being replayed long after the fact.
const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

/**
 * Verifies a Stripe webhook's `Stripe-Signature` header against the raw
 * request body, per Stripe's documented scheme
 * (https://docs.stripe.com/webhooks#verify-manually): the header is
 * `t=<unix timestamp>,v1=<hex hmac>[,v1=<hex hmac>...]` — multiple v1
 * values can appear during a webhook signing-secret rotation, and a request
 * is valid if the body matches ANY of them. Returns false (not throws) on
 * any malformed/missing input so the caller can fail closed uniformly.
 */
function verifyStripeSignature(rawBody: string, header: string, secret: string): boolean {
  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const [k, ...rest] = kv.split("=");
      return [k, rest.join("=")];
    })
  );
  const timestamp = parts.t;
  if (!timestamp || !/^\d+$/.test(timestamp)) return false;

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (ageSeconds > WEBHOOK_TOLERANCE_SECONDS) return false;

  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");

  // The header can carry more than one v1= value during secret rotation —
  // accept if the body matches any of them.
  return header
    .split(",")
    .filter((kv) => kv.startsWith("v1="))
    .some((kv) => {
      const candidate = Buffer.from(kv.slice(3), "utf8");
      return candidate.length === expectedBuf.length && crypto.timingSafeEqual(candidate, expectedBuf);
    });
}

/**
 * Stripe as a drop-in alternative to Lemon Squeezy (see plan doc §3).
 * Fill in STRIPE_SECRET_KEY and the price IDs in .env.local, then flip
 * getBillingProvider() in ./index.ts to use this instead.
 *
 * Webhook setup: in the Stripe Dashboard, point a webhook at
 * https://<your-domain>/api/billing/webhook and subscribe it to exactly
 * three events — checkout.session.completed, invoice.paid, and
 * customer.subscription.deleted — then copy the signing secret it gives you
 * into STRIPE_WEBHOOK_SECRET.
 */
export const stripeProvider: BillingProvider = {
  name: "stripe",

  async createCheckoutSession({ planId, userId, email, redirectUrl }) {
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
      "metadata[plan_id]": planId,
      // Stripe does NOT automatically copy Checkout Session metadata onto
      // the Subscription it creates — without this, later webhook events
      // that reference the subscription/invoice (renewal, cancellation)
      // would have no way to identify which app user they belong to short
      // of an extra round-trip back to the Stripe API.
      "subscription_data[metadata][user_id]": userId,
      "subscription_data[metadata][plan_id]": planId,
      success_url: redirectUrl ?? `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/dashboard?upgraded=1`,
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

  async parseWebhookEvent({ rawBody, signature }) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret || !signature) return null;

    if (!verifyStripeSignature(rawBody, signature, secret)) {
      console.error("Stripe webhook: signature verification failed");
      return null;
    }

    let event: {
      type?: string;
      data?: { object?: Record<string, unknown> };
    };
    try {
      event = JSON.parse(rawBody);
    } catch {
      return null;
    }

    const obj = event.data?.object ?? {};

    if (event.type === "checkout.session.completed") {
      // Only a real subscription purchase should ever reach here — Stripe
      // Checkout also supports one-off "payment" mode sessions, which this
      // app doesn't use, but a stray/misconfigured session shouldn't
      // silently upgrade someone to Pro.
      if (obj.mode !== "subscription") return null;
      const metadata = (obj.metadata ?? {}) as Record<string, string | undefined>;
      const userId = metadata.user_id;
      const plan = metadata.plan_id as PlanId | undefined;
      if (!userId || !plan) {
        console.error("Stripe webhook: checkout.session.completed missing metadata.user_id/plan_id");
        return null;
      }
      const result: NormalizedBillingEvent = { type: "subscription.created", userId, plan };
      return result;
    }

    if (event.type === "invoice.paid") {
      // billing_reason "subscription_create" is the invoice for the very
      // first payment — checkout.session.completed already handles that
      // one. Only "subscription_cycle" (an automatic renewal) should count
      // as a renewal here, otherwise every new subscriber would fire both
      // subscription.created AND subscription.renewed for the same payment.
      if (obj.billing_reason !== "subscription_cycle") return null;
      // Newer Stripe API versions nest subscription metadata under
      // subscription_details; older ones may only have it directly on the
      // invoice. Check both rather than assuming one API version.
      const subscriptionDetails = (obj.subscription_details ?? {}) as { metadata?: Record<string, string> };
      const metadata = subscriptionDetails.metadata ?? (obj.metadata as Record<string, string> | undefined) ?? {};
      const userId = metadata.user_id;
      const plan = metadata.plan_id as PlanId | undefined;
      if (!userId || !plan) {
        console.error("Stripe webhook: invoice.paid missing subscription metadata.user_id/plan_id");
        return null;
      }
      const result: NormalizedBillingEvent = { type: "subscription.renewed", userId, plan };
      return result;
    }

    if (event.type === "customer.subscription.deleted") {
      const metadata = (obj.metadata ?? {}) as Record<string, string | undefined>;
      const userId = metadata.user_id;
      if (!userId) {
        console.error("Stripe webhook: customer.subscription.deleted missing metadata.user_id");
        return null;
      }
      const result: NormalizedBillingEvent = { type: "subscription.cancelled", userId };
      return result;
    }

    return null;
  },
};
