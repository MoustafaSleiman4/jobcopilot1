// Shared "should this viewer see this person's email/phone" rule, used by
// every API route that hands another user's profile row to a client
// (people search, suggestions, connections list, message threads). Kept in
// one place so the rule can't drift between routes: a profile's real
// contact fields are only ever sent to the browser here, in TypeScript —
// public.profiles' RLS makes the ROW readable to any signed-in user (see
// the profiles_readable_and_email_column migration), but does not and
// cannot restrict individual columns, so this function is the actual
// enforcement point for "hide my email/phone from other users".
export type ProfileContactRow = {
  id: string;
  email?: string | null;
  phone?: string | null;
  show_email?: boolean | null;
  show_phone?: boolean | null;
};

export function visibleContact(row: ProfileContactRow, viewerId: string): { email: string | null; phone: string | null } {
  const isSelf = row.id === viewerId;
  return {
    email: isSelf || row.show_email ? row.email ?? null : null,
    phone: isSelf || row.show_phone ? row.phone ?? null : null,
  };
}
