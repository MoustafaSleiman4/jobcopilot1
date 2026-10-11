import { REACTION_META, REACTION_TYPES } from "@/lib/reactions";
import type { ReactionBreakdown } from "@/lib/social-types";

const MAX_ICONS = 3;

/** The small "👍❤️🎉 24" stack shown next to a post's reaction count — which icons appear depends on which reaction types the post actually has, most-used first. */
export default function ReactionSummary({ breakdown, total }: { breakdown: ReactionBreakdown; total: number }) {
  if (total === 0) return null;

  const topTypes = REACTION_TYPES.filter((type) => (breakdown[type] ?? 0) > 0)
    .sort((a, b) => (breakdown[b] ?? 0) - (breakdown[a] ?? 0))
    .slice(0, MAX_ICONS);

  return (
    <span className="flex items-center gap-1 text-xs text-foreground/40">
      <span className="flex -space-x-1 rtl:space-x-reverse">
        {topTypes.map((type) => {
          const Icon = REACTION_META[type].icon;
          return (
            <span
              key={type}
              className={`flex h-4 w-4 items-center justify-center rounded-full bg-surface ring-1 ring-surface ${REACTION_META[type].colorClass}`}
            >
              <Icon size={10} fill="currentColor" strokeWidth={1.5} />
            </span>
          );
        })}
      </span>
      {total}
    </span>
  );
}
