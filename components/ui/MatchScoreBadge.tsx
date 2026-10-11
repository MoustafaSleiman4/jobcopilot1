import type { ReactNode } from "react";

// Color tiers for the ring/pill — emerald for a strong keyword overlap, gold
// for a partial one, neutral for a weak one. Thresholds chosen so the
// "emerald" tier roughly matches what already counts as a good match
// elsewhere in the app (Auto Apply's own matching uses a 40+ score as its
// practical floor — see MIN_MATCH_SCORE-style filtering in
// lib/autoApplyRun.ts) while still leaving a visible "partial match" middle
// tier instead of a binary good/bad split.
type Tone = "emerald" | "gold" | "neutral";

function toneForScore(score: number): Tone {
  if (score >= 70) return "emerald";
  if (score >= 40) return "gold";
  return "neutral";
}

const RING_FILL: Record<Tone, string> = {
  emerald: "var(--emerald-500)",
  gold: "var(--gold-500)",
  neutral: "var(--foreground)",
};

const PILL_CLASSES: Record<Tone, string> = {
  emerald: "bg-emerald-50 text-emerald-700",
  gold: "bg-gold-50 text-gold-600",
  neutral: "bg-sand-100 text-foreground/60",
};

/**
 * "X% match" pill with a small filled ring, color-coded by score. One
 * shared component so every surface that shows the real job-match score —
 * the Job Search results list (app/[locale]/dashboard/jobs/page.tsx) and
 * the Auto Apply queue (app/[locale]/dashboard/auto-apply/page.tsx) — renders
 * it identically instead of each page hand-rolling its own badge markup.
 *
 * The score itself is NOT computed here and is never randomized: it's
 * `scoreJob()` in lib/autoApplyRun.ts, a deterministic keyword-overlap
 * heuristic between the signed-in user's resume (title + skills +
 * experience roles/companies) and the job's title + industry — see that
 * function's own comment for the exact math. This component only renders
 * whatever score it's given.
 */
export default function MatchScoreBadge({
  score,
  children,
  className = "",
}: {
  score: number;
  children: ReactNode;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const tone = toneForScore(clamped);
  const ringDeg = (clamped / 100) * 360;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${PILL_CLASSES[tone]} ${className}`}
    >
      <span
        className="relative inline-flex h-3.5 w-3.5 flex-none rounded-full"
        style={{
          background: `conic-gradient(${RING_FILL[tone]} ${ringDeg}deg, var(--border) ${ringDeg}deg)`,
        }}
        aria-hidden="true"
      >
        <span className="absolute inset-[3px] rounded-full bg-surface" />
      </span>
      {children}
    </span>
  );
}
