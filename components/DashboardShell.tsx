"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, Link } from "@/i18n/navigation";
import Logo from "./Logo";
import LocaleSwitcher from "./LocaleSwitcher";
import ChatWidget from "./ChatWidget";
import { createClient } from "@/lib/supabase/client";
import { useAuthUser } from "@/lib/useAuthUser";
import {
  LayoutDashboard,
  FileText,
  Search,
  KanbanSquare,
  MessageCircleMore,
  LogOut,
  ChevronDown,
} from "lucide-react";

const navItems = [
  { key: "overview", href: "/dashboard", icon: LayoutDashboard },
  { key: "resume", href: "/dashboard/resume", icon: FileText },
  { key: "jobs", href: "/dashboard/jobs", icon: Search },
  { key: "applications", href: "/dashboard/applications", icon: KanbanSquare },
] as const;

export default function DashboardShell({
  children,
  demoMode,
}: {
  children: React.ReactNode;
  demoMode: boolean;
}) {
  const t = useTranslations("dashboard.nav");
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuthUser();
  const plan = user?.plan ?? "free";
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleSignOut() {
    setMenuOpen(false);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      // Supabase not configured — nothing to sign out of.
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen bg-sand-100">
      <aside className="hidden w-64 flex-none border-e border-border bg-surface p-6 md:block">
        <Link href="/">
          <Logo />
        </Link>
        <nav className="mt-10 space-y-1">
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

            {/* Account menu: this is the one place in the whole dashboard
                that visibly confirms "you are logged in" (who as, and on
                which plan) and gives an actual way to sign out — neither
                existed anywhere before this. */}
            {user && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  className="flex items-center gap-2 rounded-full border border-border bg-background py-1 ps-1 pe-2.5 text-sm font-medium text-foreground/80 hover:border-emerald-300"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                    {(user.fullName || user.email || "?").charAt(0).toUpperCase()}
                  </span>
                  <span className="hidden max-w-[9rem] truncate sm:inline">
                    {user.fullName || user.email}
                  </span>
                  <ChevronDown size={14} className="text-foreground/40" />
                </button>

                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                    <div className="absolute end-0 z-20 mt-2 w-60 overflow-hidden rounded-xl border border-border bg-surface p-1.5 shadow-lg">
                      <div className="px-3 py-2">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {user.fullName || t("account")}
                        </p>
                        <p className="truncate text-xs text-foreground/50">{user.email}</p>
                        <span
                          className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            plan === "pro"
                              ? "bg-gold-100 text-gold-600"
                              : "bg-sand-100 text-foreground/60"
                          }`}
                        >
                          {plan === "pro" ? t("planPro") : t("planFree")}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleSignOut}
                        className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm font-medium text-red-600 hover:bg-red-50"
                      >
                        <LogOut size={15} />
                        {t("signOut")}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </header>
        {/* Below md, the sidebar above is hidden entirely — this bottom tab
            bar is the only way to move between dashboard sections on a
            phone, so it isn't optional chrome. The generous bottom padding
            on <main> keeps page content (a save button, a job's apply
            button) from ending up underneath either the tab bar or the
            floating chat button that floats just above it. */}
        <main className="flex-1 p-6 pb-44 md:p-10 md:pb-10">{children}</main>
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

      <ChatWidget plan={plan} />
    </div>
  );
}
