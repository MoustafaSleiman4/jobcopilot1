"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, X, UserMinus } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
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
}: {
  person: PersonResult;
  connectionId?: string;
  onConnect?: (personId: string) => void | Promise<void>;
  onAccept?: (connectionId: string) => void | Promise<void>;
  onDecline?: (connectionId: string) => void | Promise<void>;
  onRemove?: (connectionId: string) => void | Promise<void>;
}) {
  const t = useTranslations("connections");
  const [submitting, setSubmitting] = useState<"connect" | "accept" | "decline" | "remove" | null>(null);

  async function run(kind: "connect" | "accept" | "decline" | "remove", fn?: () => void | Promise<void>) {
    if (!fn || submitting) return;
    setSubmitting(kind);
    try {
      await fn();
    } finally {
      setSubmitting(null);
    }
  }

  const subtitle = [person.jobTitle, person.currentCompany].filter(Boolean).join(" @ ");

  return (
    <Card className="flex items-center gap-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {person.avatarUrl ? (
          <img src={person.avatarUrl} alt="" className="h-12 w-12 flex-none rounded-full object-cover" />
        ) : (
          <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-emerald-100 text-base font-bold text-emerald-700">
            {(person.fullName || "?").charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 text-start">
          <p className="truncate text-sm font-semibold text-foreground">{person.fullName}</p>
          {subtitle && <p className="truncate text-xs text-foreground/50">{subtitle}</p>}
        </div>
      </div>

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

        {person.connectionStatus === "pending_sent" && <Badge tone="neutral">{t("pending")}</Badge>}

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
            {connectionId && onRemove && (
              <Button
                variant="ghost"
                loading={submitting === "remove"}
                onClick={() => run("remove", () => onRemove?.(connectionId))}
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
  );
}
