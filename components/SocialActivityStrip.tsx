"use client";

import { useTranslations } from "next-intl";
import { Users, Link2, Newspaper } from "lucide-react";

// Deliberately static, non-numeric copy — this used to fetch real aggregate
// counts from GET /api/social/activity, but at this early stage those
// counts are still tiny (a couple dozen members, a handful of posts) and
// showing "5+ connections made" undercuts the "growing community" framing
// instead of supporting it. General, qualitative points age well regardless
// of where the numbers actually are; a live counter doesn't, until the
// platform has real scale behind it. See app/[locale]/page.tsx's social
// section for where this renders.
const POINTS = [
  { key: "growMembers", icon: Users },
  { key: "growConnect", icon: Link2 },
  { key: "growShare", icon: Newspaper },
] as const;

export default function SocialActivityStrip() {
  const t = useTranslations("home.social");

  return (
    <div className="mt-8 grid gap-4 sm:grid-cols-3">
      {POINTS.map(({ key, icon: Icon }) => (
        <div key={key} className="flex items-center gap-3 rounded-2xl border border-border bg-background p-5">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <Icon size={18} />
          </span>
          <span className="text-sm font-semibold text-foreground">{t(key)}</span>
        </div>
      ))}
    </div>
  );
}
