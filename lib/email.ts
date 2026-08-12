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

/**
 * Sends a "join GulfJobCopilot" invitation email on behalf of a signed-in
 * user (see app/api/invite/route.ts, which is the only caller). Always
 * sent FROM a GulfJobCopilot-branded address — never the inviting user's
 * own inbox — both so the invitee's reply goes somewhere monitored and so
 * the inviter's personal email address is never exposed to a stranger.
 *
 * `inviterName` is only ever included in the copy when `showName` is true;
 * the caller is responsible for deciding that (from the inviter's own
 * explicit toggle, recorded per-invite in public.referrals), not this
 * function — this function just renders whichever variant it's told to.
 *
 * `refUserId` becomes a `?ref=` query param on the signup CTA so a joining
 * user can eventually be attributed back to whoever invited them, without
 * this function needing to know anything about how that's stored.
 *
 * Set in .env.local / Vercel:
 *   RESEND_INVITE_FROM_EMAIL - defaults to RESEND_FROM_EMAIL, then to
 *                              "GulfJobCopilot <invites@mail.gulfjobcopilot.com>"
 *                              (a distinct address from admin notifications,
 *                              so invitees replying land somewhere sensible)
 */
export async function sendInviteEmail({
  to,
  inviterName,
  showName,
  refUserId,
}: {
  to: string;
  inviterName: string | null;
  showName: boolean;
  refUserId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from =
    process.env.RESEND_INVITE_FROM_EMAIL ||
    process.env.RESEND_FROM_EMAIL ||
    "GulfJobCopilot <invites@mail.gulfjobcopilot.com>";

  const displayName = showName && inviterName ? inviterName.trim() : null;
  const subject = displayName
    ? `${displayName} invited you to GulfJobCopilot`
    : "You've been invited to GulfJobCopilot";

  const introLine = displayName
    ? `<strong>${escapeHtml(displayName)}</strong> thinks you'd be a great fit for GulfJobCopilot and wanted to personally invite you to join.`
    : `A member of the GulfJobCopilot community thought you'd love it here and wanted to personally invite you to join.`;

  const introLineText = displayName
    ? `${displayName} thinks you'd be a great fit for GulfJobCopilot and wanted to personally invite you to join.`
    : `A member of the GulfJobCopilot community thought you'd love it here and wanted to personally invite you to join.`;

  const signupUrl = `https://gulfjobcopilot.com/en/signup?ref=${encodeURIComponent(refUserId)}`;
  const unsubscribeMailto = `mailto:${(from.match(/<(.+)>/)?.[1] ?? from)}?subject=unsubscribe`;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>GulfJobCopilot</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f4f5">
<tr>
<td align="center" style="padding:24px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:12px; overflow:hidden;">

<tr>
<td align="center" bgcolor="#065f46" style="background-color:#065f46; padding:40px 24px 36px 24px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="padding-bottom:16px;">
<span style="display:inline-block; border:1px solid rgba(255,255,255,0.5); border-radius:999px; padding:6px 16px; font-family:Arial, Helvetica, sans-serif; font-size:11px; font-weight:bold; letter-spacing:1px; color:#d1fae5;">GULFJOBCOPILOT</span>
</td></tr>
<tr><td align="center" style="font-family:Arial, Helvetica, sans-serif; font-size:26px; line-height:1.3; font-weight:bold; color:#ffffff; padding-bottom:14px;">
You're personally invited<br>to GulfJobCopilot
</td></tr>
<tr><td align="center" style="font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.5; color:#d1fae5; max-width:440px;">
The AI copilot for landing your next job across the Gulf, Lebanon &amp; MEA.
</td></tr>
</table>
</td>
</tr>

<tr>
<td style="padding:32px 32px 8px 32px; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.6; color:#27272a;">
Hi,
<br><br>
${introLine}
</td>
</tr>

<tr>
<td style="padding:8px 32px 8px 32px; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.7; color:#27272a;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
<tr><td style="padding:6px 0; vertical-align:top; width:22px; color:#059669; font-weight:bold;">&#10003;</td><td style="padding:6px 0;"><strong>AI-optimized resumes</strong> — tailored per application, not generic</td></tr>
<tr><td style="padding:6px 0; vertical-align:top; width:22px; color:#059669; font-weight:bold;">&#10003;</td><td style="padding:6px 0;"><strong>Smart job matching</strong> — real openings across the Gulf, Lebanon &amp; MEA</td></tr>
<tr><td style="padding:6px 0; vertical-align:top; width:22px; color:#059669; font-weight:bold;">&#10003;</td><td style="padding:6px 0;"><strong>One-click apply</strong> and an AI cover letter generator</td></tr>
<tr><td style="padding:6px 0; vertical-align:top; width:22px; color:#059669; font-weight:bold;">&#10003;</td><td style="padding:6px 0;"><strong>Free to start</strong> — no card required</td></tr>
</table>
</td>
</tr>

<tr>
<td align="center" style="padding:24px 32px 36px 32px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr>
<td align="center" bgcolor="#059669" style="border-radius:999px;">
<a href="${signupUrl}" target="_blank" style="display:inline-block; padding:14px 36px; font-family:Arial, Helvetica, sans-serif; font-size:16px; font-weight:bold; color:#ffffff; text-decoration:none; border-radius:999px;">Join GulfJobCopilot Free →</a>
</td>
</tr>
</table>
</td>
</tr>

<tr>
<td style="padding:0 32px 32px 32px; font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:1.6; color:#71717a; border-top:1px solid #e4e4e7; padding-top:20px;">
— The GulfJobCopilot team
<br><br>
GulfJobCopilot · Your AI copilot for the Gulf &amp; MEA job market
<br><br>
You received this because someone using GulfJobCopilot invited you directly. If you'd rather not hear from us, just reply to this email and let us know.
</td>
</tr>

</table>
</td>
</tr>
</table>
</body>
</html>`;

  const text = `You're personally invited to GulfJobCopilot

Hi,

${introLineText}

- AI-optimized resumes — tailored per application, not generic
- Smart job matching — real openings across the Gulf, Lebanon & MEA
- One-click apply and an AI cover letter generator
- Free to start — no card required

Join free: ${signupUrl}

— The GulfJobCopilot team
GulfJobCopilot · Your AI copilot for the Gulf & MEA job market

You received this because someone using GulfJobCopilot invited you directly. If you'd rather not hear from us, just reply to this email and let us know.`;

  if (!apiKey) {
    console.log(`[email] RESEND_API_KEY not set — would have sent invite to ${to}`);
    return { ok: false, error: "Email is not configured yet" };
  }

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
        text,
        headers: { "List-Unsubscribe": `<${unsubscribeMailto}>` },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[email] Resend invite error:", res.status, body);
      return { ok: false, error: "Failed to send invitation" };
    }
    return { ok: true };
  } catch (err) {
    console.error("[email] failed to send invite:", err);
    return { ok: false, error: "Failed to send invitation" };
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
