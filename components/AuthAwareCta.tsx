"use client";

import { Link } from "@/i18n/navigation";
import { useAuthUser } from "@/lib/useAuthUser";

/**
 * A landing-page CTA button that already knows whether the visitor is
 * signed in. Previously every "Start free" / "Create free account" button
 * on the homepage pointed straight at /signup regardless of session state
 * — a real, already-registered user landing here (e.g. from a bookmark or
 * a shared link) would be sent back through signup instead of into their
 * dashboard, which is the same underlying gap as the navbar not showing a
 * Dashboard button. Swaps to /dashboard + a "Go to dashboard" label once a
 * session is confirmed; defaults to the logged-out link while the session
 * check is still in flight so nothing flashes/changes after paint for the
 * common logged-out visitor.
 */
export default function AuthAwareCta({
  loggedOutHref,
  loggedOutLabel,
  loggedInLabel,
  className,
}: {
  loggedOutHref: string;
  loggedOutLabel: string;
  loggedInLabel: string;
  className?: string;
}) {
  const { user, loading } = useAuthUser();
  const signedIn = !loading && Boolean(user);

  return (
    <Link href={signedIn ? "/dashboard" : loggedOutHref} className={className}>
      {signedIn ? loggedInLabel : loggedOutLabel}
    </Link>
  );
}
