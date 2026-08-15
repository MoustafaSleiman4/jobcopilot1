import { ReactNode } from "react";

// A handful of fixed, meaningful tones rather than an open palette — keeps
// every badge in the app legible and consistent instead of each call site
// picking its own color. "gold" is intentionally the rarest of these (Pro
// plan, standout highlights only) per the dashboard's move away from gold as
// a decorative color — see app/globals.css's .dashboard-scope comment.
const TONE_CLASSES = {
  neutral: "bg-sand-100 text-foreground/60",
  emerald: "bg-emerald-50 text-emerald-700",
  gold: "bg-gold-100 text-gold-600",
  red: "bg-red-50 text-red-600",
} as const;

export type BadgeTone = keyof typeof TONE_CLASSES;

export default function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${TONE_CLASSES[tone]}`}>
      {children}
    </span>
  );
}
