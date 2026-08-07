"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { LayoutDashboard, LogOut } from "lucide-react";
import Logo from "./Logo";
import LocaleSwitcher from "./LocaleSwitcher";
import { useAuthUser } from "@/lib/useAuthUser";
import { createClient } from "@/lib/supabase/client";

export default function Navbar() {
  const t = useTranslations("nav");
  const router = useRouter();
  const { user, loading } = useAuthUser();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleSignOut() {
    setMenuOpen(false);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      // Supabase not configured — nothing to sign out of.
    }
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/">
          <Logo />
        </Link>
        <div className="hidden items-center gap-8 text-sm font-medium text-foreground/70 md:flex">
          {/* Already-subscribed Pro visitors have nothing to upgrade to —
              no need to keep pointing them at pricing. */}
          {(loading || user?.plan !== "pro") && (
            <Link href="/pricing" className="hover:text-foreground">
              {t("pricing")}
            </Link>
          )}
        </div>
        <div className="flex items-center gap-3">
          <LocaleSwitcher />

          {/* While the session check is in flight, default to the logged-out
              buttons rather than flashing a loading state — if a session
              exists it swaps in a moment later. */}
          {!loading && user ? (
            <>
              {/* Always-visible Dashboard button — previously the only way
                  back into the dashboard from the marketing site was
                  opening the account dropdown below, which a logged-in
                  user landing on the homepage had no reason to think to
                  click. A direct, always-shown button removes that hunt. */}
              <Link
                href="/dashboard"
                className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
              >
                <LayoutDashboard size={15} />
                <span className="hidden sm:inline">{t("dashboard")}</span>
              </Link>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  className="flex items-center gap-2 rounded-full border border-border bg-surface py-1.5 ps-1.5 pe-3 text-sm font-medium text-foreground/80 hover:border-emerald-300"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                    {(user.fullName || user.email || "?").charAt(0).toUpperCase()}
                  </span>
                  <span className="hidden max-w-[10rem] truncate sm:inline">
                    {user.fullName || user.email}
                  </span>
                </button>

                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                    <div className="absolute end-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-surface p-1.5 shadow-lg">
                      <div className="truncate px-3 py-2 text-xs text-foreground/50">
                        {user.email}
                      </div>
                      <Link
                        href="/dashboard"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-foreground/80 hover:bg-sand-100"
                      >
                        <LayoutDashboard size={15} />
                        {t("dashboard")}
                      </Link>
                      <button
                        type="button"
                        onClick={handleSignOut}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm font-medium text-red-600 hover:bg-red-50"
                      >
                        <LogOut size={15} />
                        {t("signOut")}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-full border-2 border-emerald-600 px-3.5 py-2 text-sm font-bold text-emerald-700 transition-colors hover:bg-emerald-50 sm:px-5 sm:py-2.5 sm:text-base"
              >
                {t("login")}
              </Link>
              <Link
                href="/signup"
                className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-md transition-colors hover:bg-emerald-700 sm:px-6 sm:py-2.5 sm:text-base"
              >
                {t("signup")}
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
