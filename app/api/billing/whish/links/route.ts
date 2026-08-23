import { NextResponse } from "next/server";
import { WHISH_LINKS } from "@/lib/billing/whish-links";

/**
 * Exposes the two static Whish payment links (or omits a plan's key
 * entirely if unset) so the pay-with-whish page can render them without
 * baking env vars into the client bundle at build time. These are public
 * payment-collection links a user is meant to open, not secrets — same
 * sensitivity level as a Stripe Payment Link URL.
 */
export async function GET() {
  return NextResponse.json({
    monthly: WHISH_LINKS.monthly || undefined,
    yearly: WHISH_LINKS.yearly || undefined,
  });
}
