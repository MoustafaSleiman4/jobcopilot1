import { NextRequest, NextResponse } from "next/server";
import { getBillingProvider } from "@/lib/billing";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Single webhook endpoint for whichever billing provider is active.
 * Point your Lemon Squeezy/Stripe dashboard webhook at
 * https://<your-domain>/api/billing/webhook.
 *
 * When a real NormalizedBillingEvent comes back (i.e. once the provider's
 * parseWebhookEvent is filled in with real signature verification), this
 * updates both `subscriptions` and `profiles.plan` so the rest of the app
 * (e.g. the resume-download paywall) reflects the user's real plan.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-signature") ?? request.headers.get("stripe-signature");

  const provider = getBillingProvider();
  const event = await provider.parseWebhookEvent({ rawBody, signature });

  if (!event) {
    return NextResponse.json({ received: true, note: "Webhook verification not configured yet" });
  }

  try {
    const admin = createAdminClient();

    if (event.type === "subscription.created" || event.type === "subscription.renewed") {
      await admin
        .from("subscriptions")
        .upsert(
          {
            user_id: event.userId,
            provider: provider.name,
            plan: event.plan,
            status: "active",
          },
          { onConflict: "user_id" }
        );
      await admin.from("profiles").update({ plan: "pro" }).eq("id", event.userId);
    } else if (event.type === "subscription.cancelled") {
      await admin
        .from("subscriptions")
        .update({ status: "cancelled" })
        .eq("user_id", event.userId);
      await admin.from("profiles").update({ plan: "free" }).eq("id", event.userId);
    }
  } catch (err) {
    // Admin client not configured yet (SUPABASE_SERVICE_ROLE_KEY missing) —
    // log and still 200 the webhook so the provider doesn't keep retrying;
    // fix the env var and the next event will apply correctly.
    console.error("Billing webhook: failed to update Supabase", err);
  }

  return NextResponse.json({ received: true });
}
