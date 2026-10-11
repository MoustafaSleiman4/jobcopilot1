import { ThumbsUp, PartyPopper, HeartHandshake, Heart, Lightbulb, HelpCircle, type LucideIcon } from "lucide-react";
import type { ReactionType } from "@/lib/social-types";

/**
 * Single source of truth for the six reaction types — icon, color, and the
 * i18n key under `posts.reactions` for its label — shared between
 * ReactionPicker (the hover popup) and PostCard (the pressed-state button +
 * the reaction-breakdown summary). Order here is also DISPLAY order
 * everywhere a list of reactions is rendered.
 */
export const REACTION_TYPES: ReactionType[] = ["like", "celebrate", "support", "love", "insightful", "curious"];

export const REACTION_META: Record<ReactionType, { icon: LucideIcon; colorClass: string; i18nKey: string }> = {
  like: { icon: ThumbsUp, colorClass: "text-emerald-600", i18nKey: "reactions.like" },
  celebrate: { icon: PartyPopper, colorClass: "text-gold-600", i18nKey: "reactions.celebrate" },
  support: { icon: HeartHandshake, colorClass: "text-emerald-700", i18nKey: "reactions.support" },
  love: { icon: Heart, colorClass: "text-red-600", i18nKey: "reactions.love" },
  insightful: { icon: Lightbulb, colorClass: "text-gold-500", i18nKey: "reactions.insightful" },
  curious: { icon: HelpCircle, colorClass: "text-emerald-500", i18nKey: "reactions.curious" },
};

/** The single most-used reaction in a breakdown, for a compact "top reaction" icon — null if there are none. */
export function topReactionType(breakdown: Partial<Record<ReactionType, number>>): ReactionType | null {
  let best: ReactionType | null = null;
  let bestCount = 0;
  for (const type of REACTION_TYPES) {
    const count = breakdown[type] ?? 0;
    if (count > bestCount) {
      best = type;
      bestCount = count;
    }
  }
  return best;
}
