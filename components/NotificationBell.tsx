"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Bell, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuthUser } from "@/lib/useAuthUser";
import { formatRelativeTime } from "@/lib/socialFormat";
import type { NotificationItem, NotificationType } from "@/lib/social-types";

const TYPE_KEY: Record<NotificationType, string> = {
  connection_request: "typeConnectionRequest",
  connection_accepted: "typeConnectionAccepted",
  post_reaction: "typePostReaction",
  post_comment: "typePostComment",
  comment_reply: "typeCommentReply",
};

/**
 * Bell icon + unread-count pill, reusing DashboardShell's account-dropdown
 * interaction pattern (local open/close state, `fixed inset-0` click-away
 * overlay, `absolute end-0` panel). Derives the current user itself via
 * useAuthUser() so it can be dropped in with zero props/wiring.
 *
 * Realtime: `postgres_changes` INSERT payloads only carry the raw
 * `notifications` row (actor_id, not a joined actor name/avatar) — there's
 * no server-side join available on the wire. So on a new row arriving we
 * always bump the unread badge immediately, and if the dropdown happens to
 * be open we re-fetch the small "recent 10" list (already the properly
 * joined shape the API returns) rather than trying to synthesize a
 * half-populated item from the raw payload.
 */
export default function NotificationBell() {
  const t = useTranslations("notifications");
  const locale = useLocale();
  const { user } = useAuthUser();

  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const userId = user?.id ?? null;
  // Plain ref (not state) — "have we loaded the recent list at least once"
  // only needs to gate an event handler (toggleOpen / the realtime
  // callback), it never needs to trigger a re-render on its own.
  const loadedOnceRef = useRef(false);

  // Initial badge count.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetch("/api/notifications/unread-count")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setUnreadCount(typeof data.count === "number" ? data.count : 0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function fetchRecent() {
    setLoadingItems(true);
    try {
      const res = await fetch("/api/notifications?limit=10");
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
      loadedOnceRef.current = true;
    } catch {
      // Leave whatever list is already showing.
    } finally {
      setLoadingItems(false);
    }
  }

  function toggleOpen() {
    setOpen((v) => {
      const next = !v;
      if (next && !loadedOnceRef.current) fetchRecent();
      return next;
    });
  }

  async function markAllRead() {
    if (markingAll) return;
    setMarkingAll(true);
    try {
      await fetch("/api/notifications/read-all", { method: "PATCH" });
      setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
      setUnreadCount(0);
    } catch {
      // Best effort — badge just stays as-is until the next load.
    } finally {
      setMarkingAll(false);
    }
  }

  async function markRead(id: string) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
    } catch {
      // Best effort.
    }
  }

  // Supabase Realtime subscription — new notification rows for this user.
  useEffect(() => {
    if (!userId) return;
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch {
      return; // Supabase not configured (demo mode).
    }

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` },
        () => {
          setUnreadCount((c) => c + 1);
          if (loadedOnceRef.current) fetchRecent();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  if (!user) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggleOpen}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-foreground/70 hover:border-emerald-300 hover:text-foreground"
        aria-label={t("title")}
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span className="absolute -end-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute end-0 z-20 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
            <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
              <p className="text-sm font-semibold text-foreground">{t("title")}</p>
              <button
                type="button"
                onClick={markAllRead}
                disabled={markingAll || unreadCount === 0}
                className="text-xs font-medium text-emerald-700 hover:text-emerald-800 disabled:opacity-50"
              >
                {t("markAllRead")}
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto">
              {loadingItems ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-foreground/50">
                  <Loader2 size={14} className="animate-spin" />
                  {t("loading")}
                </div>
              ) : items.length === 0 ? (
                <p className="px-3.5 py-8 text-center text-sm text-foreground/50">{t("empty")}</p>
              ) : (
                items.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => markRead(n.id)}
                    className={`flex w-full items-start gap-2.5 px-3.5 py-2.5 text-start text-sm hover:bg-sand-100 ${
                      n.readAt ? "" : "bg-emerald-50/60"
                    }`}
                  >
                    {n.actor.avatarUrl ? (
                      <img src={n.actor.avatarUrl} alt="" className="h-8 w-8 flex-none rounded-full object-cover" />
                    ) : (
                      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                        {(n.actor.fullName || "?").charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-foreground/90">
                        {t(TYPE_KEY[n.type], { name: n.actor.fullName })}
                      </span>
                      <span className="mt-0.5 block text-xs text-foreground/40">
                        {formatRelativeTime(n.createdAt, locale)}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>

            <Link
              href="/dashboard/notifications"
              onClick={() => setOpen(false)}
              className="block border-t border-border px-3.5 py-2.5 text-center text-sm font-medium text-emerald-700 hover:bg-sand-100"
            >
              {t("viewAll")}
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
