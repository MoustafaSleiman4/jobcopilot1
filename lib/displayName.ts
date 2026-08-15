/**
 * A profile's `full_name` can legitimately be null — either the account
 * predates this column being reliably populated, or (see the
 * backfill_profile_full_name migration) the only "name" Supabase Auth had
 * at signup was a copy of the login email, which isn't a real name and was
 * deliberately left blank rather than showing an email as someone's
 * "name." Every place that renders a Person card (search, suggestions,
 * connections, requests, messages, post authors, notification actors)
 * needs *something* to show though — a blank name looks broken, not
 * private. This is the one shared fallback: derive a friendly display name
 * from the email's local part rather than ever showing an empty string.
 *
 * Deliberately NOT exposing the raw email here — this only ever returns a
 * human-friendly label, never the address itself (that stays gated by
 * lib/contactVisibility.ts's show_email check, entirely separately).
 */
export function deriveDisplayName(fullName: string | null | undefined, email: string | null | undefined): string {
  const trimmedName = fullName?.trim();
  if (trimmedName) return trimmedName;

  const localPart = email?.split("@")[0]?.trim();
  if (localPart) {
    const words = localPart
      .split(/[._\-+0-9]+/)
      .map((w) => w.trim())
      .filter(Boolean);
    if (words.length > 0) {
      return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    }
  }

  return "Member";
}
