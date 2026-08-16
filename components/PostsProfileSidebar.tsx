"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Users, MapPin } from "lucide-react";
import { Link } from "@/i18n/navigation";
import Card from "@/components/ui/Card";
import Avatar from "@/components/ui/Avatar";
import { useAuthUser } from "@/lib/useAuthUser";
import type { PersonDetail } from "@/lib/social-types";

/**
 * Left rail on the Posts page — the LinkedIn-style "this is you" mini
 * profile card that anchors the 3-column feed layout. Reuses GET
 * /api/people/[id] (the same profile-detail endpoint PersonDetailModal
 * calls) against the viewer's own id, since it already returns exactly the
 * fields this card needs (avatar, headline, connections count) with no new
 * endpoint required.
 *
 * Sticky-positioned by the caller (app/[locale]/dashboard/posts/page.tsx),
 * not here — this component only owns its own content.
 */
export default function PostsProfileSidebar() {
  const t = useTranslations("posts");
  const tc = useTranslations("connections");
  const { user } = useAuthUser();
  const [detail, setDetail] = useState<PersonDetail | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetch(`/api/people/${user.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setDetail(data as PersonDetail);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user) return null;

  const headline = detail ? [detail.jobTitle, detail.currentCompany].filter(Boolean).join(" @ ") : "";

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="h-12 bg-emerald-50" />
      <div className="px-4 pb-4">
        <div className="-mt-6 inline-block rounded-full border-4 border-surface">
          <Avatar avatarUrl={detail?.avatarUrl ?? null} name={detail?.fullName ?? user.fullName ?? user.email ?? "?"} size="lg" />
        </div>
        <p className="mt-2 truncate text-sm font-bold text-foreground">{detail?.fullName ?? user.fullName ?? user.email}</p>
        {headline && <p className="truncate text-xs text-foreground/50">{headline}</p>}
        {detail?.country && (
          <p className="mt-1 flex items-center gap-1 text-xs text-foreground/40">
            <MapPin size={11} className="flex-none" />
            {detail.country}
          </p>
        )}

        <Link
          href="/dashboard/connections"
          className="mt-3 flex items-center gap-1.5 border-t border-border pt-3 text-xs font-semibold text-foreground/70 hover:text-emerald-700"
        >
          <Users size={13} className="flex-none text-foreground/40" />
          {detail ? tc("detail.connectionsCount", { count: detail.connectionsCount }) : t("sidebarViewNetwork")}
        </Link>
      </div>
    </Card>
  );
}
