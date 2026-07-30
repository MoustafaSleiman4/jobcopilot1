const RESEND_API_URL = "https://api.resend.com/emails";

/**
 * Sends a one-off admin notification email (new signup, new payment) using
 * Resend. Falls back to a console log in demo mode (no RESEND_API_KEY set
 * yet) so nothing throws and blocks the calling webhook/route — matches the
 * same "gracefully no-op until configured" pattern used for AI/billing.
 *
 * Set in .env.local / Vercel:
 *   RESEND_API_KEY        - from resend.com (Settings > API Keys)
 *   RESEND_FROM_EMAIL      - e.g. "GulfJobCopilot <notifications@gulfjobcopilot.com>"
 *                            (needs a verified sending domain in Resend; until
 *                            you verify one, "onboarding@resend.dev" works as
 *                            a sandbox sender)
 *   ADMIN_NOTIFICATION_EMAIL - where these emails go; defaults to
 *                            moustafa_sleiman@hotmail.com
 */
export async function sendAdminNotification(subject: string, html: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ADMIN_NOTIFICATION_EMAIL || "moustafa_sleiman@hotmail.com";
  const from = process.env.RESEND_FROM_EMAIL || "GulfJobCopilot <onboarding@resend.dev>";

  if (!apiKey) {
    console.log(`[email] RESEND_API_KEY not set — would have sent "${subject}" to ${to}`);
    return;
  }

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[email] Resend API error:", res.status, body);
    }
  } catch (err) {
    console.error("[email] failed to send notification:", err);
  }
}
