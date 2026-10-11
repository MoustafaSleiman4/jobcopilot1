import { useTranslations } from "next-intl";
import { Briefcase } from "lucide-react";
import Badge from "@/components/ui/Badge";

/** LinkedIn's "Open to work" banner, as a small badge — profile-owner-controlled (profiles.open_to_work). */
export default function OpenToWorkBadge({ className = "" }: { className?: string }) {
  const t = useTranslations("connections");
  return (
    <span className={className}>
      <Badge tone="emerald">
        <span className="flex items-center gap-1">
          <Briefcase size={11} className="flex-none" />
          {t("openToWork")}
        </span>
      </Badge>
    </span>
  );
}
