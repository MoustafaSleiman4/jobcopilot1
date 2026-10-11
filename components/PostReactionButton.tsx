"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { REACTION_META, REACTION_TYPES } from "@/lib/reactions";
import type { ReactionType } from "@/lib/social-types";

const HOVER_OPEN_DELAY_MS = 350;
const HOVER_CLOSE_DELAY_MS = 250;

/**
 * The reaction control at the bottom of a post — a plain button that
 * toggles the viewer's reaction on/off with a single click/tap (defaulting
 * to "like", matching the old boolean-like behavior so nothing regresses
 * for a quick tap), PLUS a hover-triggered picker row (desktop only, via
 * `pointer: fine`) offering all six reaction types, same interaction model
 * as the now-standard "hold to react" button on every major professional
 * network. The currently-active reaction (if any) drives the button's own
 * icon/color/label, not a generic heart.
 */
export default function PostReactionButton({
  current,
  onPick,
  onClear,
}: {
  current: ReactionType | null;
  onPick: (type: ReactionType) => void;
  onClear: () => void;
}) {
  const t = useTranslations("posts");
  const [pickerOpen, setPickerOpen] = useState(false);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (openTimer.current) clearTimeout(openTimer.current);
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  function scheduleOpen() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = setTimeout(() => setPickerOpen(true), HOVER_OPEN_DELAY_MS);
  }
  function scheduleClose() {
    if (openTimer.current) clearTimeout(openTimer.current);
    closeTimer.current = setTimeout(() => setPickerOpen(false), HOVER_CLOSE_DELAY_MS);
  }

  const meta = current ? REACTION_META[current] : REACTION_META.like;
  const Icon = meta.icon;

  return (
    <div className="relative" onMouseEnter={scheduleOpen} onMouseLeave={scheduleClose}>
      {pickerOpen && (
        <div
          role="menu"
          className="absolute bottom-full start-0 z-20 mb-1 flex items-center gap-1 rounded-full border border-border bg-surface p-1.5 shadow-lg"
        >
          {REACTION_TYPES.map((type) => {
            const ReactionIcon = REACTION_META[type].icon;
            return (
              <button
                key={type}
                type="button"
                role="menuitem"
                title={t(REACTION_META[type].i18nKey)}
                onClick={() => {
                  onPick(type);
                  setPickerOpen(false);
                }}
                className={`flex h-9 w-9 flex-none items-center justify-center rounded-full transition-transform hover:scale-125 ${REACTION_META[type].colorClass} hover:bg-sand-100`}
              >
                <ReactionIcon size={18} fill="currentColor" strokeWidth={1.5} />
              </button>
            );
          })}
        </div>
      )}
      <button
        type="button"
        onClick={() => (current ? onClear() : onPick("like"))}
        className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${current ? meta.colorClass : "text-foreground/60 hover:text-foreground"}`}
      >
        <Icon size={16} fill={current ? "currentColor" : "none"} />
        {current ? t(meta.i18nKey) : t("like")}
      </button>
    </div>
  );
}
