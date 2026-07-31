"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import type { StructuredResume } from "@/lib/resume-types";
import type { CertRecommendation, CertLevel, CertPriority } from "@/app/api/resume/recommend-certifications/route";
import {
  Award,
  Sparkles,
  Loader2,
  Lock,
  ExternalLink,
  Plus,
  Check,
  AlertCircle,
  RefreshCw,
  GraduationCap,
  Clock,
} from "lucide-react";

type ResumeContent = { structured?: StructuredResume };
type ResumeOption = { id: string; title: string; structured: StructuredResume };

const PRIORITY_ORDER: Record<CertPriority, number> = { high: 0, medium: 1, low: 2 };

const PRIORITY_STYLE: Record<CertPriority, string> = {
  high: "bg-emerald-50 text-emerald-700 border-emerald-200",
  medium: "bg-sky-50 text-sky-700 border-sky-200",
  low: "bg-sand-100 text-foreground/60 border-border",
};

const LEVEL_STYLE: Record<CertLevel, string> = {
  beginner: "bg-gold-50 text-gold-700",
  intermediate: "bg-sand-100 text-foreground/70",
  advanced: "bg-slate-100 text-slate-700",
};

export default function CertificationsPage() {
  const t = useTranslations("dashboard.certifications");

  const [checking, setChecking] = useState(true);
  const [plan, setPlan] = useState<"free" | "pro">("free");
  const [resumes, setResumes] = useState<ResumeOption[]>([]);
  const [resumeId, setResumeId] = useState<string>("");

  const [loadingRecs, setLoadingRecs] = useState(false);
  const [recommendations, setRecommendations] = useState<CertRecommendation[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [addedNames, setAddedNames] = useState<Set<string>>(new Set());
  const [addingName, setAddingName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        const uid = data.user?.id;
        if (!uid || cancelled) return;

        const { data: profile } = await supabase.from("profiles").select("plan").eq("id", uid).single();
        if (!cancelled && profile?.plan === "pro") setPlan("pro");

        const { data: resumeRows } = await supabase
          .from("resumes")
          .select("id, title, content, is_primary")
          .eq("user_id", uid)
          .order("is_primary", { ascending: false })
          .order("updated_at", { ascending: false });
        if (cancelled) return;

        const options = (resumeRows ?? [])
          .map((row) => {
            const content = (row.content ?? {}) as ResumeContent;
            return content.structured
              ? { id: row.id as string, title: (row.title as string) || t("untitledResume"), structured: content.structured }
              : null;
          })
          .filter((r): r is ResumeOption => r !== null);
        setResumes(options);
        if (options[0]) setResumeId(options[0].id);
      } catch {
        // Not logged in / Supabase not configured — stays on free/locked view.
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

  const selectedResume = resumes.find((r) => r.id === resumeId) ?? null;
  const existingCertNames = useMemo(
    () => new Set((selectedResume?.structured.certifications ?? []).map((c) => c.name.toLowerCase().trim())),
    [selectedResume]
  );

  const sortedRecommendations = useMemo(() => {
    if (!recommendations) return [];
    return [...recommendations].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  }, [recommendations]);

  async function handleGenerate() {
    if (!selectedResume) {
      setErrorMsg(t("noResumeSelected"));
      return;
    }
    setLoadingRecs(true);
    setErrorMsg(null);
    setNote(null);
    try {
      const res = await fetch("/api/resume/recommend-certifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume: selectedResume.structured, targetRole: selectedResume.structured.title }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      setRecommendations(data.recommendations as CertRecommendation[]);
      if (data.note) setNote(data.note as string);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t("generateError"));
    } finally {
      setLoadingRecs(false);
    }
  }

  // Appends the recommendation as a real entry on the selected resume's
  // certifications list (year left blank — the user hasn't earned it yet,
  // this just puts it on their roadmap/resume as "in progress" once they
  // fill that in) and saves immediately, rather than requiring a trip to
  // the CV builder to do it manually.
  async function handleAddToResume(rec: CertRecommendation) {
    if (!selectedResume) return;
    setAddingName(rec.name);
    try {
      const supabase = createClient();
      const nextStructured: StructuredResume = {
        ...selectedResume.structured,
        certifications: [
          ...(selectedResume.structured.certifications ?? []),
          { name: rec.name, issuer: rec.issuer, year: "" },
        ],
      };
      const { error } = await supabase
        .from("resumes")
        .update({ content: { structured: nextStructured } })
        .eq("id", selectedResume.id);
      if (error) throw error;
      setResumes((prev) => prev.map((r) => (r.id === selectedResume.id ? { ...r, structured: nextStructured } : r)));
      setAddedNames((prev) => new Set(prev).add(rec.name));
    } catch {
      setErrorMsg(t("addToResumeError"));
    } finally {
      setAddingName(null);
    }
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
    <div className="max-w-4xl">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
        <GraduationCap className="text-emerald-600" size={26} />
        {t("title")}
      </h1>
      <p className="mt-1 text-sm text-foreground/60">{t("subtitle")}</p>

      {resumes.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-border p-4 text-sm text-foreground/50">
          {t("noResumesYet")}{" "}
          <Link href="/dashboard/resume" className="font-semibold text-emerald-700 hover:text-emerald-800">
            {t("goBuildResume")}
          </Link>
        </p>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-end gap-3">
            <label className="flex flex-1 flex-col gap-1.5 text-sm">
              <span className="font-medium text-foreground/80">{t("resumeLabel")}</span>
              <select
                value={resumeId}
                onChange={(e) => {
                  setResumeId(e.target.value);
                  setRecommendations(null);
                }}
                className="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                {resumes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={handleGenerate}
              disabled={loadingRecs}
              className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {loadingRecs ? (
                <Loader2 className="animate-spin" size={15} />
              ) : recommendations ? (
                <RefreshCw size={15} />
              ) : (
                <Sparkles size={15} />
              )}
              {loadingRecs ? t("analyzing") : recommendations ? t("regenerate") : t("generateCta")}
            </button>
          </div>

          {errorMsg && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 flex-none" size={15} />
              <span>{errorMsg}</span>
            </div>
          )}
          {note && (
            <p className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-2.5 text-xs text-sky-800">
              {note}
            </p>
          )}

          {/* Current certifications, for context alongside what's recommended */}
          {selectedResume && (selectedResume.structured.certifications ?? []).length > 0 && (
            <div className="mt-6">
              <h2 className="text-xs font-bold uppercase tracking-wide text-foreground/50">
                {t("currentHeading")}
              </h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {(selectedResume.structured.certifications ?? []).map((c, i) => (
                  <span
                    key={i}
                    className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700"
                  >
                    <Award size={12} />
                    {c.name}
                    {c.year ? ` · ${c.year}` : ""}
                  </span>
                ))}
              </div>
            </div>
          )}

          {!recommendations && !loadingRecs && (
            <div className="mt-10 flex flex-col items-center rounded-2xl border border-dashed border-border bg-surface px-6 py-14 text-center">
              <GraduationCap className="mb-3 text-foreground/30" size={32} />
              <p className="text-sm font-semibold text-foreground">{t("emptyTitle")}</p>
              <p className="mt-1 max-w-sm text-sm text-foreground/60">{t("emptySubtitle")}</p>
            </div>
          )}

          {loadingRecs && !recommendations && (
            <div className="mt-8 space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-28 animate-pulse rounded-2xl border border-border bg-sand-100/60" />
              ))}
            </div>
          )}

          {sortedRecommendations.length > 0 && (
            <div className="mt-8">
              <h2 className="text-xs font-bold uppercase tracking-wide text-foreground/50">
                {t("recommendedHeading", { count: sortedRecommendations.length })}
              </h2>
              <div className="mt-3 space-y-4">
                {sortedRecommendations.map((rec) => {
                  const already = existingCertNames.has(rec.name.toLowerCase().trim()) || addedNames.has(rec.name);
                  return (
                    <div key={rec.name} className="rounded-2xl border border-border bg-surface p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-foreground">{rec.name}</h3>
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${PRIORITY_STYLE[rec.priority]}`}
                            >
                              {t(`priority.${rec.priority}`)}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-foreground/50">{rec.issuer}</p>
                        </div>
                        <div className="flex flex-none flex-wrap items-center gap-1.5">
                          <span className="rounded-full bg-sand-100 px-2.5 py-1 text-[11px] font-medium text-foreground/60">
                            {rec.category}
                          </span>
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${LEVEL_STYLE[rec.level]}`}>
                            {t(`level.${rec.level}`)}
                          </span>
                          <span className="flex items-center gap-1 rounded-full bg-sand-100 px-2.5 py-1 text-[11px] font-medium text-foreground/60">
                            <Clock size={11} />
                            {rec.estimatedTime}
                          </span>
                        </div>
                      </div>

                      <p className="mt-3 text-sm leading-relaxed text-foreground/75">{rec.whyItMatters}</p>

                      <div className="mt-4 flex flex-wrap items-center gap-2.5">
                        <a
                          href={rec.studyUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                        >
                          {t("startStudying")}
                          <ExternalLink size={12} />
                        </a>
                        <button
                          type="button"
                          onClick={() => handleAddToResume(rec)}
                          disabled={already || addingName === rec.name}
                          className={`flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-semibold transition-colors ${
                            already
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-border text-foreground/70 hover:bg-sand-100"
                          }`}
                        >
                          {addingName === rec.name ? (
                            <Loader2 className="animate-spin" size={12} />
                          ) : already ? (
                            <Check size={12} />
                          ) : (
                            <Plus size={12} />
                          )}
                          {already ? t("addedToResume") : t("addToResume")}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
