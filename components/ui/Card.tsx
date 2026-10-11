import { HTMLAttributes } from "react";

/**
 * The one card shell for the dashboard app. Every existing dashboard page
 * hand-rolled the same "rounded-2xl border border-border bg-surface p-5"
 * className independently (9+ call sites before this component existed) —
 * centralizing it here means the next visual tweak (radius, shadow, padding)
 * is a one-file change instead of a grep-and-replace across the app.
 *
 * `padded={false}` opts out of the default padding for cards that manage
 * their own internal spacing (e.g. a card with a full-bleed header strip).
 *
 * `hover-lift` (app/globals.css) gives every card the same subtle
 * translateY(-4px) + shadow lift on hover — defined once there so this
 * component and components/PricingCards.tsx's two plan cards (which don't
 * go through this shell) stay visually consistent with each other.
 */
export default function Card({
  className = "",
  padded = true,
  ...props
}: HTMLAttributes<HTMLDivElement> & { padded?: boolean }) {
  return (
    <div
      className={`hover-lift rounded-2xl border border-border bg-surface ${padded ? "p-5" : ""} ${className}`}
      {...props}
    />
  );
}
