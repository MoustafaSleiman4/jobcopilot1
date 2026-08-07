// Employer signup requires a "professional"/work email rather than a
// personal inbox — a lightweight client-side domain blocklist rather than
// any kind of verified-domain/MX-lookup system, consistent with how the
// rest of auth in this app works (direct client-side Supabase calls, no
// custom API routes). This is a soft nudge, not hard security: someone
// determined to sign up with a free-provider address can't be fully
// stopped without real domain verification, which is out of scope here.
const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "icloud.com",
  "aol.com",
  "msn.com",
  "mail.com",
]);

export function isProfessionalEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase().trim();
  if (!domain) return false;
  return !FREE_EMAIL_DOMAINS.has(domain);
}
