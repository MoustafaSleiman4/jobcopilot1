"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, Link } from "@/i18n/navigation";
import Logo from "./Logo";
import LocaleSwitcher from "./LocaleSwitcher";
import ChatWidget from "./ChatWidget";
import NotificationBell from "./NotificationBell";
import { createClient } from "@/lib/supabase/client";
import { useAuthUser } from "@/lib/useAuthUser";
import {
  LayoutDashboard,
  FileText,
  Search,
  KanbanSquare,
  MessageCircleMore,
  MessageSquare,
  LogOut,
  ChevronDown,
  Mail,
  BarChart3,
  GraduationCap,
  Zap,
  HelpCircle,
  Building2,
  UserPlus,
  Network,
  Newspaper,
  Sparkles,
} from "lucide-react";

const navItems = [
  { key: "overview", href: "/dashboard", icon: LayoutDashboard },
  // Connections ("My Network")/Posts/Messages: promoted to right after
  // Overview, ahead of the job-search tools — the social layer is meant to
  // be a headline feature of the app, not a buried afterthought, so it
  // gets prime placement rather than being sorted after every job-search
  // page. "My Network" additionally gets a small gold accent (see the
  // `highlight` flag, rendered in both nav lists below) to draw the eye to
  // it as the newest, most prominent section — the same gold-as-rare-
  // highlight convention already used for the Pro plan badge elsewhere in
  // this header, not a paid/Pro gate (the feature itself stays free).
  { key: "connections", href: "/dashboard/connections", icon: Network, highlight: true },
  { key: "posts", href: "/dashboard/posts", icon: Newspaper },
  { key: "messages", href: "/dashboard/messages", icon: MessageSquare },
  { key: "resume", href: "/dashboard/resume", icon: FileText },
  { key: "jobs", href: "/dashboard/jobs", icon: Search },
  { key: "autoApply", href: "/dashboard/auto-apply", icon: Zap },
  { key: "applications", href: "/dashboard/applications", icon: KanbanSquare },
  { key: "coverLetter", href: "/dashboard/cover-letter", icon: Mail },
  { key: "certifications", href: "/dashboard/certifications", icon: GraduationCap },
  { key: "reports", href: "/dashboard/reports", icon: BarChart3 },
  // Kept last in the sidebar (and last in the mobile tab bar) — it's a
  // secondary, occasional action rather than something used every visit,
  // so it shouldn't compete with the core job-search tools above it for
  // the prime top-of-list positions.
  { key: "invite", href: "/dashboard/invite", icon: UserPlus },
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

  // Fire-and-forget "check if the shared job cache needs a refresh" ping,
  // once per dashboard session (this component stays mounted across
  // client-side nav within /dashboard, so this effectively fires once per
  // login/visit, not once per page). The route itself
  // (app/api/jobs/refresh-cache/route.ts) is cheap to call as often as you
  // like — it only actually spends SerpApi/Jooble/Careerjet quota if the
  // shared cache is genuinely stale (see lib/jobCache.ts), so this can
  // never cause repeated real API spend just because a lot of people happen
  // to log in around the same time.
  useEffect(() => {
    fetch("/api/jobs/refresh-cache").catch(() => {
      // Best-effort — a failed ping here just means the daily Vercel Cron
      // backstop (see vercel.json) refreshes the cache instead.
    });
  }, []);

  // Presence heartbeat: this shell stays mounted for the entire dashboard
  // session, so it's the one place that can reliably keep
  // profiles.last_seen_at fresh for as long as the user is actually here.
  // Fired once immediately (so "online" flips true the moment they land,
  // not up to a minute later) and then on an interval — see
  // app/api/presence/heartbeat/route.ts for the write side and
  // ONLINE_WINDOW_MS in app/api/connections/route.ts for how "online" is
  // derived from it (updated within the last 2 minutes). Interval is
  // shorter than that window so a normal browsing session never flickers
  // to "offline" between heartbeats.
  useEffect(() => {
    const beat = () => fetch("/api/presence/heartbeat", { method: "POST" }).catch(() => {});
    beat();
    const handle = setInterval(beat, 60000);
    return () => clearInterval(handle);
  }, []);

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
    <div className="dashboard-scope flex min-h-screen bg-sand-100">
      <aside className="hidden w-64 flex-none border-e border-border bg-surface p-6 md:block">
        <Link href="/">
          <Logo />
        </Link>
        <nav className="mt-10 space-y-1">
          {navItems.map(({ key, href, icon: Icon, ...rest }) => {
            const active = pathname === href;
            const highlight = "highlight" in rest && rest.highlight;
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
                {highlight && <Sparkles className="ms-auto text-gold-500" size={13} />}
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
            {/* Kept as its own always-visible link right next to the
                language switcher (rather than tucked inside the account
                menu below) — a user stuck on something wants Help
                immediately findable the moment they land in the dashboard,
                not one extra click away. */}
            <Link
              href="/help"
              className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground/70 hover:border-emerald-300 hover:text-foreground"
            >
              <HelpCircle size={16} />
              <span className="hidden sm:inline">{t("help")}</span>
            </Link>
            <NotificationBell />
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
                      {/* Only shown once this account actually owns a
                          company row — otherwise every job seeker would see
                          a link into a portal they've never set up. This is
                          the fix for "created a company but couldn't find
                          my way back to the job seeker dashboard": that
                          direction already worked (no code stopped it, /dashboard
                          only requires a session), it just had no visible
                          entry point once someone had switched into the
                          employer side. See EmployerDashboardShell for the
                          matching link back. */}
                      {user.hasCompany && (
                        <Link
                          href="/employer/dashboard"
                          onClick={() => setMenuOpen(false)}
                          className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm font-medium text-foreground/80 hover:bg-sand-100"
                        >
                          <Building2 size={15} />
                          {t("employerDashboard")}
                        </Link>
                      )}
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

      {/* Horizontally scrollable rather than flex-1-per-item: with 11 nav
          entries now (up from 9, after adding Connections/Posts), squeezing
          every item into one non-scrolling row would make each tab too
          narrow to tap or read on a phone. A fixed per-item width plus
          overflow-x-auto keeps every tab a comfortable, consistent size and
          simply lets someone swipe to reach the rest, which also scales
          cleanly if more sections are added later. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex overflow-x-auto border-t border-border bg-surface/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {navItems.map(({ key, href, icon: Icon, ...rest }) => {
          const active = pathname === href;
          const highlight = "highlight" in rest && rest.highlight;
          return (
            <Link
              key={key}
              href={href}
              className={`relative flex w-16 flex-none flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${
                active ? "text-emerald-700" : "text-foreground/50"
              }`}
            >
              <Icon className="h-5 w-5" size={20} />
              {highlight && <Sparkles className="absolute end-2.5 top-1.5 text-gold-500" size={9} />}
              <span className="truncate">{t(key)}</span>
            </Link>
          );
        })}
      </nav>

      <ChatWidget plan={plan} />
    </div>
  );
}
