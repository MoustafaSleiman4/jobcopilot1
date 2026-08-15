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
    ? `${displayName} is already on GulfJobCopilot — join their network`
    : "You're invited to the Gulf & MEA's professional network + AI job copilot";

  const introLine = displayName
    ? `<strong>${escapeHtml(displayName)}</strong> is already building their professional network on GulfJobCopilot and wanted you in it.`
    : `Someone in your network is already on GulfJobCopilot and wanted you in it.`;

  const introLineText = displayName
    ? `${displayName} is already building their professional network on GulfJobCopilot and wanted you in it.`
    : `Someone in your network is already on GulfJobCopilot and wanted you in it.`;

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
<tr><td align="center" style="font-family:Arial, Helvetica, sans-serif; font-size:28px; line-height:1.3; font-weight:bold; color:#ffffff; padding-bottom:14px;">
Your career.<br>Your network.<br>One platform.
</td></tr>
<tr><td align="center" style="font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.5; color:#d1fae5; max-width:440px;">
The professional network + AI job copilot built for the Gulf, Lebanon &amp; MEA — connect, post, and get hired, all in one place.
</td></tr>
</table>
</td>
</tr>

<tr>
<td style="padding:32px 32px 8px 32px; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.6; color:#27272a;">
Hi,
<br><br>
${introLine} Think of it as LinkedIn's professional network, paired with an AI copilot that actually applies for jobs on your behalf.
</td>
</tr>

<tr>
<td style="padding:16px 32px 4px 32px; font-family:Arial, Helvetica, sans-serif; font-size:11px; font-weight:bold; letter-spacing:1px; color:#a97a1e;">
BUILD YOUR PROFESSIONAL NETWORK
</td>
</tr>
<tr>
<td style="padding:4px 32px 12px 32px; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.7; color:#27272a;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
<tr><td style="padding:6px 0; vertical-align:top; width:22px; color:#059669; font-weight:bold;">&#10003;</td><td style="padding:6px 0;"><strong>Connect</strong> with colleagues, recruiters and peers across the region</td></tr>
<tr><td style="padding:6px 0; vertical-align:top; width:22px; color:#059669; font-weight:bold;">&#10003;</td><td style="padding:6px 0;"><strong>Share updates</strong> — post articles, photos and videos to your professional feed</td></tr>
<tr><td style="padding:6px 0; vertical-align:top; width:22px; color:#059669; font-weight:bold;">&#10003;</td><td style="padding:6px 0;"><strong>Stay in the loop</strong> with real-time notifications on who's engaging with you</td></tr>
</table>
</td>
</tr>

