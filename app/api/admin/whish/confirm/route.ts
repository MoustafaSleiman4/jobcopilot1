import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Approves (or rejects) a manually-submitted Whish payment claim — see
 * app/api/billing/whish/claim/route.ts and lib/billing/whish-links.ts for
 * why this exists instead of a real webhook. Protected by a shared secret
 * (ADMIN_SECRET) rather than a full admin-role system, matching the size of
 * this app; set ADMIN_SECRET in Vercel to something long and random before
 * relying on this in production. The UI at /[locale]/admin/whish posts here.
 *
 * On confirm, this mirrors exactly what the real billing webhook does for
 * subscription.created (see app/api/billing/webhook/route.ts) — upsert
 * profiles.plan to "pro" and upsert a public.subscriptions row — so the
 * rest of the app (paywalls, the pricing page's "already Pro" check, etc.)
 * can't tell the difference between a Whish approval and a Stripe/Lemon
 * Squeezy webhook.
 */
export async function POST(request: NextRequest) {
  const { secret, email, action, note } = (await request.json()) as {
    secret: string;
    email: string;
    action: "confirm" | "reject";
    note?: string;
  };

  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    return NextResponse.json(
      { error: "ADMIN_SECRET is not set on the server — set it in Vercel before using this." },
      { status: 500 }
    );
  }
  if (!secret || secret !== adminSecret) {
    return NextResponse.json({ error: "Invalid admin secret" }, { status: 401 });
  }
  if (!email || (action !== "confirm" && action !== "reject")) {
    return NextResponse.json({ error: "Missing email or invalid action" }, { status: 400 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (err) {
    console.error("Whish confirm: admin client not configured", err);
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  const { data: claim, error: findError } = await admin
    .from("whish_payment_claims")
    .select("id, user_id, email, plan, status")
    .eq("email", email)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findError || !claim) {
    return NextResponse.json(
      { error: `No pending Whish claim found for ${email}` },
      { status: 404 }
    );
  }

  if (action === "reject") {
    await admin
      .from("whish_payment_claims")
      .update(note ? { status: "rejected", note } : { status: "rejected" })
      .eq("id", claim.id);
    return NextResponse.json({ ok: true, action: "rejected", email });
  }

  // action === "confirm" — same per-side-effect try/catch pattern as the
  // real webhook handler: a failure updating `subscriptions` must never
  // block the `profiles.plan` upgrade, which is the part that actually
  // matters to the paying user.
  try {
    await admin.from("profiles").upsert({ id: claim.user_id, plan: "pro" }, { onConflict: "id" });
  } catch (err) {
    console.error("Whish confirm: failed to upgrade profiles.plan", claim.user_id, err);
    return NextResponse.json({ error: "Failed to upgrade user's plan — check server logs" }, { status: 500 });
  }

  try {
    await admin.from("subscriptions").upsert(
      {
        user_id: claim.user_id,
        provider: "whish",
        plan: claim.plan,
        status: "active",
      },
      { onConflict: "user_id" }
    );
  } catch (err) {
    console.error("Whish confirm: failed to upsert subscriptions row", claim.user_id, err);
  }

  try {
    await admin
      .from("whish_payment_claims")
      .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
      .eq("id", claim.id);
  } catch (err) {
    console.error("Whish confirm: failed to mark claim confirmed", claim.id, err);
  }

  return NextResponse.json({ ok: true, action: "confirmed", email, plan: claim.plan });
}
