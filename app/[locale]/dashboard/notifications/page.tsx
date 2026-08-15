"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Bell, Loader2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";
import { formatRelativeTime } from "@/lib/socialFormat";
import { notificationHref } from "@/lib/notificationLink";
import type { NotificationItem, NotificationType } from "@/lib/social-types";

const TYPE_KEY: Record<NotificationType, string> = {
  connection_request: "typeConnectionRequest",
  connection_accepted: "typeConnectionAccepted",
  post_reaction: "typePostReaction",
  post_comment: "typePostComment",
  comment_reply: "typeCommentReply",
  message: "typeMessage",
};

export default function NotificationsPage() {
  const t = useTranslations("notifications");
  const locale = useLocale();

  const [items, setItems] = useState<NotificationItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  async function load(cursorParam?: string | null) {
    const params = new URLSearchParams();
    if (cursorParam) params.set("cursor", cursorParam);
    const res = await fetch(`/api/notifications?${params.toString()}`);
    const data = await res.json();
    return {
      items: (data.items ?? []) as NotificationItem[],
      nextCursor: (data.nextCursor ?? null) as string | null,
    };
  }

  useEffect(() => {
    setLoading(true);
    load().then(({ items: newItems, nextCursor }) => {
      setItems(newItems);
      setCursor(nextCursor);
      setLoading(false);
    });
  }, []);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    const { items: newItems, nextCursor } = await load(cursor);
    setItems((prev) => [...prev, ...newItems]);
    setCursor(nextCursor);
    setLoadingMore(false);
  }

  async function markAllRead() {
    if (markingAll) return;
    setMarkingAll(true);
    try {
      await fetch("/api/notifications/read-all", { method: "PATCH" });
      setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    } finally {
      setMarkingAll(false);
    }
  }

  async function markRead(id: string) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n)));
    fetch(`/api/notifications/${id}/read`, { method: "PATCH" }).catch(() => {});
  }

  const hasUnread = items.some((n) => !n.readAt);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <Bell size={20} />
          </div>
          <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
        </div>
        <Button variant="secondary" loading={markingAll} disabled={!hasUnread} onClick={markAllRead}>
          {t("markAllRead")}
        </Button>
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-foreground/50">
            <Loader2 size={16} className="animate-spin" />
            {t("loading")}
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={Bell} title={t("empty")} />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            {items.map((n) => {
              const href = notificationHref(n);
              const content = (
                <>
                  {n.actor.avatarUrl ? (
                    <img src={n.actor.avatarUrl} alt="" className="h-10 w-10 flex-none rounded-full object-cover" />
                  ) : (
                    <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
                      {(n.actor.fullName || "?").charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-foreground/90">{t(TYPE_KEY[n.type], { name: n.actor.fullName })}</span>
                    <span className="mt-0.5 block text-xs text-foreground/40">{formatRelativeTime(n.createdAt, locale)}</span>
                  </span>
                </>
              );
              const rowClassName = `flex w-full items-start gap-3 border-b border-border px-4 py-3.5 text-start last:border-0 hover:bg-sand-100 ${
                n.readAt ? "" : "bg-emerald-50/60"
              }`;
              return href ? (
                <Link key={n.id} href={href} onClick={() => markRead(n.id)} className={rowClassName}>
                  {content}
                </Link>
              ) : (
                <button key={n.id} type="button" onClick={() => markRead(n.id)} className={rowClassName}>
                  {content}
                </button>
              );
            })}
          </div>
        )}

        {cursor && !loading && (
          <div className="pt-4 text-center">
            <Button variant="secondary" loading={loadingMore} onClick={loadMore}>
              {t("loadMore")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