<tr>
<td style="padding:12px 32px 4px 32px; font-family:Arial, Helvetica, sans-serif; font-size:11px; font-weight:bold; letter-spacing:1px; color:#a97a1e; border-top:1px solid #e4e4e7; padding-top:20px;">
YOUR AI JOB COPILOT
</td>
</tr>
<tr>
<td style="padding:4px 32px 8px 32px; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.7; color:#27272a;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
<tr><td style="padding:6px 0; vertical-align:top; width:22px; color:#059669; font-weight:bold;">&#10003;</td><td style="padding:6px 0;"><strong>AI-optimized resumes</strong> — tailored per application, not generic</td></tr>
<tr><td style="padding:6px 0; vertical-align:top; width:22px; color:#059669; font-weight:bold;">&#10003;</td><td style="padding:6px 0;"><strong>Smart job matching</strong> — real openings across the Gulf, Lebanon &amp; MEA</td></tr>
<tr><td style="padding:6px 0; vertical-align:top; width:22px; color:#059669; font-weight:bold;">&#10003;</td><td style="padding:6px 0;"><strong>Auto Apply</strong> — one-click apply and an AI cover letter generator</td></tr>
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

  const text = `Your career. Your network. One platform.
The professional network + AI job copilot built for the Gulf, Lebanon & MEA — connect, post, and get hired, all in one place.

Hi,

${introLineText} Think of it as LinkedIn's professional network, paired with an AI copilot that actually applies for jobs on your behalf.

BUILD YOUR PROFESSIONAL NETWORK
- Connect with colleagues, recruiters and peers across the region
- Share updates — post articles, photos and videos to your professional feed
- Stay in the loop with real-time notifications on who's engaging with you

YOUR AI JOB COPILOT
- AI-optimized resumes — tailored per application, not generic
- Smart job matching — real openings across the Gulf, Lebanon & MEA
- Auto Apply — one-click apply and an AI cover letter generator
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

/**
 * Shared compact template for the two "someone did something with your
 * network" transactional emails below (connection request received /
 * connection request accepted) — LinkedIn's own equivalents are a short,
 * single-purpose notice with one clear button, not a marketing pitch like
 * sendInviteEmail's hero, so this is intentionally a much smaller layout:
 * a name line, one sentence of context, a subtitle (job title @ company)
 * when available, and one CTA button.
 */
function renderConnectionNotificationEmail({
  headline,
  bodyLine,
  personName,
  personSubtitle,
  ctaLabel,
  ctaUrl,
  unsubscribeMailto,
}: {
  headline: string;
  bodyLine: string;
  personName: string;
  personSubtitle: string | null;
  ctaLabel: string;
  ctaUrl: string;
  unsubscribeMailto: string;
}): { html: string; text: string } {
  const initial = escapeHtml(personName.trim().charAt(0).toUpperCase() || "?");

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GulfJobCopilot</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f4f5">
<tr>
<td align="center" style="padding:24px 16px;">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="max-width:480px; width:100%; background-color:#ffffff; border-radius:12px; overflow:hidden;">

<tr>
<td style="padding:20px 28px; border-bottom:1px solid #e4e4e7; font-family:Arial, Helvetica, sans-serif; font-size:13px; font-weight:bold; letter-spacing:0.5px; color:#065f46;">
GULFJOBCOPILOT
</td>
</tr>

<tr>
<td style="padding:32px 28px 8px 28px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="vertical-align:top; padding-inline-end:14px;">
<span style="display:inline-flex; align-items:center; justify-content:center; width:44px; height:44px; border-radius:999px; background-color:#d1fae5; color:#065f46; font-family:Arial, Helvetica, sans-serif; font-size:18px; font-weight:bold;">${initial}</span>
</td>
<td style="vertical-align:middle;">
<p style="margin:0; font-family:Arial, Helvetica, sans-serif; font-size:16px; font-weight:bold; color:#18181b;">${escapeHtml(personName)}</p>
${personSubtitle ? `<p style="margin:2px 0 0 0; font-family:Arial, Helvetica, sans-serif; font-size:13px; color:#71717a;">${escapeHtml(personSubtitle)}</p>` : ""}
</td>
</tr>
</table>
</td>
</tr>

<tr>
<td style="padding:18px 28px 4px 28px; font-family:Arial, Helvetica, sans-serif; font-size:18px; font-weight:bold; color:#18181b;">
${escapeHtml(headline)}
</td>
</tr>
<tr>
<td style="padding:6px 28px 24px 28px; font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:1.6; color:#3f3f46;">
${escapeHtml(bodyLine)}
</td>
</tr>

<tr>
<td style="padding:0 28px 32px 28px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr>
<td align="center" bgcolor="#059669" style="border-radius:999px;">
<a href="${ctaUrl}" target="_blank" style="display:inline-block; padding:12px 28px; font-family:Arial, Helvetica, sans-serif; font-size:14px; font-weight:bold; color:#ffffff; text-decoration:none; border-radius:999px;">${escapeHtml(ctaLabel)} →</a>
</td>
</tr>
</table>
</td>
</tr>

<tr>
<td style="padding:16px 28px 24px 28px; font-family:Arial, Helvetica, sans-serif; font-size:12px; line-height:1.6; color:#a1a1aa; border-top:1px solid #e4e4e7; padding-top:18px;">
GulfJobCopilot · Your professional network + AI job copilot for the Gulf &amp; MEA
</td>
</tr>

</table>
</td>
</tr>
</table>
</body>
</html>`;

  const text = `${headline}

${bodyLine}

${ctaLabel}: ${ctaUrl}

GulfJobCopilot · Your professional network + AI job copilot for the Gulf & MEA`;

  return { html, text };
}

