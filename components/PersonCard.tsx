"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, X, UserMinus, MessageCircle, Mail, Phone, MapPin } from "lucide-react";
import { Link } from "@/i18n/navigation";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Avatar from "@/components/ui/Avatar";
import PersonDetailModal from "@/components/PersonDetailModal";
import type { PersonResult } from "@/lib/social-types";

/**
 * Reusable person row used across Find People search results, "people you
 * may know" suggestions, and the My Connections / Requests lists. The
 * action(s) shown on the end follow `connectionStatus` directly — callers
 * don't need to branch on it themselves, they just wire up whichever
 * callbacks are relevant to the list they're rendering.
 *
 * `connectionId` is required to actually accept/decline/remove (those API
 * routes are keyed by connection id, not person id) — it's available from
 * GET /api/connections and GET /api/connections/requests, but NOT from
 * GET /api/people/search or /suggestions. If a "pending_received" person
 * shows up in a context without a connectionId (e.g. they appear in a
 * search result), we show a plain badge instead of unusable buttons rather
 * than silently failing on click.
 */
export default function PersonCard({
  person,
  connectionId,
  onConnect,
  onAccept,
  onDecline,
  onRemove,
  onCancel,
  onChanged,
}: {
  person: PersonResult;
  connectionId?: string;
  onConnect?: (personId: string) => void | Promise<void>;
  onAccept?: (connectionId: string) => void | Promise<void>;
  onDecline?: (connectionId: string) => void | Promise<void>;
  onRemove?: (connectionId: string) => void | Promise<void>;
  // Withdraw a request the viewer sent — only meaningful for
  // connectionStatus "pending_sent" (the Pending tab), distinct from
  // onDecline (which is the addressee rejecting a request sent TO them).
  onCancel?: (connectionId: string) => void | Promise<void>;
  // Fired when an action taken from the profile detail modal (opened by
  // clicking the row) changes this person's connection state — e.g.
  // accepting from inside the modal, not from this card's own buttons.
  // Callers pass whatever "refresh this list" function they already have;
  // this card's own button handlers don't need it, they already update the
  // parent's state directly via onAccept/onDecline/etc.
  onChanged?: () => void;
}) {
  const t = useTranslations("connections");
  const [submitting, setSubmitting] = useState<"connect" | "accept" | "decline" | "remove" | "cancel" | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  async function run(kind: "connect" | "accept" | "decline" | "remove" | "cancel", fn?: () => void | Promise<void>) {
    if (!fn || submitting) return;
    setSubmitting(kind);
    try {
      await fn();
    } finally {
      setSubmitting(null);
    }
  }

  const subtitle = [person.jobTitle, person.currentCompany].filter(Boolean).join(" @ ");
  // email/phone arrive here already gated server-side by visibleContact()
  // (lib/contactVisibility.ts) — non-null only when the profile owner has
  // opted show_email/show_phone on, or the viewer IS that profile. Safe to
  // render unconditionally whenever present: this is the actual point of
  // that toggle — surfacing contact info to connections, not just storing
  // it unused in the API response.
  const hasContact = Boolean(person.email || person.phone);
  // Unlike email/phone, country isn't gated by visibleContact() — it's not
  // privacy-sensitive the way direct contact info is, so it's always shown
  // when the profile has one set.
  const hasMeta = hasContact || Boolean(person.country);

  return (
    <>
    <Card className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => setDetailOpen(true)}
        className="flex min-w-0 flex-1 items-center gap-3 text-start"
      >
        <Avatar avatarUrl={person.avatarUrl} name={person.fullName} size="lg" isOnline={person.isOnline} />
        <div className="min-w-0 text-start">
          <p className="truncate text-sm font-semibold text-foreground">{person.fullName}</p>
          {subtitle && <p className="truncate text-xs text-foreground/50">{subtitle}</p>}
          {hasMeta && (
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
              {person.country && (
                <span className="flex items-center gap-1 text-[11px] text-foreground/50">
                  <MapPin size={11} className="flex-none" />
                  {person.country}
                </span>
              )}
              {person.email && (
                <span className="flex min-w-0 items-center gap-1 truncate text-[11px] text-foreground/50">
                  <Mail size={11} className="flex-none" />
                  <span className="truncate">{person.email}</span>
                </span>
              )}
              {person.phone && (
                <span className="flex items-center gap-1 text-[11px] text-foreground/50">
                  <Phone size={11} className="flex-none" />
                  {person.phone}
                </span>
              )}
            </div>
          )}
        </div>
      </button>

      <div className="flex flex-none items-center gap-2">
        {person.connectionStatus === "none" && (
          <Button
            variant="primary"
            loading={submitting === "connect"}
            onClick={() => run("connect", () => onConnect?.(person.id))}
          >
            {t("connect")}
          </Button>
        )}

        {person.connectionStatus === "pending_sent" && (
          <>
            <Badge tone="neutral">{t("pending")}</Badge>
            {connectionId && onCancel && (
              <Button
                variant="ghost"
                loading={submitting === "cancel"}
                onClick={() => run("cancel", () => onCancel?.(connectionId))}
                aria-label={t("cancel")}
                title={t("cancel")}
              >
                <X size={14} />
              </Button>
            )}
          </>
        )}

        {person.connectionStatus === "pending_received" &&
          (connectionId ? (
            <>
              <Button
                variant="primary"
                loading={submitting === "accept"}
                onClick={() => run("accept", () => onAccept?.(connectionId))}
              >
                <Check size={14} />
                {t("accept")}
              </Button>
              <Button
                variant="secondary"
                loading={submitting === "decline"}
                onClick={() => run("decline", () => onDecline?.(connectionId))}
              >
                <X size={14} />
                {t("decline")}
              </Button>
            </>
          ) : (
            <Badge tone="gold">{t("pending")}</Badge>
          ))}

        {person.connectionStatus === "connected" && (
          <>
            <Badge tone="emerald">{t("connected")}</Badge>
            {connectionId && (
              <Link
                href={{ pathname: "/dashboard/messages", query: { connectionId } }}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground/80 transition-colors hover:border-emerald-300"
              >
                <MessageCircle size={14} />
                {t("message")}
              </Link>
            )}
            {connectionId && onRemove && (
              <Button
                variant="ghost"
                loading={submitting === "remove"}
                onClick={() => {
                  // Removing a connection is destructive (they'd need to
                  // send/receive a brand new request to reconnect), so it
                  // gets the same window.confirm() guard already used
                  // elsewhere in the app for destructive actions (see
                  // ResumeBuilderForm.tsx's delete-resume confirm and
                  // PostCard.tsx's delete-post confirm) rather than firing
                  // on a single accidental click.
                  if (!window.confirm(t("removeConfirm", { name: person.fullName }))) return;
                  run("remove", () => onRemove?.(connectionId));
                }}
                aria-label={t("remove")}
                title={t("remove")}
              >
                <UserMinus size={14} />
              </Button>
            )}
          </>
        )}
      </div>
    </Card>
    {detailOpen && (
      <PersonDetailModal
        personId={person.id}
        onClose={() => setDetailOpen(false)}
        onChanged={onChanged}
      />
    )}
    </>
  );
}
