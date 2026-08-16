"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Users, Link2, Newspaper } from "lucide-react";

type ActivityStats = { members: number; connections: number; posts: number };

/**
 * Homepage "growing community" stat row — the social-network equivalent of
 * JobsShowcase's live stat pills, pulling real aggregate counts from
 * app/api/social/activity (members, accepted connections, posts shared).
 *
 * SSR-safe by the same discipline as JobsShowcase/ScrollReveal: starts
 * hidden (`stats === null`) and only ever changes inside a post-mount
 * effect, so server and first-client-paint output match exactly — no
 * hardcoded guess is shown before the real number is available, and there's
 * nothing here that could trip a hydration mismatch.
 */
export default function SocialActivityStrip() {
  const t = useTranslations("home.social");
  const [stats, setStats] = useState<ActivityStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/social/activity")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Partial<ActivityStats> | null) => {
        if (cancelled || !data) return;
        if (typeof data.members === "number") {
          setStats({
            members: data.members,
            connections: data.connections ?? 0,
            posts: data.posts ?? 0,
          });
        }
      })
      .catch(() => {
        // Live fetch failed — the section above still stands on its own
        // copy, nothing to show here.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!stats) return null;

  const items = [
    { icon: Users, label: t("statsMembers", { count: stats.members }) },
    { icon: Link2, label: t("statsConnections", { count: stats.connections }) },
    { icon: Newspaper, label: t("statsPosts", { count: stats.posts }) },
  ];

  return (
    <div className="mt-8 grid gap-4 sm:grid-cols-3">
      {items.map(({ icon: Icon, label }) => (
        <div
          key={label}
          className="flex items-center gap-3 rounded-2xl border border-border bg-background p-5"
        >
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <Icon size={18} />
          </span>
          <span className="text-sm font-semibold text-foreground">{label}</span>
        </div>
      ))}
    </div>
  );
}
