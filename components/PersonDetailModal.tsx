"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, X, UserMinus, MessageCircle, Mail, Phone, MapPin, Loader2, Users } from "lucide-react";
import { Link } from "@/i18n/navigation";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { useAuthUser } from "@/lib/useAuthUser";
import type { PersonDetail } from "@/lib/social-types";

/**
 * LinkedIn-style "click a person to see their profile" panel. Self-
 * contained on purpose: it fetches GET /api/people/[id] itself and drives
 * its own connect/accept/decline/cancel/remove actions directly against the
 * connections API, rather than depending on props threaded down from
 * whichever list opened it. That's what lets the exact same component be
 * dropped in from three very different contexts — a PersonCard row (which
 * already has a connectionId + callbacks of its own for its list), and a
 * comment author (which has neither) — without those call sites needing to
 * know anything about connection state up front.
 *
 * `onChanged` is a best-effort nudge for callers that maintain a list (e.g.
 * the Received Requests tab wants to drop this row once you accept here) —
 * it fires after any successful action, with no payload; the caller decides
 * whether that means "refetch" or "just ignore, my own button already
 * handles this."
 */
export default function PersonDetailModal({
  personId,
  onClose,
  onChanged,
}: {
  personId: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const t = useTranslations("connections");
  const { user } = useAuthUser();
  const isSelf = user?.id === personId;

  const [detail, setDetail] = useState<PersonDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [submitting, setSubmitting] = useState<"connect" | "accept" | "decline" | "remove" | "cancel" | null>(null);
  const [mutualExpanded, setMutualExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    fetch(`/api/people/${personId}`)
      .then(async (res) => {
        if (res.status === 404) {
          if (!cancelled) setNotFound(true);
          return;
        }
        const data = await res.json();
        if (!cancelled) setDetail(data as PersonDetail);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [personId]);

  // Close on Escape — a modal that traps you with only a small "X" to
  // click out of isn't the "advanced/pro" feel this is going for.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  async function run(kind: "connect" | "accept" | "decline" | "remove" | "cancel", fn: () => Promise<boolean>) {
    if (submitting) return;
    setSubmitting(kind);
    try {
      const ok = await fn();
      if (ok) onChanged?.();
    } finally {
      setSubmitting(null);
    }
  }

  async function handleConnect() {
    await run("connect", async () => {
      const res = await fetch("/api/connections/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresseeId: personId }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      setDetail((prev) => (prev ? { ...prev, connectionStatus: "pending_sent", connectionId: data.connectionId ?? prev.connectionId } : prev));
      return true;
    });
  }

  async function handleAccept() {
    if (!detail?.connectionId) return;
    const connectionId = detail.connectionId;
    await run("accept", async () => {
      const res = await fetch(`/api/connections/${connectionId}/accept`, { method: "POST" });
      if (!res.ok) return false;
      setDetail((prev) => (prev ? { ...prev, connectionStatus: "connected" } : prev));
      return true;
    });
  }

  async function handleDecline() {
    if (!detail?.connectionId) return;
    const connectionId = detail.connectionId;
    await run("decline", async () => {
      const res = await fetch(`/api/connections/${connectionId}/decline`, { method: "POST" });
      if (!res.ok) return false;
      setDetail((prev) => (prev ? { ...prev, connectionStatus: "none", connectionId: null } : prev));
      return true;
    });
  }

  async function handleCancel() {
    if (!detail?.connectionId) return;
    const connectionId = detail.connectionId;
    await run("cancel", async () => {
      const res = await fetch(`/api/connections/${connectionId}`, { method: "DELETE" });
      if (!res.ok) return false;
      setDetail((prev) => (prev ? { ...prev, connectionStatus: "none", connectionId: null } : prev));
      return true;
    });
  }

  async function handleRemove() {
    if (!detail?.connectionId) return;
    // Same destructive-action guard as PersonCard's remove button — see the
    // comment there for why this uses window.confirm() rather than a
    // second custom dialog.
    if (!window.confirm(t("removeConfirm", { name: detail.fullName }))) return;
    const connectionId = detail.connectionId;
    await run("remove", async () => {
      const res = await fetch(`/api/connections/${connectionId}`, { method: "DELETE" });
      if (!res.ok) return false;
      setDetail((prev) => (prev ? { ...prev, connectionStatus: "none", connectionId: null } : prev));
      return true;
    });
  }

  const subtitle = detail ? [detail.jobTitle, detail.currentCompany].filter(Boolean).join(" @ ") : "";
  const hasContact = Boolean(detail?.email || detail?.phone);
  const previewAvatars = detail?.mutualConnections.slice(0, 5) ?? [];
  const extraMutualCount = detail ? Math.max(0, detail.mutualConnectionsCount - detail.mutualConnections.length) : 0;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div
          role="dialog"
          aria-modal="true"
          className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-surface shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative">
            {/* A quiet emerald header strip, not a decorative gradient/pattern —
                matches this dashboard's move away from the marketing-site look. */}
            <div className="h-16 rounded-t-2xl bg-emerald-50" />
            <button
              type="button"
              onClick={onClose}
              aria-label={t("detail.close")}
              className="absolute end-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-background/90 text-foreground/60 hover:text-foreground"
            >
              <X size={16} />
            </button>

            {loading ? (
              <div className="flex flex-col items-center gap-2 px-6 pb-8 pt-2 text-sm text-foreground/50">
                <div className="-mt-8 h-16 w-16 rounded-full border-4 border-surface bg-sand-100" />
                <div className="flex items-center gap-2 pt-6">
                  <Loader2 size={14} className="animate-spin" />
                  {t("detail.loadingProfile")}
                </div>
              </div>
            ) : notFound || !detail ? (
              <div className="px-6 pb-8 pt-2 text-center">
                <p className="-mt-8 text-sm text-foreground/50">{t("detail.notFound")}</p>
              </div>
            ) : (
              <div className="px-6 pb-6">
                <div className="-mt-8 inline-block rounded-full border-4 border-surface">
                  <Avatar avatarUrl={detail.avatarUrl} name={detail.fullName} size="xl" />
                </div>

                <div className="mt-3 text-start">
                  <h2 className="text-lg font-bold text-foreground">{detail.fullName}</h2>
                  {subtitle && <p className="mt-0.5 text-sm text-foreground/60">{subtitle}</p>}
                  {detail.country && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-foreground/50">
                      <MapPin size={12} className="flex-none" />
                      {detail.country}
                    </p>
                  )}
                </div>

                {hasContact && (
                  <div className="mt-3 space-y-1.5 rounded-xl bg-background p-3">
                    {detail.email && (
                      <a href={`mailto:${detail.email}`} className="flex items-center gap-2 text-xs text-foreground/70 hover:text-emerald-700">
                        <Mail size={13} className="flex-none" />
                        <span className="truncate">{detail.email}</span>
                      </a>
                    )}
                    {detail.phone && (
                      <a href={`tel:${detail.phone}`} className="flex items-center gap-2 text-xs text-foreground/70 hover:text-emerald-700">
                        <Phone size={13} className="flex-none" />
                        {detail.phone}
                      </a>
                    )}
                  </div>
                )}

                {/* Headline stats row — connection count is the LinkedIn
                    "500+ connections" style public number; mutual connections
                    only shows once there's at least one, since "0 mutual" is
                    just noise on someone you're not close to yet. */}
                <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-foreground/60">
                  <Users size={13} className="flex-none text-foreground/40" />
                  {t("detail.connectionsCount", { count: detail.connectionsCount })}
                </div>

                {!isSelf && detail.mutualConnectionsCount > 0 && (
                  <div className="mt-2 rounded-xl bg-background p-3">
                    <button
                      type="button"
                      onClick={() => setMutualExpanded((v) => !v)}
                      className="flex w-full items-center justify-between gap-2"
                    >
                      <span className="flex items-center gap-2">
                        <span className="flex -space-x-2 rtl:space-x-reverse">
                          {previewAvatars.map((m) => (
                            <Avatar key={m.id} avatarUrl={m.avatarUrl} name={m.fullName} size="sm" className="ring-2 ring-surface" />
                          ))}
                        </span>
                        <span className="text-xs font-semibold text-foreground/80">
                          {t("detail.mutualConnectionsCount", { count: detail.mutualConnectionsCount })}
                        </span>
                      </span>
                      <span className="text-xs font-medium text-emerald-700">
                        {mutualExpanded ? t("detail.hideMutual") : t("detail.showMutual")}
                      </span>
                    </button>

                    {mutualExpanded && (
                      <ul className="mt-3 space-y-2 border-t border-border pt-3">
                        {detail.mutualConnections.map((m) => (
                          <li key={m.id} className="flex items-center gap-2">
                            <Avatar avatarUrl={m.avatarUrl} name={m.fullName} size="sm" />
                            <span className="truncate text-xs text-foreground/80">{m.fullName}</span>
                          </li>
                        ))}
                        {extraMutualCount > 0 && (
                          <li className="text-xs text-foreground/40">{t("detail.andMore", { count: extraMutualCount })}</li>
                        )}
                      </ul>
                    )}
                  </div>
                )}

                {!isSelf && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {detail.connectionStatus === "none" && (
                      <Button variant="primary" loading={submitting === "connect"} onClick={handleConnect}>
                        {t("connect")}
                      </Button>
                    )}

                    {detail.connectionStatus === "pending_sent" && (
                      <>
                        <Badge tone="neutral">{t("pending")}</Badge>
                        <Button variant="ghost" loading={submitting === "cancel"} onClick={handleCancel}>
                          <X size={14} />
                          {t("cancel")}
                        </Button>
                      </>
                    )}

                    {detail.connectionStatus === "pending_received" && (
                      <>
                        <Button variant="primary" loading={submitting === "accept"} onClick={handleAccept}>
                          <Check size={14} />
                          {t("accept")}
                        </Button>
                        <Button variant="secondary" loading={submitting === "decline"} onClick={handleDecline}>
                          <X size={14} />
                          {t("decline")}
                        </Button>
                      </>
                    )}

                    {detail.connectionStatus === "connected" && (
                      <>
                        <Badge tone="emerald">{t("connected")}</Badge>
                        {detail.connectionId && (
                          <Link
                            href={{ pathname: "/dashboard/messages", query: { connectionId: detail.connectionId } }}
                            onClick={onClose}
                            className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground/80 transition-colors hover:border-emerald-300"
                          >
                            <MessageCircle size={14} />
                            {t("message")}
                          </Link>
                        )}
                        <Button variant="ghost" loading={submitting === "remove"} onClick={handleRemove}>
                          <UserMinus size={14} />
                          {t("remove")}
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
