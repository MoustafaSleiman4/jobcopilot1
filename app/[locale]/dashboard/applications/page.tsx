import { useTranslations } from "next-intl";

const demoApplications = [
  { company: "Careem", title: "Growth Marketing Manager", status: "interview" },
  { company: "STC", title: "Product Analyst", status: "applied" },
  { company: "Emirates NBD", title: "Digital Product Manager", status: "saved" },
  { company: "noon", title: "Senior Frontend Engineer", status: "offer" },
  { company: "Aramco Digital", title: "Data Analyst", status: "rejected" },
  { company: "Bank Audi", title: "Relationship Manager", status: "applied" },
  { company: "Talabat", title: "Operations Lead", status: "saved" },
] as const;

const columns = ["saved", "applied", "interview", "offer", "rejected"] as const;

export default function ApplicationsPage() {
  const t = useTranslations("dashboard.applications");

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
      <p className="mt-1 text-sm text-foreground/60">{t("subtitle")}</p>

      <div className="mt-8 grid gap-4 overflow-x-auto sm:grid-cols-3 lg:grid-cols-5">
        {columns.map((col) => (
          <div key={col} className="min-w-[220px] rounded-2xl border border-border bg-surface p-4">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-foreground/50">
              {t(col)}
            </h2>
            <div className="space-y-3">
              {demoApplications
                .filter((a) => a.status === col)
                .map((a) => (
                  <div
                    key={a.company + a.title}
                    className="rounded-xl border border-border bg-background p-3"
                  >
                    <p className="text-sm font-semibold text-foreground">{a.title}</p>
                    <p className="mt-0.5 text-xs text-foreground/60">{a.company}</p>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
