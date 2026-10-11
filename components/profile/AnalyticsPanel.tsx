"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Eye, Loader2, Search, Heart, MessageCircle, Repeat2 } from "lucide-react";
import Card from "@/components/ui/Card";
import Avatar from "@/components/ui/Avatar";
import { formatRelativeTime } from "@/lib/socialFormat";
import type { ProfileAnalytics } from "@/lib/social-types";

/**
 * Self-only "profile strength" panel — who's viewed your profile, how
 * often you turned up in search, and per-post performance (impressions
 * alongside the already-public reaction/comment/repost counts). Entirely
 * free, same as every other part of this network feature (no Pro gate) —
 * fetches GET /api/profile/analytics itself rather than taking the data as
 * a prop, since it's only ever mounted on demand (the "analytics" tab) and
 * shouldn't slow down loading the rest of the profile page for a visitor
 * who never opens it.
 */
export default function AnalyticsPanel() {
  const t = useTranslations("connections");
  const locale = useLocale();
  const [data, setData] = useState<ProfileAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/profile/analytics")
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) setData(json as ProfileAnalytics);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-foreground/50">
        <Loader2 size={14} className="animate-spin" />
        {t("detail.loadingProfile")}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <div className="flex items-center gap-2 text-foreground/50">
            <Eye size={15} />
            <p className="text-xs font-semibold uppercase tracking-wide">{t("detail.analyticsProfileViews")}</p>
          </div>
          <p className="mt-1 text-2xl font-bold text-foreground">{data.profileViewCount}</p>
          <p className="text-xs text-foreground/50">{t("detail.analyticsLast7Days", { count: data.profileViewCount7d })}</p>
        </Card>
        <Card>
          <div className="flex items-center gap-2 text-foreground/50">
            <Search size={15} />
            <p className="text-xs font-semibold uppercase tracking-wide">{t("detail.analyticsSearchAppearances")}</p>
          </div>
          <p className="mt-1 text-2xl font-bold text-foreground">{data.searchAppearanceCount7d}</p>
          <p className="text-xs text-foreground/50">{t("detail.analyticsLast7DaysPlain")}</p>
        </Card>
      </div>

      <Card>
        <h3 className="text-sm font-bold text-foreground">{t("detail.analyticsRecentViewers")}</h3>
        {data.recentViewers.length === 0 ? (
          <p className="mt-2 text-sm text-foreground/40">{t("detail.analyticsNoViewers")}</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {data.recentViewers.map((row, i) => (
              <li key={i} className="flex items-center gap-2.5">
                {row.viewer ? (
                  <>
                    <Avatar avatarUrl={row.viewer.avatarUrl} name={row.viewer.fullName} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">{row.viewer.fullName}</span>
                  </>
                ) : (
                  <>
                    <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-sand-100 text-foreground/40">
                      <Eye size={14} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground/50">{t("detail.analyticsAnonymousViewer")}</span>
                  </>
                )}
                <span className="flex-none text-xs text-foreground/40">{formatRelativeTime(row.viewedAt, locale)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h3 className="text-sm font-bold text-foreground">{t("detail.analyticsPostPerformance")}</h3>
        {data.posts.length === 0 ? (
          <p className="mt-2 text-sm text-foreground/40">{t("detail.analyticsNoPosts")}</p>
        ) : (
          <ul className="mt-2 space-y-3">
            {data.posts.map((post) => (
              <li key={post.postId} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
                <p className="truncate text-sm text-foreground/80">{post.bodyPreview || t("detail.analyticsEmptyPostBody")}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-foreground/50">
                  <span className="flex items-center gap-1">
                    <Eye size={12} />
                    {t("detail.analyticsImpressions", { count: post.impressionCount })}
                  </span>
                  <span className="flex items-center gap-1">
                    <Heart size={12} />
                    {post.reactionCount}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageCircle size={12} />
                    {post.commentCount}
                  </span>
                  <span className="flex items-center gap-1">
                    <Repeat2 size={12} />
                    {post.repostCount}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
