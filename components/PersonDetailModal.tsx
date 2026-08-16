"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Check,
  X,
  UserMinus,
  MessageCircle,
  Mail,
  Phone,
  MapPin,
  Loader2,
  Users,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { useAuthUser } from "@/lib/useAuthUser";
import type { PersonDetail, PersonConnectionRow } from "@/lib/social-types";

/**
 * A single screen inside the modal. Most of the time this is just "the
 * profile you opened," but clicking the connections-count row pushes a
 * `connections` frame (that person's own network), and clicking a row in
 * THAT list pushes another `profile` frame for whoever you clicked — so the
 * whole "click a connection to see who they're connected to" chain happens
 * inside one modal instance with a back button, rather than closing and
 * reopening a fresh modal per click.
 */
type Frame = { kind: "profile"; id: string } | { kind: "connections"; id: string; name: string };

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

  const [stack, setStack] = useState<Frame[]>([{ kind: "profile", id: personId }]);
  const [mutualExpanded, setMutualExpanded] = useState(false);

  // The modal is always mounted fresh per personId by its callers (see the
  // doc comment above), but guarding this explicitly means the component
  // stays correct even if a future caller starts reusing one instance
  // across different people.
  //
  // IMPORTANT: this must return the SAME array reference when personId
  // already matches the current root frame. Unconditionally calling
  // setStack([...]) here — even with logically identical content — hands
  // React a brand-new object on the very first render, which changes the
  // `frame` reference used below and re-fires the profile-fetch effect
  // before the in-flight request from the first pass can resolve. That
  // effect's cleanup marks the first fetch `cancelled`, while its
  // once-only `loadedProfiles` guard blocks the second pass from ever
  // fetching again — net result, the modal was stuck on "Loading
  // profile…" forever. Returning `prev` unchanged when nothing actually
  // changed avoids the spurious re-render entirely.
  useEffect(() => {
    setStack((prev) =>
      prev.length === 1 && prev[0].kind === "profile" && prev[0].id === personId ? prev : [{ kind: "profile", id: personId }]
    );
    setMutualExpanded(false);
  }, [personId]);

  const frame = stack[stack.length - 1];
  const isSelf = user?.id === frame.id;

  const [detailCache, setDetailCache] = useState<Record<string, PersonDetail>>({});
  const [detailNotFound, setDetailNotFound] = useState<Record<string, boolean>>({});
  const loadedProfiles = useRef<Set<string>>(new Set());

  const [connectionsCache, setConnectionsCache] = useState<
    Record<string, { items: PersonConnectionRow[]; totalCount: number }>
  >({});
  const loadedConnections = useRef<Set<string>>(new Set());

  const [submitting, setSubmitting] = useState<"connect" | "accept" | "decline" | "remove" | "cancel" | null>(null);

  const detail = frame.kind === "profile" ? detailCache[frame.id] : undefined;
  const notFound = frame.kind === "profile" && Boolean(detailNotFound[frame.id]);
  const loading = frame.kind === "profile" && !detail && !notFound;

  // Fetch (once per id) whenever navigation brings a `profile` frame to the
  // top of the stack that hasn't been loaded yet.
  //
  // `loadedProfiles` only tracks "a fetch for this id is currently in
  // flight," and is cleared in `.finally()` — not the moment the fetch
  // starts. That way a stray extra effect run (e.g. from an unrelated
  // re-render) either no-ops against an already-resolved `detailCache`
  // entry, or — worst case — fires one harmless duplicate request, instead
  // of permanently blocking every future fetch for that id the way a
  // fetch-and-forget guard did (see the note on the personId-reset effect
  // above for how that combination produced an unrecoverable "Loading
  // profile…" hang).
  useEffect(() => {
    if (frame.kind !== "profile") return;
    const id = frame.id;
    if (detailCache[id] || detailNotFound[id] || loadedProfiles.current.has(id)) return;
    loadedProfiles.current.add(id);
    let cancelled = false;
    fetch(`/api/people/${id}`)
      .then(async (res) => {
        if (res.status === 404) {
          if (!cancelled) setDetailNotFound((p) => ({ ...p, [id]: true }));
          return;
        }
        const data = (await res.json()) as PersonDetail;
        if (!cancelled) setDetailCache((p) => ({ ...p, [id]: data }));
      })
      .catch(() => {
        if (!cancelled) setDetailNotFound((p) => ({ ...p, [id]: true }));
      })
      .finally(() => {
        loadedProfiles.current.delete(id);
      });
    return () => {
      cancelled = true;
    };
  }, [frame, detailCache, detailNotFound]);

  // Same idea for a `connections` frame — GET /api/people/[id]/connections.
  useEffect(() => {
    if (frame.kind !== "connections") return;
    const id = frame.id;
    if (connectionsCache[id] || loadedConnections.current.has(id)) return;
    loadedConnections.current.add(id);
    let cancelled = false;
    fetch(`/api/people/${id}/connections`)
      .then(async (res) => {
        const data = await res.json();
        if (!cancelled && res.ok) {
          setConnectionsCache((p) => ({
            ...p,
            [id]: { items: (data.items ?? []) as PersonConnectionRow[], totalCount: (data.totalCount ?? 0) as number },
          }));
        }
      })
      .catch(() => {})
      .finally(() => {
        loadedConnections.current.delete(id);
      });
    return () => {
      cancelled = true;
    };
  }, [frame, connectionsCache]);

  // Close on Escape — a modal that traps you with only a small "X" to
  // click out of isn't the "advanced/pro" feel this is going for.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  function updateDetail(id: string, updater: (prev: PersonDetail) => PersonDetail) {
    setDetailCache((p) => (p[id] ? { ...p, [id]: updater(p[id]) } : p));
  }

  function openConnectionsList() {
    if (frame.kind !== "profile" || !detail) return;
    setStack((s) => [...s, { kind: "connections", id: frame.id, name: detail.fullName }]);
  }

  function openProfile(id: string) {
    setStack((s) => [...s, { kind: "profile", id }]);
  }

  function goBack() {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  }

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
    if (frame.kind !== "profile") return;
    const id = frame.id;
    await run("connect", async () => {
      const res = await fetch("/api/connections/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresseeId: id }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      updateDetail(id, (prev) => ({
        ...prev,
        connectionStatus: "pending_sent",
        connectionId: data.connectionId ?? prev.connectionId,
      }));
      return true;
    });
  }

  async function handleAccept() {
    if (frame.kind !== "profile" || !detail?.connectionId) return;
    const id = frame.id;
    const connectionId = detail.connectionId;
    await run("accept", async () => {
      const res = await fetch(`/api/connections/${connectionId}/accept`, { method: "POST" });
      if (!res.ok) return false;
      updateDetail(id, (prev) => ({ ...prev, connectionStatus: "connected" }));
      return true;
    });
  }

  async function handleDecline() {
    if (frame.kind !== "profile" || !detail?.connectionId) return;
    const id = frame.id;
    const connectionId = detail.connectionId;
    await run("decline", async () => {
      const res = await fetch(`/api/connections/${connectionId}/decline`, { method: "POST" });
      if (!res.ok) return false;
      updateDetail(id, (prev) => ({ ...prev, connectionStatus: "none", connectionId: null }));
      return true;
    });
  }

  async function handleCancel() {
    if (frame.kind !== "profile" || !detail?.connectionId) return;
    const id = frame.id;
    const connectionId = detail.connectionId;
    await run("cancel", async () => {
      const res = await fetch(`/api/connections/${connectionId}`, { method: "DELETE" });
      if (!res.ok) return false;
      updateDetail(id, (prev) => ({ ...prev, connectionStatus: "none", connectionId: null }));
      return true;
    });
  }

  async function handleRemove() {
    if (frame.kind !== "profile" || !detail?.connectionId) return;
    // Same destructive-action guard as PersonCard's remove button — see the
    // comment there for why this uses window.confirm() rather than a
    // second custom dialog.
    if (!window.confirm(t("removeConfirm", { name: detail.fullName }))) return;
    const id = frame.id;
    const connectionId = detail.connectionId;
    await run("remove", async () => {
      const res = await fetch(`/api/connections/${connectionId}`, { method: "DELETE" });
      if (!res.ok) return false;
      updateDetail(id, (prev) => ({ ...prev, connectionStatus: "none", connectionId: null }));
      return true;
    });
  }

  const subtitle = detail ? [detail.jobTitle, detail.currentCompany].filter(Boolean).join(" @ ") : "";
  const hasContact = Boolean(detail?.email || detail?.phone);
  const previewAvatars = detail?.mutualConnections.slice(0, 5) ?? [];
  const extraMutualCount = detail ? Math.max(0, detail.mutualConnectionsCount - detail.mutualConnections.length) : 0;

  const connList = frame.kind === "connections" ? connectionsCache[frame.id] : undefined;
  const connLoading = frame.kind === "connections" && !connList;
  // Someone not yet connected to this person (and not viewing their own
  // list) always gets an empty array back from the API — see
  // person_connections()'s self-gating in supabase/person-connections-list.sql.
  // That's indistinguishable from "genuinely zero connections" at the data
  // level, so tell those two cases apart here using the connectionStatus
  // already fetched for the profile this list belongs to.
  const connHidden =
    frame.kind === "connections" && frame.id !== user?.id && detailCache[frame.id]?.connectionStatus !== "connected";

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
            {stack.length > 1 && (
              <button
                type="button"
                onClick={goBack}
                aria-label={t("detail.back")}
                className="absolute start-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-background/90 text-foreground/60 hover:text-foreground"
              >
                <ChevronLeft size={16} className="rtl:hidden" />
                <ChevronRight size={16} className="hidden rtl:block" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={t("detail.close")}
              className="absolute end-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-background/90 text-foreground/60 hover:text-foreground"
            >
              <X size={16} />
            </button>

            {frame.kind === "connections" ? (
              <div className="px-6 pb-6">
                <div className="pt-7 text-start">
                  <h2 className="text-base font-bold text-foreground">
                    {t("detail.connectionsOf", { name: frame.name })}
                  </h2>
                </div>
                <div className="mt-4">
                  {connLoading ? (
                    <div className="flex items-center gap-2 py-6 text-sm text-foreground/50">
                      <Loader2 size={14} className="animate-spin" />
                      {t("detail.loadingProfile")}
                    </div>
                  ) : connList && connList.items.length > 0 ? (
                    <ul className="space-y-1">
                      {connList.items.map((m) => (
                        <li key={m.id}>
                          <button
                            type="button"
                            onClick={() => openProfile(m.id)}
                            className="flex w-full items-center gap-3 rounded-xl p-2 text-start hover:bg-background"
                          >
                            <Avatar avatarUrl={m.avatarUrl} name={m.fullName} size="sm" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-foreground">{m.fullName}</span>
                              {(m.jobTitle || m.currentCompany) && (
                                <span className="block truncate text-xs text-foreground/50">
                                  {[m.jobTitle, m.currentCompany].filter(Boolean).join(" @ ")}
                                </span>
                              )}
                            </span>
                          </button>
                        </li>
                      ))}
                      {connList.totalCount > connList.items.length && (
                        <li className="pt-1 text-center text-xs text-foreground/40">
                          {t("detail.andMore", { count: connList.totalCount - connList.items.length })}
                        </li>
                      )}
                    </ul>
                  ) : connHidden ? (
                    <p className="py-6 text-center text-sm text-foreground/50">{t("detail.connectionsHidden")}</p>
                  ) : (
                    <p className="py-6 text-center text-sm text-foreground/50">{t("detail.noConnections")}</p>
                  )}
                </div>
              </div>
            ) : loading ? (
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
                    "500+ connections" style public number; now clickable to
                    drill into that person's own connections list (gated
                    server-side — see the connHidden comment above), same as
                    tapping a number on a LinkedIn profile opens their network. */}
                <button
                  type="button"
                  onClick={openConnectionsList}
                  className="mt-3 flex w-full items-center justify-between gap-1.5 rounded-lg px-1 py-1 text-xs font-medium text-foreground/60 hover:bg-background"
                >
                  <span className="flex items-center gap-1.5">
                    <Users size={13} className="flex-none text-foreground/40" />
                    {t("detail.connectionsCount", { count: detail.connectionsCount })}
                  </span>
                  <ChevronRight size={14} className="flex-none text-foreground/30 rtl:hidden" />
                  <ChevronLeft size={14} className="hidden flex-none text-foreground/30 rtl:block" />
                </button>

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
                          <li key={m.id}>
                            <button
                              type="button"
                              onClick={() => openProfile(m.id)}
                              className="flex w-full items-center gap-2 rounded-lg p-1 text-start hover:bg-surface"
                            >
                              <Avatar avatarUrl={m.avatarUrl} name={m.fullName} size="sm" />
                              <span className="truncate text-xs text-foreground/80">{m.fullName}</span>
                            </button>
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
