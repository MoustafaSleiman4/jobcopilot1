import { CheckCircle2, Circle } from "lucide-react";

export type ChecklistItem = {
  key: string;
  label: string;
  done: boolean;
};

/**
 * Dashboard "profile strength" ring + checklist. Every `done` flag passed
 * in is computed server-side in app/[locale]/dashboard/page.tsx from real
 * columns (profiles.full_name / profiles.target_roles / profiles.avatar_url
 * and the user's primary resumes row — see that file's loadDashboardData()
 * for exactly which field each checklist item reads) — nothing here is
 * randomized or guessed. Percent is just doneCount / items.length, so the
 * ring and the checklist always agree with each other by construction.
 */
export default function ProfileCompletenessMeter({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle: string;
  items: ChecklistItem[];
}) {
  const done = items.filter((item) => item.done).length;
  const percent = items.length === 0 ? 0 : Math.round((done / items.length) * 100);
  const tone = percent >= 80 ? "emerald" : percent >= 40 ? "gold" : "neutral";
  const ringColor = { emerald: "var(--emerald-500)", gold: "var(--gold-500)", neutral: "var(--border)" }[tone];
  const percentColor = { emerald: "text-emerald-700", gold: "text-gold-600", neutral: "text-foreground/60" }[tone];

  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <div className="flex flex-wrap items-center gap-5">
        <div
          className="relative flex h-16 w-16 flex-none items-center justify-center rounded-full"
          style={{ background: `conic-gradient(${ringColor} ${percent * 3.6}deg, var(--border) 0deg)` }}
          role="img"
          aria-label={`${percent}%`}
        >
          <div className={`flex h-12 w-12 items-center justify-center rounded-full bg-surface text-sm font-bold ${percentColor}`}>
            {percent}%
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-foreground">{title}</h2>
          <p className="mt-0.5 text-xs text-foreground/50">{subtitle}</p>
        </div>
      </div>
      <ul className="mt-4 grid gap-1.5 sm:grid-cols-2">
        {items.map((item) => (
          <li
            key={item.key}
            className={`flex items-center gap-2 text-xs ${item.done ? "text-foreground/45" : "text-foreground/80"}`}
          >
            {item.done ? (
              <CheckCircle2 size={14} className="flex-none text-emerald-600" />
            ) : (
              <Circle size={14} className="flex-none text-foreground/25" />
            )}
            <span className={item.done ? "line-through" : ""}>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
