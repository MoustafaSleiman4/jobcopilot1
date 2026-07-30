import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { FileText, Send, CalendarCheck } from "lucide-react";

export default function DashboardOverviewPage() {
  const t = useTranslations("dashboard.overview");

  const stats = [
    { key: "statResumes", value: 1, icon: FileText },
    { key: "statApplications", value: 12, icon: Send },
    { key: "statInterviews", value: 2, icon: CalendarCheck },
  ] as const;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
          <p className="mt-1 text-sm text-foreground/60">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-2.5">
          <span className="text-sm font-medium text-foreground/70">{t("planFree")}</span>
          <Link
            href="/pricing"
            className="rounded-full bg-gold-400 px-4 py-1.5 text-xs font-bold text-emerald-900 hover:bg-gold-500"
          >
            {t("upgrade")}
          </Link>
        </div>
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-3">
        {stats.map(({ key, value, icon: Icon }) => (
          <div key={key} className="rounded-2xl border border-border bg-surface p-6">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Icon size={20} />
            </div>
            <p className="text-3xl font-extrabold text-foreground">{value}</p>
            <p className="mt-1 text-sm text-foreground/60">{t(key)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
