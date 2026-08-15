import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";

/**
 * Consistent "nothing here yet" state — used across the new social pages
 * (no connections yet, no posts yet, no notifications yet) and available for
 * existing pages that currently roll their own empty-state copy inline.
 */
export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-background px-6 py-12 text-center">
      <Icon className="text-foreground/30" size={28} />
      <p className="mt-1 text-sm font-semibold text-foreground">{title}</p>
      {description && <p className="max-w-xs text-xs text-foreground/50">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
