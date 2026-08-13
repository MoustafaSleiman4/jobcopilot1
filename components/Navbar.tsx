"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { LayoutDashboard, LogOut, Menu, X, Tag, Briefcase } from "lucide-react";
import Logo from "./Logo";
import LocaleSwitcher from "./LocaleSwitcher";
import { useAuthUser } from "@/lib/useAuthUser";
import { createClient } from "@/lib/supabase/client";

export default function Navbar() {
  const t = useTranslations("nav");
  const router = useRouter();
  const { user, loading } = useAuthUser();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const showPricing = loading || user?.plan !== "pro";

  async function handleSignOut() {
    setMenuOpen(false);
    setMobileNavOpen(false);
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
        <div className="hidden items-center gap-2 text-sm font-semibold md:flex">
          {/* Already-subscribed Pro visitors have nothing to upgrade to —
              no need to keep pointing them at pricing. Styled as a visible
              pill (border + hover fill) rather than plain text so it reads
              as clickable, not as static label copy. */}
          {showPricing && (
            <Link
              href="/pricing"
              className="flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-foreground/80 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
            >
              <Tag size={15} />
              {t("pricing")}
            </Link>
          )}
          {/* Always shown — a signed-in job seeker may still be the person
              hiring for their own company, and an employer account browsing
              the marketing site (rather than /employer/dashboard) should
              still find its way back in. */}
          <Link
            href="/employer/signup"
            className="flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-foreground/80 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
          >
            <Briefcase size={15} />
            {t("forEmployers")}
          </Link>
        </div>
        <div className="flex items-center gap-3">
          {/* Mobile-only entry point — below md the links above are hidden
              entirely, so without this button Pricing/For Employers were
              unreachable on mobile. */}
          <button
            type="button"
            onClick={() => setMobileNavOpen((v) => !v)}
            aria-label={mobileNavOpen ? t("closeMenu") : t("openMenu")}
            aria-expanded={mobileNavOpen}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-foreground/70 transition-colors hover:border-emerald-300 hover:text-emerald-700 md:hidden"
          >
            {mobileNavOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          <LocaleSwitcher />

          {/* While the session check is in flight, default to the logged-out
              buttons rather than flashing a loading state — if a session
              exists it swaps in a moment later. */}
          {/* Below `sm` these duplicate what's in the mobile nav panel above,
              and there isn't room for both the hamburger and full-text
              pill buttons without the header overflowing horizontally
              (verified: it did, pushing "Get started" off-screen on a
              390px-wide phone) — so the full buttons only render at sm+
              and the mobile panel is the only path to them below that. */}
          {!loading && user ? (
            <div className="hidden items-center gap-3 sm:flex">
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
                <span>{t("dashboard")}</span>
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
                  <span className="max-w-[10rem] truncate">
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
            </div>
          ) : (
            <div className="hidden items-center gap-3 sm:flex">
              <Link
                href="/login"
                className="rounded-full border-2 border-emerald-600 px-5 py-2.5 text-base font-bold text-emerald-700 transition-colors hover:bg-emerald-50"
              >
                {t("login")}
              </Link>
              <Link
                href="/signup"
                className="rounded-full bg-emerald-600 px-6 py-2.5 text-base font-bold text-white shadow-md transition-colors hover:bg-emerald-700"
              >
                {t("signup")}
              </Link>
            </div>
          )}
        </div>
      </nav>

      {/* Mobile nav panel — mirrors the desktop links that are hidden below
          md, plus the auth actions, so nothing in the header is unreachable
          on a phone-width screen. */}
      {mobileNavOpen && (
        <div className="border-t border-border/80 bg-background px-6 py-3 md:hidden">
          <div className="flex flex-col gap-1.5 text-sm font-semibold text-foreground/80">
            {showPricing && (
              <Link
                href="/pricing"
                onClick={() => setMobileNavOpen(false)}
                className="flex items-center gap-2.5 rounded-lg border border-border px-3.5 py-3 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
              >
                <Tag size={16} />
                {t("pricing")}
              </Link>
            )}
            <Link
              href="/employer/signup"
              onClick={() => setMobileNavOpen(false)}
              className="flex items-center gap-2.5 rounded-lg border border-border px-3.5 py-3 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
            >
              <Briefcase size={16} />
              {t("forEmployers")}
            </Link>

            {!loading && user ? (
              <>
                <Link
                  href="/dashboard"
                  onClick={() => setMobileNavOpen(false)}
                  className="flex items-center gap-2.5 rounded-lg bg-emerald-600 px-3.5 py-3 text-white transition-colors hover:bg-emerald-700"
                >
                  <LayoutDashboard size={16} />
                  {t("dashboard")}
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex items-center gap-2.5 rounded-lg px-3.5 py-3 text-start text-red-600 hover:bg-red-50"
                >
                  <LogOut size={16} />
                  {t("signOut")}
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  onClick={() => setMobileNavOpen(false)}
                  className="flex items-center justify-center rounded-lg border-2 border-emerald-600 px-3.5 py-3 text-emerald-700 transition-colors hover:bg-emerald-50"
                >
                  {t("login")}
                </Link>
                <Link
                  href="/signup"
                  onClick={() => setMobileNavOpen(false)}
                  className="flex items-center justify-center rounded-lg bg-emerald-600 px-3.5 py-3 text-white shadow-sm transition-colors hover:bg-emerald-700"
                >
                  {t("signup")}
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
