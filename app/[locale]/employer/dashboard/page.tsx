"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuthUser } from "@/lib/useAuthUser";
import type { CompanyJob } from "@/lib/companyJobs";
import {
  Plus,
  MapPin,
  Briefcase,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  RotateCcw,
  Inbox,
} from "lucide-react";

const STATUS_STYLE: Record<CompanyJob["status"], string> = {
  active: "bg-emerald-50 text-emerald-700",
  closed: "bg-sand-100 text-foreground/60",
  draft: "bg-gold-50 text-gold-700",
};

export default function EmployerPostingsPage() {
  const t = useTranslations("employer.postings");
  const locale = useLocale();
  const dateFormatter = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });
  const { loading: userLoading } = useAuthUser();

  const [jobs, setJobs] = useState<CompanyJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CompanyJob | null>(null);

  useEffect(() => {
    if (userLoading) return;
    let cancelled = false;
    async function load() {
      try {
        const supabase = createClient();
        const { data: authData } = await supabase.auth.getUser();
        const uid = authData.user?.id;
        if (!uid) return;

        const { data: company } = await supabase
          .from("companies")
          .select("id")
          .eq("owner_id", uid)
          .maybeSingle();
        if (cancelled || !company) return;
        setCompanyId(company.id as string);

        const { data: rows } = await supabase
          .from("company_jobs")
          .select("*")
          .eq("company_id", company.id)
          .order("created_at", { ascending: false });
        if (!cancelled) setJobs((rows ?? []) as CompanyJob[]);
      } catch {
        // Supabase not configured — show the empty state below.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [userLoading]);

  async function updateStatus(job: CompanyJob, status: CompanyJob["status"]) {
    setBusyId(job.id);
    const prev = jobs;
    setJobs((cur) => cur.map((j) => (j.id === job.id ? { ...j, status } : j)));
    try {
      const supabase = createClient();
      const { error } = await supabase.from("company_jobs").update({ status }).eq("id", job.id);
      if (error) throw error;
    } catch {
      setJobs(prev);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    setBusyId(target.id);
    const prev = jobs;
    setJobs((cur) => cur.filter((j) => j.id !== target.id));
    try {
      const supabase = createClient();
      const { error } = await supabase.from("company_jobs").delete().eq("id", target.id);
      if (error) throw error;
    } catch {
      setJobs(prev);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
          <p className="mt-1 text-sm text-foreground/60">{t("subtitle")}</p>
        </div>
        {companyId && (
          <Link
            href="/employer/dashboard/jobs/new"
            className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            <Plus size={15} />
            {t("postJob")}
          </Link>
        )}
      </div>

      <div className="mt-6 space-y-3">
        {loading && <p className="text-sm text-foreground/50">{t("loading")}</p>}

        {!loading && jobs.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-surface py-16 text-center">
            <Inbox className="text-foreground/30" size={28} />
            <p className="text-sm font-medium text-foreground/70">{t("emptyTitle")}</p>
            <p className="max-w-sm text-sm text-foreground/50">{t("emptyBody")}</p>
            {companyId && (
              <Link
                href="/employer/dashboard/jobs/new"
                className="mt-2 flex items-center gap-1.5 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                <Plus size={15} />
                {t("postFirstJob")}
              </Link>
            )}
          </div>
        )}

        {!loading &&
          jobs.map((job) => (
            <div
              key={job.id}
              className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-surface p-5 sm:flex-row sm:items-center"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-foreground">{job.title}</h3>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[job.status]}`}>
                    {t(`status.${job.status}`)}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-foreground/60">
                  <span className="flex items-center gap-1.5">
                    <MapPin size={13} /> {job.location}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Briefcase size={13} /> {t(`employmentTypes.${job.employment_type}`)}
                  </span>
                  <span>{dateFormatter.format(new Date(job.created_at))}</span>
                </div>
              </div>

              <div className="flex flex-none flex-wrap items-center gap-2">
                {job.status !== "active" && (
                  <button
                    type="button"
                    onClick={() => updateStatus(job, "active")}
                    disabled={busyId === job.id}
                    title={t("publish")}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground/50 hover:border-emerald-300 hover:text-emerald-600 disabled:opacity-50"
                  >
                    {job.status === "draft" ? <Eye size={15} /> : <RotateCcw size={15} />}
                  </button>
                )}
                {job.status === "active" && (
                  <button
                    type="button"
                    onClick={() => updateStatus(job, "closed")}
                    disabled={busyId === job.id}
                    title={t("close")}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground/50 hover:border-gold-300 hover:text-gold-600 disabled:opacity-50"
                  >
                    <EyeOff size={15} />
                  </button>
                )}
                <Link
                  href={`/employer/dashboard/jobs/${job.id}`}
                  title={t("edit")}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground/50 hover:border-emerald-300 hover:text-emerald-600"
                >
                  <Pencil size={15} />
                </Link>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(job)}
                  disabled={busyId === job.id}
                  title={t("delete")}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground/50 hover:border-red-300 hover:text-red-600 disabled:opacity-50"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteTarget(null)} />
          <div className="relative w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-xl">
            <h2 className="text-lg font-bold text-foreground">{t("deleteConfirmTitle")}</h2>
            <p className="mt-2 text-sm text-foreground/60">
              {t("deleteConfirmBody", { title: deleteTarget.title })}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-full px-4 py-2 text-sm font-semibold text-foreground/70 hover:bg-sand-100"
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                {t("delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
