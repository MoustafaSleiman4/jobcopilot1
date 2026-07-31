import { NextRequest, NextResponse } from "next/server";
import { getBillingProvider, type PlanId } from "@/lib/billing";

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
