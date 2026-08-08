"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, Link } from "@/i18n/navigation";
import Logo from "./Logo";
import LocaleSwitcher from "./LocaleSwitcher";
import { createClient } from "@/lib/supabase/client";
import { Briefcase, Building2, LayoutDashboard, LogOut, ChevronDown } from "lucide-react";

const navItems = [
  { key: "postings", href: "/employer/dashboard", icon: Briefcase },
  { key: "profile", href: "/employer/dashboard/profile", icon: Building2 },
] as const;

export default function EmployerDashboardShell({
  children,
  companyName,
  demoMode,
}: {
  children: React.ReactNode;
  companyName: string;
  demoMode: boolean;
}) {
  const t = useTranslations("employer.nav");
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleSignOut() {
    setMenuOpen(false);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      // Supabase not configured — nothing to sign out of.
    }
    router.push("/employer/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen bg-sand-100">
      <aside className="hidden w-64 flex-none border-e border-border bg-surface p-6 md:block">
        <Link href="/">
          <Logo />
        </Link>
        <span className="mt-3 inline-block rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700">
          {t("employerBadge")}
        </span>
        <nav className="mt-8 space-y-1">
          {navItems.map(({ key, href, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={key}
                href={href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-emerald-50 text-emerald-700"
                    : "text-foreground/60 hover:bg-sand-100 hover:text-foreground"
                }`}
              >
                <Icon className="h-4.5 w-4.5" size={18} />
                {t(key)}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border bg-surface px-6 py-4">
          <div className="flex items-center gap-2 text-sm text-foreground/60 md:hidden">
            <Logo />
          </div>
          <div className="ms-auto flex items-center gap-3">
            {demoMode && (
              <span className="rounded-full bg-gold-100 px-3 py-1 text-xs font-semibold text-gold-600">
                Demo mode — connect Supabase to go live
              </span>
            )}
            <LocaleSwitcher />

            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 rounded-full border border-border bg-background py-1 ps-1 pe-2.5 text-sm font-medium text-foreground/80 hover:border-emerald-300"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                  {(companyName || "?").charAt(0).toUpperCase()}
                </span>
                <span className="hidden max-w-[9rem] truncate sm:inline">{companyName}</span>
                <ChevronDown size={14} className="text-foreground/40" />
              </button>

              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute end-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-surface p-1.5 shadow-lg">
                    <div className="truncate px-3 py-2 text-sm font-semibold text-foreground">
                      {companyName}
                    </div>
                    {/* This account's Supabase Auth session is the same one
                        used on the job-seeker side — owning a company row
                        doesn't remove access to /dashboard, it just wasn't
                        reachable from here before. Always shown (unlike the
                        matching link on the job-seeker side, which only
                        appears once a company exists): every employer
                        account is, underneath, a normal logged-in user who
                        can always get back to their job-seeker dashboard. */}
                    <Link
                      href="/dashboard"
                      onClick={() => setMenuOpen(false)}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm font-medium text-foreground/80 hover:bg-sand-100"
                    >
                      <LayoutDashboard size={15} />
                      {t("jobSeekerDashboard")}
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
        </header>

        <main className="flex-1 p-6 pb-24 md:p-10">{children}</main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {navItems.map(({ key, href, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={key}
              href={href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${
                active ? "text-emerald-700" : "text-foreground/50"
              }`}
            >
              <Icon className="h-5 w-5" size={20} />
              {t(key)}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
