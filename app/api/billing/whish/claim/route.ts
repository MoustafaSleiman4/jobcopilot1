import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendAdminNotification } from "@/lib/email";
import { PLAN_PRICES, type PlanId } from "@/lib/billing";

/**
 * "I paid via Whish" claim submission — see lib/billing/whish-links.ts for
 * why this is a manual flow instead of an automated webhook. This never
 * upgrades anyone's plan by itself; it only records the claim and emails
 * the admin (ADMIN_NOTIFICATION_EMAIL, defaults to the account owner) so
 * they can verify the payment actually landed in the Whish wallet before
 * approving it at /admin/whish. A user hitting this endpoint twice, or
 * lying about having paid, cannot self-grant Pro access this way — only
 * /api/admin/whish/confirm (secret-protected) can flip profiles.plan.
 */
export async function POST(request: NextRequest) {
  const { userId, email, planId, note } = (await request.json()) as {
    userId: string;
    email: string;
    planId: PlanId;
    note?: string;
  };

  if (!userId || !email || !planId || !(planId in PLAN_PRICES)) {
    return NextResponse.json({ error: "Missing or invalid userId, email, or planId" }, { status: 400 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (err) {
    console.error("Whish claim: admin client not configured", err);
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  // One outstanding claim per user — a second submission (e.g. retrying
  // after a page refresh, or switching from monthly to yearly before the
  // first was reviewed) just refreshes the same row rather than piling up
  // duplicates for the admin to sort through.
  const { error } = await admin
    .from("whish_payment_claims")
    .upsert(
      { user_id: userId, email, plan: planId, status: "pending", note: note?.slice(0, 500) ?? null },
      { onConflict: "user_id" }
    );

  if (error) {
    console.error("Whish claim: failed to record claim", error);
    return NextResponse.json({ error: "Failed to record claim" }, { status: 500 });
  }

  try {
    const price = PLAN_PRICES[planId];
    await sendAdminNotification(
      "Whish payment claim — needs verification",
      `<p>A user says they paid for GulfJobCopilot Pro via Whish and needs manual confirmation.</p>
       <p><strong>Email:</strong> ${email}</p>
       <p><strong>User ID:</strong> ${userId}</p>
       <p><strong>Plan:</strong> ${planId} (${price.label})</p>
       ${note ? `<p><strong>Note from user:</strong> ${note.slice(0, 500)}</p>` : ""}
       <p>Check your Whish wallet for a matching payment, then approve at
       <a href="${(process.env.NEXT_PUBLIC_APP_URL ?? "https://gulfjobcopilot.com").replace(/\/$/, "")}/en/admin/whish">/admin/whish</a>
       (or reject if you can't find a matching payment — don't approve on trust alone).</p>`
    );
  } catch (err) {
    // Best-effort — the claim is already recorded even if the email fails.
    console.error("Whish claim: failed to send admin notification", err);
  }

  return NextResponse.json({ received: true });
}
