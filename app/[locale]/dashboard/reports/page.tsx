"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { downloadTextPdf } from "@/lib/text-pdf";
import {
  Lock,
  Download,
  FileSpreadsheet,
  Send,
  CalendarCheck,
  TrendingUp,
  Building2,
  MapPin,
} from "lucide-react";

type ApplicationStatus = "saved" | "applied" | "interview" | "offer" | "rejected";

type ApplicationRow = {
  id: string;
  status: ApplicationStatus;
  company: string;
  title: string;
  resume_id: string | null;
  created_at: string;
  applied_at: string | null;
};

type ResumeRow = { id: string; title: string };

type JobSearchResult = { company: string; location: string };

const STATUS_ORDER: ApplicationStatus[] = ["saved", "applied", "interview", "offer", "rejected"];
const STATUS_COLORS: Record<ApplicationStatus, string> = {
  saved: "bg-sand-300",
  applied: "bg-sky-400",
  interview: "bg-amber-400",
  offer: "bg-emerald-500",
  rejected: "bg-rose-400",
};

function monthKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function lastNMonths(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short" });
}

export default function ReportsPage() {
  const t = useTranslations("dashboard.reports");

  const [checking, setChecking] = useState(true);
  const [plan, setPlan] = useState<"free" | "pro">("free");
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [resumes, setResumes] = useState<ResumeRow[]>([]);
  const [marketJobs, setMarketJobs] = useState<JobSearchResult[]>([]);
  const [marketQueryLabel, setMarketQueryLabel] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        const uid = data.user?.id;
        if (!uid || cancelled) return;

        const { data: profile } = await supabase
          .from("profiles")
          .select("plan, target_roles, country")
          .eq("id", uid)
          .single();
        if (cancelled) return;
        const isPro = profile?.plan === "pro";
        if (isPro) setPlan("pro");

        const [{ data: appRows }, { data: resumeRows }] = await Promise.all([
          supabase
            .from("applications")
            .select("id, status, company, title, resume_id, created_at, applied_at")
            .eq("user_id", uid)
            .order("created_at", { ascending: true }),
          supabase.from("resumes").select("id, title").eq("user_id", uid),
        ]);
        if (cancelled) return;
        setApplications((appRows ?? []) as ApplicationRow[]);
        setResumes((resumeRows ?? []) as ResumeRow[]);

        // Job market insights only need a lightweight live snapshot, and
        // only matter for Pro users (this whole page is Pro-gated below) —
        // skip the extra network round-trip for free-plan visitors.
        if (isPro) {
          const targetRole = profile?.target_roles?.[0] ?? "";
          const params = new URLSearchParams();
          if (targetRole) params.set("q", targetRole);
          if (profile?.country) params.set("location", profile.country);
          setMarketQueryLabel(targetRole || t("allRoles"));
          const res = await fetch(`/api/jobs/search?${params.toString()}`);
          const json = await res.json();
          if (!cancelled) setMarketJobs((json.jobs ?? []) as JobSearchResult[]);
        }
      } catch {
        // Not logged in / Supabase not configured — stays on the locked view.
      } finally {
        if (!cancelled) setChecking(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const funnel = useMemo(() => {
    const counts: Record<ApplicationStatus, number> = {
      saved: 0,
      applied: 0,
      interview: 0,
      offer: 0,
      rejected: 0,
    };
    for (const a of applications) counts[a.status] = (counts[a.status] ?? 0) + 1;
    return counts;
  }, [applications]);

  const totalApplied = useMemo(
    () => applications.filter((a) => a.status !== "saved").length,
    [applications]
  );
  const totalInterviewOrBetter = funnel.interview + funnel.offer;
  const responseRate = totalApplied > 0 ? Math.round((totalInterviewOrBetter / totalApplied) * 100) : 0;

  const activityByMonth = useMemo(() => {
    const months = lastNMonths(6);
    const counts = new Map(months.map((m) => [m, 0]));
    for (const a of applications) {
      const key = monthKey(a.created_at);
      if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return months.map((m) => ({ month: m, count: counts.get(m) ?? 0 }));
  }, [applications]);
  const maxMonthCount = Math.max(1, ...activityByMonth.map((m) => m.count));

  const resumePerformance = useMemo(() => {
    const byResume = new Map<string, { title: string; total: number; interviewOrBetter: number }>();
    for (const a of applications) {
      if (!a.resume_id || a.status === "saved") continue;
      const title = resumes.find((r) => r.id === a.resume_id)?.title ?? t("unknownResume");
      const entry = byResume.get(a.resume_id) ?? { title, total: 0, interviewOrBetter: 0 };
      entry.total += 1;
      if (a.status === "interview" || a.status === "offer") entry.interviewOrBetter += 1;
      byResume.set(a.resume_id, entry);
    }
    return Array.from(byResume.values()).sort((a, b) => b.total - a.total);
  }, [applications, resumes, t]);

  const marketInsights = useMemo(() => {
    const byCompany = new Map<string, number>();
    const byLocation = new Map<string, number>();
    for (const j of marketJobs) {
      if (j.company) byCompany.set(j.company, (byCompany.get(j.company) ?? 0) + 1);
      if (j.location) byLocation.set(j.location, (byLocation.get(j.location) ?? 0) + 1);
    }
    const topCompanies = Array.from(byCompany.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topLocations = Array.from(byLocation.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return { total: marketJobs.length, topCompanies, topLocations };
  }, [marketJobs]);

  function handleExportCsv() {
    const header = ["Company", "Title", "Status", "Resume", "Created", "Applied"];
    const rows = applications.map((a) => [
      a.company,
      a.title,
      a.status,
      resumes.find((r) => r.id === a.resume_id)?.title ?? "",
      a.created_at ? new Date(a.created_at).toLocaleDateString() : "",
      a.applied_at ? new Date(a.applied_at).toLocaleDateString() : "",
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "gulfjobcopilot-applications.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleExportPdf() {
    const paragraphs = [
      t("pdfGeneratedOn", { date: new Date().toLocaleDateString() }),
      "",
      t("pdfFunnelHeading"),
      ...STATUS_ORDER.map((s) => `${t(`status.${s}`)}: ${funnel[s]}`),
      "",
      t("pdfResponseRate", { rate: responseRate }),
      "",
      t("pdfResumeHeading"),
      ...(resumePerformance.length > 0
        ? resumePerformance.map(
            (r) => `${r.title}: ${r.total} ${t("pdfApplications")}, ${r.interviewOrBetter} ${t("pdfInterviewsOrBetter")}`
          )
        : [t("pdfNoData")]),
    ];
    await downloadTextPdf(t("pdfTitle"), paragraphs, "gulfjobcopilot-report.pdf");
  }

  if (checking) {
    return <p className="text-sm text-foreground/50">{t("loading")}</p>;
  }

  if (plan !== "pro") {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-foreground/60">{t("subtitle")}</p>

        <div className="mt-8 flex flex-col items-start gap-4 rounded-2xl border border-gold-400/40 bg-gold-50 p-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold-100 text-gold-600">
            <Lock size={20} />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">{t("lockedTitle")}</h2>
            <p className="mt-1 text-sm text-foreground/70">{t("lockedBody")}</p>
          </div>
          <Link
            href="/pricing"
            className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            {t("upgradeCta")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
          <p className="mt-1 text-sm text-foreground/60">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-sand-100"
          >
            <FileSpreadsheet size={14} />
            {t("exportCsv")}
          </button>
          <button
            onClick={handleExportPdf}
            className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            <Download size={14} />
            {t("exportPdf")}
          </button>
        </div>
      </div>

      {applications.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-border p-4 text-sm text-foreground/50">
          {t("noDataYet")}
        </p>
      ) : (
        <>
          {/* Funnel & activity */}
          <div className="mt-8 grid gap-5 sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-surface p-6">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Send size={20} />
              </div>
              <p className="text-3xl font-extrabold text-foreground">{totalApplied}</p>
              <p className="mt-1 text-sm text-foreground/60">{t("statApplied")}</p>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-6">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <CalendarCheck size={20} />
              </div>
              <p className="text-3xl font-extrabold text-foreground">{totalInterviewOrBetter}</p>
              <p className="mt-1 text-sm text-foreground/60">{t("statInterviewsOffers")}</p>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-6">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                <TrendingUp size={20} />
              </div>
              <p className="text-3xl font-extrabold text-foreground">{responseRate}%</p>
              <p className="mt-1 text-sm text-foreground/60">{t("statResponseRate")}</p>
            </div>
          </div>

          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            {/* Status breakdown */}
            <div className="rounded-2xl border border-border bg-surface p-6">
              <h2 className="text-sm font-semibold text-foreground">{t("funnelHeading")}</h2>
              <div className="mt-4 space-y-2.5">
                {STATUS_ORDER.map((status) => {
                  const count = funnel[status];
                  const max = Math.max(1, ...STATUS_ORDER.map((s) => funnel[s]));
                  const pct = Math.round((count / max) * 100);
                  return (
                    <div key={status} className="flex items-center gap-3">
                      <span className="w-24 flex-none text-xs font-medium text-foreground/70">
                        {t(`status.${status}`)}
                      </span>
                      <div className="h-3 flex-1 overflow-hidden rounded-full bg-sand-100">
                        <div
                          className={`h-full rounded-full ${STATUS_COLORS[status]}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-6 flex-none text-end text-xs font-semibold text-foreground/70">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Activity over time */}
            <div className="rounded-2xl border border-border bg-surface p-6">
              <h2 className="text-sm font-semibold text-foreground">{t("activityHeading")}</h2>
              <div className="mt-6 flex h-32 items-end gap-3">
                {activityByMonth.map(({ month, count }) => (
                  <div key={month} className="flex flex-1 flex-col items-center gap-1.5">
                    <div
                      className="w-full rounded-t-md bg-emerald-500"
                      style={{ height: `${Math.max(4, (count / maxMonthCount) * 100)}%` }}
                      title={`${count}`}
                    />
                    <span className="text-[10px] text-foreground/50">{monthLabel(month)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Resume performance */}
          <div className="mt-6 rounded-2xl border border-border bg-surface p-6">
            <h2 className="text-sm font-semibold text-foreground">{t("resumeHeading")}</h2>
            {resumePerformance.length === 0 ? (
              <p className="mt-3 text-sm text-foreground/50">{t("resumeNoData")}</p>
            ) : (
              <div className="mt-4 divide-y divide-border">
                {resumePerformance.map((r) => (
                  <div key={r.title} className="flex items-center justify-between gap-3 py-3">
                    <p className="truncate text-sm font-medium text-foreground">{r.title}</p>
                    <div className="flex flex-none items-center gap-4 text-xs text-foreground/60">
                      <span>{t("appliedCount", { count: r.total })}</span>
                      <span className="font-semibold text-emerald-700">
                        {t("interviewRate", {
                          rate: r.total > 0 ? Math.round((r.interviewOrBetter / r.total) * 100) : 0,
                        })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Job market insights */}
          <div className="mt-6 rounded-2xl border border-border bg-surface p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">{t("marketHeading")}</h2>
              {marketQueryLabel && (
                <span className="text-xs text-foreground/50">{t("marketFor", { query: marketQueryLabel })}</span>
              )}
            </div>
            {marketInsights.total === 0 ? (
              <p className="mt-3 text-sm text-foreground/50">{t("marketNoData")}</p>
            ) : (
              <div className="mt-4 grid gap-5 sm:grid-cols-2">
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground/60">
                    <Building2 size={13} />
                    {t("topCompanies")}
                  </p>
                  <ul className="space-y-1.5 text-sm text-foreground/80">
                    {marketInsights.topCompanies.map(([company, count]) => (
                      <li key={company} className="flex items-center justify-between">
                        <span className="truncate">{company}</span>
                        <span className="text-xs text-foreground/50">{count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground/60">
                    <MapPin size={13} />
                    {t("topLocations")}
                  </p>
                  <ul className="space-y-1.5 text-sm text-foreground/80">
                    {marketInsights.topLocations.map(([location, count]) => (
                      <li key={location} className="flex items-center justify-between">
                        <span className="truncate">{location}</span>
                        <span className="text-xs text-foreground/50">{count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
