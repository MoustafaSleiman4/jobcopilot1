import { NextResponse } from "next/server";
import { WHISH_TRANSFER } from "@/lib/billing/whish-links";

/**
 * Exposes the Whish transfer destination (phone number + account name) so
 * the pay-with-whish page can render it without baking env vars into the
 * client bundle at build time. Not a secret — this is meant to be shown to
 * every customer paying via Whish, same as a merchant's payment-link URL
 * would have been.
 */
export async function GET() {
  return NextResponse.json({
    phone: WHISH_TRANSFER.phone || undefined,
    accountName: WHISH_TRANSFER.accountName || undefined,
  });
}
