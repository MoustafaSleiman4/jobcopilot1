import { NextRequest, NextResponse } from "next/server";
import { getBillingProvider, type PlanId } from "@/lib/billing";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const { planId, userId, email, redirectUrl } = (await request.json()) as {
    planId: PlanId;
    userId: string;
    email: string;
    redirectUrl?: string;
  };

  if (!planId || !userId || !email) {
    return NextResponse.json({ error: "Missing planId, userId, or email" }, { status: 400 });
  }

  // Server-side guard against opening a second checkout for a user who's
  // already Pro — the pricing page hides/disables its own button for this,
  // but that's client-side only and doesn't stop a direct POST to this
  // route. This is also what caused the pile of 11 redundant paid test
  // orders found during the July 31 billing investigation: nothing here
  // was actually stopping a repeat checkout. Best-effort: if the admin
  // client isn't configured or the lookup fails, fall through and let
  // checkout proceed rather than blocking real customers over it.
  try {
    const admin = createAdminClient();
    const { data: profile } = await admin.from("profiles").select("plan").eq("id", userId).single();
    if (profile?.plan === "pro") {
      return NextResponse.json({ error: "already_subscribed" }, { status: 409 });
    }
  } catch {
    // Admin client not configured, or lookup failed — don't block checkout.
  }

  try {
    const provider = getBillingProvider();
    const session = await provider.createCheckoutSession({ planId, userId, email, redirectUrl });
    return NextResponse.json(session);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Checkout failed" },
      { status: 500 }
    );
  }
}