/**
 * "X wants to connect with you" — sent to the addressee the moment a
 * connection request is created (see app/api/connections/request/route.ts).
 * Mirrors LinkedIn's own "new invitation" email: who's asking, what they
 * do, one button straight to the Requests tab. Best-effort — the caller
 * treats a failure here as non-fatal (the in-app notification from
 * fan_out_notification() already covers it), matching how post_media
 * insert failures are handled elsewhere in this API.
 */
export async function sendConnectionRequestEmail({
  to,
  requesterName,
  requesterSubtitle,
}: {
  to: string;
  requesterName: string;
  requesterSubtitle: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const from =
    process.env.RESEND_INVITE_FROM_EMAIL ||
    process.env.RESEND_FROM_EMAIL ||
    "GulfJobCopilot <invites@mail.gulfjobcopilot.com>";
  const unsubscribeMailto = `mailto:${from.match(/<(.+)>/)?.[1] ?? from}?subject=unsubscribe`;

  const { html, text } = renderConnectionNotificationEmail({
    headline: `${requesterName} wants to connect with you`,
    bodyLine: `${requesterName} sent you an invitation to connect on GulfJobCopilot. Accept to grow your professional network and start messaging.`,
    personName: requesterName,
    personSubtitle: requesterSubtitle,
    ctaLabel: "View invitation",
    ctaUrl: "https://gulfjobcopilot.com/en/dashboard/connections",
    unsubscribeMailto,
  });

  return sendResendEmail({
    to,
    from,
    subject: `${requesterName} wants to connect with you on GulfJobCopilot`,
    html,
    text,
    unsubscribeMailto,
  });
}

/**
 * "X accepted your invitation" — sent to the original requester once the
 * other party accepts (see app/api/connections/[id]/accept/route.ts).
 * LinkedIn's "new connection" equivalent.
 */
export async function sendConnectionAcceptedEmail({
  to,
  accepterName,
  accepterSubtitle,
}: {
  to: string;
  accepterName: string;
  accepterSubtitle: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const from =
    process.env.RESEND_INVITE_FROM_EMAIL ||
    process.env.RESEND_FROM_EMAIL ||
    "GulfJobCopilot <invites@mail.gulfjobcopilot.com>";
  const unsubscribeMailto = `mailto:${from.match(/<(.+)>/)?.[1] ?? from}?subject=unsubscribe`;

  const { html, text } = renderConnectionNotificationEmail({
    headline: `You're now connected with ${accepterName}`,
    bodyLine: `${accepterName} accepted your invitation to connect on GulfJobCopilot. You can now message each other directly.`,
    personName: accepterName,
    personSubtitle: accepterSubtitle,
    ctaLabel: "View connection",
    ctaUrl: "https://gulfjobcopilot.com/en/dashboard/connections",
    unsubscribeMailto,
  });

  return sendResendEmail({
    to,
    from,
    subject: `${accepterName} accepted your invitation to connect`,
    html,
    text,
    unsubscribeMailto,
  });
}

/**
 * Shared low-level Resend send, factored out of sendInviteEmail so the two
 * new connection-notification senders above don't repeat the same
 * fetch/error-handling block a third and fourth time. sendInviteEmail keeps
 * its own inline call (it predates this helper and has one extra header
 * already inline) rather than being refactored here, to keep this change
 * additive rather than touching already-verified code.
 */
async function sendResendEmail({
  to,
  from,
  subject,
  html,
  text,
  unsubscribeMailto,
}: {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
  unsubscribeMailto: string;
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[email] RESEND_API_KEY not set — would have sent "${subject}" to ${to}`);
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
      console.error("[email] Resend error:", res.status, body);
      return { ok: false, error: "Failed to send email" };
    }
    return { ok: true };
  } catch (err) {
    console.error("[email] failed to send:", err);
    return { ok: false, error: "Failed to send email" };
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
