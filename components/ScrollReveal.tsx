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
  // Always false on both server and the client's first render — a lazy
  // initializer that read matchMedia here (the previous approach) ran
  // during hydration itself, so on a client with the OS's reduced-motion
  // setting on, the very first client render produced different output
  // (already-visible) than the server ever could (which has no window to
  // check). React logs a hydration mismatch for that and, worse, doesn't
  // reliably attach effects/refs on the mismatched subtree — in practice
  // this left the entire homepage rendering blank for anyone with
  // reduced-motion enabled, since every ScrollReveal-wrapped element below
  // the mismatch point silently never got its IntersectionObserver set up.
  // Checking matchMedia inside the mount effect below instead runs strictly
  // after hydration completes, so first paint always matches the server.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // Deliberate one-time synchronous setState here, not a cascading
      // pattern: this is the mount effect syncing from an external system
      // (the OS-level matchMedia preference), which is exactly the
      // "subscribe/sync from an external system" case this lint rule
      // itself carves out — see the comment above `visible`'s declaration
      // for why this can't move into the initializer instead.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisible(true);
      return;
    }

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
  }, []);

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
