"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type Direction = "up" | "left" | "right" | "none";

// Bigger travel distance + a starting scale-down (instead of a plain fade)
// so the reveal itself reads as a clear, deliberate motion rather than a
// faint opacity crossfade — this is the "more animated" pass after the
// first version was reported as too subtle to notice.
const HIDDEN_TRANSFORM: Record<Direction, string> = {
  up: "translate-y-14 scale-95",
  left: "-translate-x-14 scale-95",
  right: "translate-x-14 scale-95",
  none: "scale-90",
};

/**
 * Fades/slides children into place the first time they scroll into view.
 * Client-only (needs IntersectionObserver) — everything that renders a
 * <ScrollReveal> stays a plain server component otherwise, this is just a
 * thin client wrapper around its children.
 *
 * Deliberately plain CSS transitions + IntersectionObserver rather than an
 * animation library (Framer Motion, GSAP, etc.) — this is the only motion
 * primitive the home page needs, so pulling in a whole dependency for it
 * would add bundle weight for no real benefit. Fires once per element
 * (observer disconnects after the first intersection) so scrolling back up
 * and down doesn't replay the animation. Above-the-fold content is already
 * in the viewport at mount, so it plays immediately as a "reveal on load"
 * — same code path, no special-casing needed.
 */
export default function ScrollReveal({
  children,
  className = "",
  delay = 0,
  direction = "up",
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  direction?: Direction;
  as?: "div" | "span";
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Lazy initializer (runs once, during render) rather than an effect —
  // respects users who've asked their OS/browser to minimize motion by
  // starting already-visible, so there's no animation to skip in the first
  // place. Calling setState synchronously inside an effect body for this
  // same check would trigger a cascading-render lint error; reading
  // matchMedia here avoids that entirely.
  const [visible, setVisible] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    if (visible) return;
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -60px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  const Comp = Tag as "div";

  return (
    <Comp
      ref={ref}
      className={`transition-all duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
        visible
          ? "translate-x-0 translate-y-0 scale-100 opacity-100"
          : `opacity-0 ${HIDDEN_TRANSFORM[direction]}`
      } ${className}`}
      style={{ transitionDelay: visible ? `${delay}ms` : "0ms" }}
    >
      {children}
    </Comp>
  );
}
