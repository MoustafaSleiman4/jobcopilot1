"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname, Link } from "@/i18n/navigation";
import Logo from "./Logo";
import LocaleSwitcher from "./LocaleSwitcher";
import ChatWidget from "./ChatWidget";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutDashboard,
  FileText,
  Search,
  KanbanSquare,
  MessageCircleMore,
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
  const [plan, setPlan] = useState<"free" | "pro">("free");

  useEffect(() => {
    let cancelled = false;
    try {
      const supabase = createClient();
      supabase.auth
        .getUser()
        .then(async ({ data }) => {
          const uid = data.user?.id;
          if (!uid || cancelled) return;
          const { data: profile } = await supabase
            .from("profiles")
            .select("plan")
            .eq("id", uid)
            .single();
          if (!cancelled && profile?.plan === "pro") setPlan("pro");
        })
        .catch(() => {
          // Not logged in / network issue — stay on the free-tier default.
        });
    } catch {
      // Supabase not configured yet — stay on the free-tier default.
    }
    return () => {
      cancelled = true;
    };
  }, []);

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
