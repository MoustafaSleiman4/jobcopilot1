import { NextRequest, NextResponse } from "next/server";
import { sendAdminNotification } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Target for a Supabase Database Webhook: Database > Webhooks > Create
 * webhook > table "profiles", event "Insert" > this route's URL
 * (https://<your-domain>/api/notify/new-signup), with an HTTP header
 * "x-webhook-secret: <SUPABASE_WEBHOOK_SECRET>" added in the webhook's
 * config so this route can confirm the request really came from Supabase.
 *
 * Fires once per new profiles row — i.e. once per real signup, regardless
 * of whether it came from email/password or (later) an OAuth provider,
 * since profile-trigger.sql's handle_new_user() creates that row for every
 * new auth.users insert.
 */
export async function POST(request: NextRequest) {
  const expectedSecret = process.env.SUPABASE_WEBHOOK_SECRET;
  if (expectedSecret) {
    const providedSecret = request.headers.get("x-webhook-secret");
    if (providedSecret !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const payload = await request.json().catch(() => null);
  const record = payload?.record as { id?: string; full_name?: string; locale?: string } | undefined;

  if (!record?.id) {
    return NextResponse.json({ received: true });
  }

  let email = "unknown";
  try {
    const admin = createAdminClient();
    const { data } = await admin.auth.admin.getUserById(record.id);
    email = data.user?.email ?? "unknown";
  } catch {
    // SUPABASE_SERVICE_ROLE_KEY not configured yet — notify without the email
  }

  await sendAdminNotification(
    "New GulfJobCopilot signup",
    `<p>A new user just registered.</p>
     <p><strong>Name:</strong> ${record.full_name || "—"}</p>
     <p><strong>Email:</strong> ${email}</p>
     <p><strong>Locale:</strong> ${record.locale || "—"}</p>`
  );

  return NextResponse.json({ received: true });
}
