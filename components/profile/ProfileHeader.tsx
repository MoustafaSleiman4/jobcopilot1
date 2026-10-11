"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, X, UserMinus, MessageCircle, MapPin, UserPlus, UserCheck, Pencil } from "lucide-react";
import { Link } from "@/i18n/navigation";
import Card from "@/components/ui/Card";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import DegreeBadge from "@/components/ui/DegreeBadge";
import OpenToWorkBadge from "@/components/ui/OpenToWorkBadge";
import type { ProfileDetail } from "@/lib/social-types";

/**
 * The profile page's header card — avatar, name, degree badge,
 * headline/open-to-work, country, the connections-count link, and every
 * relationship action (Connect/Accept/Decline/Cancel/Remove/Message/Follow).
 * Mirrors PersonDetailModal's action-state machine exactly (same
 * connectionStatus branches) since this is the full-page version of that
 * same relationship UI — kept as a separate component rather than reusing
 * PersonDetailModal itself because this renders inline on a page, not in a
 * popup, and needs the extra Follow button and (self-only) an edit entry
 * point the modal has no room for.
 */
export default function ProfileHeader({
  profile,
  isSelf,
  onChanged,
  onEditClick,
}: {
  profile: ProfileDetail;
  isSelf: boolean;
  onChanged: () => void;
  onEditClick: () => void;
}) {
  const t = useTranslations("connections");
  const [submitting, setSubmitting] = useState<"connect" | "accept" | "decline" | "remove" | "cancel" | "follow" | "unfollow" | null>(null);
  const [isFollowed, setIsFollowed] = useState(profile.isFollowedByViewer);

  async function run(kind: NonNullable<typeof submitting>, fn: () => Promise<boolean>) {
    if (submitting) return;
    setSubmitting(kind);
    try {
      const ok = await fn();
      if (ok) onChanged();
    } finally {
      setSubmitting(null);
    }
  }

  async function handleFollowToggle() {
    const next = !isFollowed;
    setIsFollowed(next);
    await run(next ? "follow" : "unfollow", async () => {
      const res = await fetch(`/api/people/${profile.id}/follow`, { method: next ? "POST" : "DELETE" });
      if (!res.ok) setIsFollowed(!next);
      return res.ok;
    });
  }

  const subtitle = profile.headline || [profile.jobTitle, profile.currentCompany].filter(Boolean).join(" @ ");

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="h-24 bg-emerald-50" />
      <div className="px-6 pb-6">
        <div className="-mt-10 flex items-end justify-between">
          <div className="inline-block rounded-full border-4 border-surface">
            <Avatar avatarUrl={profile.avatarUrl} name={profile.fullName} size="xl" />
          </div>
          {isSelf && (
            <Button variant="secondary" onClick={onEditClick} className="mb-1">
              <Pencil size={14} />
              {t("detail.editProfile")}
            </Button>
          )}
        </div>

        <div className="mt-3 text-start">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-foreground">{profile.fullName}</h1>
            <DegreeBadge degree={profile.connectionDegree} />
            {profile.openToWork && <OpenToWorkBadge />}
          </div>
          {subtitle && <p className="mt-1 text-sm text-foreground/60">{subtitle}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground/50">
            {profile.country && (
              <span className="flex items-center gap-1">
                <MapPin size={12} className="flex-none" />
                {profile.country}
              </span>
            )}
            {!isSelf && profile.isFollowingViewer && <Badge tone="neutral">{t("followsYou")}</Badge>}
          </div>
        </div>

        <Link
          href={{ pathname: "/dashboard/connections" }}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-foreground/60 hover:text-emerald-700"
        >
          {t("detail.connectionsCount", { count: profile.connectionsCount })}
        </Link>

        {!isSelf && profile.mutualConnectionsCount > 0 && (
          <p className="mt-1 text-xs text-foreground/50">{t("detail.mutualConnectionsCount", { count: profile.mutualConnectionsCount })}</p>
        )}

        {!isSelf && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {profile.connectionStatus === "none" && (
              <Button
                variant="primary"
                loading={submitting === "connect"}
                onClick={() =>
                  run("connect", async () => {
                    const res = await fetch("/api/connections/request", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ addresseeId: profile.id }),
                    });
                    return res.ok;
                  })
                }
              >
                {t("connect")}
              </Button>
            )}

            {profile.connectionStatus === "pending_sent" && (
              <>
                <Badge tone="neutral">{t("pending")}</Badge>
                {profile.connectionId && (
                  <Button
                    variant="ghost"
                    loading={submitting === "cancel"}
                    onClick={() =>
                      run("cancel", async () => {
                        const res = await fetch(`/api/connections/${profile.connectionId}`, { method: "DELETE" });
                        return res.ok;
                      })
                    }
                  >
                    <X size={14} />
                    {t("cancel")}
                  </Button>
                )}
              </>
            )}

            {profile.connectionStatus === "pending_received" && profile.connectionId && (
              <>
                <Button
                  variant="primary"
                  loading={submitting === "accept"}
                  onClick={() =>
                    run("accept", async () => {
                      const res = await fetch(`/api/connections/${profile.connectionId}/accept`, { method: "POST" });
                      return res.ok;
                    })
                  }
                >
                  <Check size={14} />
                  {t("accept")}
                </Button>
                <Button
                  variant="secondary"
                  loading={submitting === "decline"}
                  onClick={() =>
                    run("decline", async () => {
                      const res = await fetch(`/api/connections/${profile.connectionId}/decline`, { method: "POST" });
                      return res.ok;
                    })
                  }
                >
                  <X size={14} />
                  {t("decline")}
                </Button>
              </>
            )}

            {profile.connectionStatus === "connected" && (
              <>
                <Badge tone="emerald">{t("connected")}</Badge>
                {profile.connectionId && (
                  <Link
                    href={{ pathname: "/dashboard/messages", query: { connectionId: profile.connectionId } }}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground/80 transition-colors hover:border-emerald-300"
                  >
                    <MessageCircle size={14} />
                    {t("message")}
                  </Link>
                )}
                {profile.connectionId && (
                  <Button
                    variant="ghost"
                    loading={submitting === "remove"}
                    onClick={() => {
                      if (!window.confirm(t("removeConfirm", { name: profile.fullName }))) return;
                      run("remove", async () => {
                        const res = await fetch(`/api/connections/${profile.connectionId}`, { method: "DELETE" });
                        return res.ok;
                      });
                    }}
                  >
                    <UserMinus size={14} />
                    {t("remove")}
                  </Button>
                )}
              </>
            )}

            <Button
              variant="secondary"
              loading={submitting === "follow" || submitting === "unfollow"}
              onClick={handleFollowToggle}
            >
              {isFollowed ? <UserCheck size={14} /> : <UserPlus size={14} />}
              {isFollowed ? t("following") : t("follow")}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
