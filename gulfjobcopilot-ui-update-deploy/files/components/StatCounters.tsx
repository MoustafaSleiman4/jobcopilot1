"use client";

import { useEffect, useRef, useState } from "react";
import { FileSearch, Send, Users } from "lucide-react";

// Icon components are resolved here, inside this Client Component, by key
// — NOT passed in as a prop value from the Server Component page above.
// React Server Component props have to be serializable crossing the
// server/client boundary, and a component/function reference isn't; passing
// one through silently becomes `undefined` on the client, which is exactly
// what the "Element type is invalid... got undefined" crash further down
// this component's history was.
const ICONS = { jobsTracked: FileSearch, applicationsSent: Send, members: Users } as const;
export type StatKey = keyof typeof ICONS;

type Stat = {
  key: StatKey;
  // The real, current count from lib/homeStats.ts (a live Supabase
  // `count: "exact"` query) — always a real number pulled server-side in
  // app/[locale]/page.tsx, never invented client-side. 0 means "couldn't be
  // loaded" (see getHomeStats()'s null fallback), in which case
  // `approxText` (a short, clearly-approximate string like "10,000+") is
  // shown instead of a counter — deliberately plain static text, not an
  // animated count, so it never *looks* like a live, precise number it
  // isn't.
  value: number;
  approxText: string;
};

/**
 * 2-3 small "count up on scroll into view" stats near the hero. Same
 * IntersectionObserver-fires-once discipline as components/ScrollReveal.tsx
 * (observer disconnects after the first intersection, respects
 * prefers-reduced-motion by jumping straight to the final number) — kept as
 * its own component rather than reusing ScrollReveal directly because this
 * needs to drive a running number, not just a fade/slide transition.
 *
 * SSR-safe by construction: every counter starts its render at 0 on both
 * server and first client paint, and only ever animates upward inside a
 * post-mount effect — never a value computed during render — so there's no
 * hydration mismatch risk.
 */
function AnimatedCount({ target, durationMs = 1400 }: { target: number; durationMs?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplay(target);
      return;
    }

    let frame = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const progress = Math.min(1, (now - start) / durationMs);
          // Ease-out — fast start, gentle settle on the final number rather
          // than a linear tick that feels mechanical.
          const eased = 1 - (1 - progress) * (1 - progress);
          setDisplay(Math.round(eased * target));
          if (progress < 1) {
            frame = requestAnimationFrame(tick);
          }
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.4 }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [target, durationMs]);

  return <span ref={ref}>{display.toLocaleString()}</span>;
}

export default function StatCounters({
  stats,
  labels,
}: {
  stats: Stat[];
  labels: Record<string, string>;
}) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-center gap-6 sm:gap-10">
      {stats.map((stat) => {
        const Icon = ICONS[stat.key];
        const hasRealCount = stat.value > 0;
        return (
          <div key={stat.key} className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <Icon size={16} />
            </span>
            <div className="text-left">
              <p className="text-lg font-extrabold leading-tight text-foreground sm:text-xl">
                {hasRealCount ? (
                  <>
                    <AnimatedCount target={stat.value} />+
                  </>
                ) : (
                  stat.approxText
                )}
              </p>
              <p className="text-[11px] font-medium text-foreground/50 sm:text-xs">{labels[stat.key]}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export type { Stat };
