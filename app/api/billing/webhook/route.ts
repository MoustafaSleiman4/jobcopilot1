import { NextRequest, NextResponse } from "next/server";
import { getBillingProvider } from "@/lib/billing";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendAdminNotification } from "@/lib/email";

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

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (err) {
    // SUPABASE_SERVICE_ROLE_KEY missing/misconfigured — nothing below can
    // run without it. Log loudly and 200 the webhook so the provider
    // doesn't retry forever; fix the env var and the next event will apply.
    console.error("Billing webhook: admin client not configured", err);
    return NextResponse.json({ received: true });
  }

  // Each side effect gets its own try/catch and runs independently. This
  // used to be one big try block where a failed `subscriptions` upsert (it
  // was missing a unique constraint on user_id, which `onConflict: "user_id"`
  // requires — see supabase/subscriptions-upgrade.sql) would throw and skip
  // the `profiles.plan` update entirely, silently stranding a paying user on
  // the free plan even though the webhook itself returned 200. The plan
  // update is the one thing that actually matters to the user, so it must
  // never be blocked by a failure in a less critical write.
  if (event.type === "subscription.created" || event.type === "subscription.renewed") {
    try {
      await admin.from("profiles").update({ plan: "pro" }).eq("id", event.userId);
    } catch (err) {
      console.error("Billing webhook: failed to upgrade profiles.plan to pro", event.userId, err);
    }

    try {
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
    } catch (err) {
      console.error("Billing webhook: failed to upsert subscriptions row", event.userId, err);
    }

    try {
      let userEmail = "unknown";
      try {
        const { data } = await admin.auth.admin.getUserById(event.userId);
        userEmail = data.user?.email ?? "unknown";
      } catch {
        // Best-effort lookup — don't let it block the notification email.
      }
      const isNew = event.type === "subscription.created";
      await sendAdminNotification(
        isNew ? "New GulfJobCopilot Pro subscriber" : "GulfJobCopilot subscription renewed",
        `<p>${isNew ? "A user just subscribed to Pro." : "A Pro subscription just renewed."}</p>
         <p><strong>Email:</strong> ${userEmail}</p>
         <p><strong>Plan:</strong> ${event.plan}</p>
         <p><strong>Provider:</strong> ${provider.name}</p>`
      );
    } catch (err) {
      console.error("Billing webhook: failed to send admin notification", err);
    }
  } else if (event.type === "subscription.cancelled") {
    try {
      await admin.from("profiles").update({ plan: "free" }).eq("id", event.userId);
    } catch (err) {
      console.error("Billing webhook: failed to downgrade profiles.plan to free", event.userId, err);
    }

    try {
      await admin.from("subscriptions").update({ status: "cancelled" }).eq("user_id", event.userId);
    } catch (err) {
      console.error("Billing webhook: failed to mark subscriptions row cancelled", event.userId, err);
    }

    try {
      let userEmail = "unknown";
      try {
        const { data } = await admin.auth.admin.getUserById(event.userId);
        userEmail = data.user?.email ?? "unknown";
      } catch {
        // Best-effort lookup — don't let it block the notification email.
      }
      await sendAdminNotification(
        "GulfJobCopilot subscription cancelled",
        `<p>A Pro subscription was just cancelled.</p><p><strong>Email:</strong> ${userEmail}</p>`
      );
    } catch (err) {
      console.error("Billing webhook: failed to send admin notification", err);
    }
  }

  return NextResponse.json({ received: true });
}
