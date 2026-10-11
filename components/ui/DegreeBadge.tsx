import { useTranslations } from "next-intl";
import type { ConnectionDegree } from "@/lib/social-types";

/**
 * The small "1st" / "2nd" / "3rd" superscript-style badge LinkedIn shows
 * next to a name everywhere a person is listed — search results,
 * suggestions, a post author, the profile page itself. Deliberately a tiny
 * plain span (not a full Badge pill) since it sits directly beside a name
 * at the same font size, not as a separate chip.
 *
 * Renders nothing for degree 0 (you) or 3 (everyone else, which isn't
 * interesting enough to call out on every single row) — only 1st/2nd ever
 * actually render, matching LinkedIn's own restraint here.
 */
export default function DegreeBadge({ degree, className = "" }: { degree: ConnectionDegree | undefined; className?: string }) {
  const t = useTranslations("connections.degree");
  if (degree !== 1 && degree !== 2) return null;

  return (
    <span
      title={degree === 1 ? t("firstFull") : t("secondFull")}
      className={`inline-flex flex-none items-center rounded border border-border px-1 text-[10px] font-semibold leading-4 text-foreground/50 ${className}`}
    >
      {degree === 1 ? t("first") : t("second")}
    </span>
  );
}
