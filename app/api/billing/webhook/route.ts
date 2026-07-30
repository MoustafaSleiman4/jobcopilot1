import { NextRequest, NextResponse } from "next/server";
import { getBillingProvider } from "@/lib/billing";

/**
 * Single webhook endpoint for whichever billing provider is active.
 * Point your Lemon Squeezy/Stripe dashboard webhook at
 * https://<your-domain>/api/billing/webhook.
 *
 * Once a NormalizedBillingEvent comes back non-null, write it to the
 * `subscriptions` table (see supabase/schema.sql) using the Supabase
 * server client.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-signature") ?? request.headers.get("stripe-signature");

  const provider = getBillingProvider();
  const event = await provider.parseWebhookEvent({ rawBody, signature });

  if (!event) {
    return NextResponse.json({ received: true, note: "Webhook verification not configured yet" });
  }

  // TODO: upsert into public.subscriptions via the Supabase server client.

  return NextResponse.json({ received: true });
}
