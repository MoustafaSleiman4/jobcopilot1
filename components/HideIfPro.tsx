"use client";

import type { ReactNode } from "react";
import { useAuthUser } from "@/lib/useAuthUser";

/**
 * Hides "See pricing" / "Upgrade to Pro" marketing content from a visitor
 * who's already signed in on the Pro plan — there's nothing for them to
 * upgrade to, so re-showing that pitch on every page read as ignoring that
 * they're already a customer. Defaults to SHOWING children while the
 * session/plan check is still in flight (and for logged-out/free visitors,
 * which is most traffic) rather than hiding-then-showing, so there's no
 * layout flash for the common case — it only ever hides once a Pro session
 * is confirmed.
 */
export default function HideIfPro({ children }: { children: ReactNode }) {
  const { user, loading } = useAuthUser();
  if (!loading && user?.plan === "pro") return null;
  return <>{children}</>;
}
