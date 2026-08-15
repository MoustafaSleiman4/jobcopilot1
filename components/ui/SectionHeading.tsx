import { ReactNode } from "react";

/**
 * Standardized section label used inside a Card — matches the
 * uppercase/tracked/gold-600 heading style already used ad-hoc across
 * resume/reports/etc (e.g. "CONTACT", "SUMMARY"), just centralized so every
 * section header in the app has the exact same weight/spacing/color instead
 * of each page redeclaring the same className string with tiny drifts.
 */
export default function SectionHeading({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-xs font-bold uppercase tracking-wide text-gold-600">{children}</h3>
      {action}
    </div>
  );
}
