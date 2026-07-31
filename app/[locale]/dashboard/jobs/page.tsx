"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { downloadResumePdf } from "@/lib/resume-pdf";
import type { StructuredResume } from "@/lib/resume-types";
import {
  Search,
  MapPin,
  Building2,
  ExternalLink,
  SlidersHorizontal,
  X,
  Lock,
  Bookmark,
  BookmarkCheck,
  Sparkles,
  Loader2,
  Download,
  Copy,
  Check,
  Mail,
  Phone,
  User,
} from "lucide-react";

type WorkType = "remote" | "hybrid" | "onsite";

type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  applyUrl: string;
  applyType: "one_click" | "external";
  industry: string;
  workType: WorkType;
};

type SearchResponse = {
  jobs: Job[];
  industries: string[];
  locations: string[];
  workTypes: WorkType[];
};

type ResumeContent = {
  structured?: StructuredResume;
};

type ContactInfo = {
  fullName: string;
  email: string;
  phone: string;
};

const WORK_TYPES: WorkType[] = ["remote", "hybrid", "onsite"];

export default function JobSearchPage() {
  const t = useTranslations("dashboard.jobs");
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [industry, setIndustry] = useState("");
  const [workType, setWorkType] = useState<WorkType | "">("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [industries, setIndustries] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [plan, setPlan] = useState<"free" | "pro">("free");
  const [userId, setUserId] = useState<string | null>(null);
  const [trackedIds, setTrackedIds] = useState<Set<string>>(new Set());
  const [resumeTitle, setResumeTitle] = useState<string | null>(null);
  const [defaultResumeId, setDefaultResumeId] = useState<string | null>(null);
  const [defaultResumeStructured, setDefaultResumeStructured] = useState<StructuredResume | null>(null);
  const [contactInfo, setContactInfo] = useState<ContactInfo | null>(null);
  const [defaultQueryReady, setDefaultQueryReady] = useState(false);
  const [showUpgradeBanner, setShowUpgradeBanner] = useState(false);
  const [prepareJob, setPrepareJob] = useState<Job | null>(null);
  const [coverLetter, setCoverLetter] = useState("");
  const [generatingLetter, setGeneratingLetter] = useState(false);
  const [letterError, setLetterError] = useState<string | null>(null);
  const [copiedLetter, setCopiedLetter] = useState(false);
  const userTypedRef = useRef(false);

  // Load the signed-in user's plan and their saved resume's job title, so
  // the search can default to "jobs like the one on your resume" instead of
  // an unfiltered list. Only ever applied once, and only if the user hasn't
  // already started typing their own query in the meantime.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        const uid = data.user?.id;
        if (!uid || cancelled) {
          setDefaultQueryReady(true);
          return;
        }

        setUserId(uid);

        const { data: profile } = await supabase
          .from("profiles")
          .select("plan, full_name, phone")
          .eq("id", uid)
          .single();
        if (cancelled) return;
        if (profile?.plan === "pro") setPlan("pro");
        setContactInfo({
          fullName: profile?.full_name ?? "",
          email: data.user?.email ?? "",
          phone: profile?.phone ?? "",
        });

        const { data: tracked } = await supabase
          .from("applications")
          .select("source_job_id")
          .eq("user_id", uid)
          .not("source_job_id", "is", null);
        if (!cancelled && tracked) {
          setTrackedIds(new Set(tracked.map((r) => r.source_job_id as string)));
        }

        // Ordered primary-first so a user with multiple saved versions gets
        // their intentionally-chosen "main" resume associated with new
        // applications (for Reports' resume-performance breakdown), not
        // just whichever one they touched most recently.
        const { data: resume } = await supabase
          .from("resumes")
          .select("id, content")
          .eq("user_id", uid)
          .order("is_primary", { ascending: false })
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (cancelled) return;

        if (resume?.id) setDefaultResumeId(resume.id as string);
        const structured = (resume?.content as ResumeContent | undefined)?.structured;
        if (structured) setDefaultResumeStructured(structured);

        const title = structured?.title;
        if (title) {
          setResumeTitle(title);
          if (!userTypedRef.current) setQuery(title);
        }
      } catch {
        // Not logged in / Supabase not configured — fall back to an
        // unfiltered search, same as a logged-out visitor sees today.
      } finally {
        if (!cancelled) setDefaultQueryReady(true);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!defaultQueryReady) return;
    const controller = new AbortController();
    setLoading(true);
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (location) params.set("location", location);
    if (industry) params.set("industry", industry);
    if (workType) params.set("workType", workType);

    fetch(`/api/jobs/search?${params.toString()}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data: SearchResponse) => {
        setJobs(data.jobs ?? []);
        if (data.industries?.length) setIndustries(data.industries);
        if (data.locations?.length) setLocations(data.locations);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [query, location, industry, workType, defaultQueryReady]);

  const hasActiveFilters = Boolean(location || industry || workType);

  function clearFilters() {
    setLocation("");
    setIndustry("");
    setWorkType("");
  }

  // Snapshot the listing's own fields into `applications` rather than
  // relying on a `job_id` foreign key — live results come from external ATS
  // APIs and an in-memory fallback list, not from rows in the `jobs` table,
  // so there's nothing for a job_id to reference.
  async function handleSave(job: Job) {
    if (!userId || trackedIds.has(job.id)) return;
    setTrackedIds((prev) => new Set(prev).add(job.id));
    try {
      const supabase = createClient();
      const { error } = await supabase.from("applications").insert({
        user_id: userId,
        source_job_id: job.id,
        resume_id: defaultResumeId,
        company: job.company,
        title: job.title,
        location: job.location || null,
        apply_url: job.applyUrl || null,
        status: "saved",
      });
      // Supabase query calls resolve successfully (no throw) even when the
      // database rejects the write — the error comes back as `error`, not
      // as an exception. A duplicate-key error (23505) here just means it
      // was already saved (e.g. from another tab); anything else is a real
      // failure and needs to be visible, not silently swallowed.
      if (error && error.code !== "23505") {
        console.error("[jobs] failed to save job:", error);
      }
    } catch (err) {
      console.error("[jobs] failed to save job (network):", err);
    }
  }

  async function recordApplied(job: Job) {
    if (!userId) return;
    setTrackedIds((prev) => new Set(prev).add(job.id));
    try {
      const supabase = createClient();
      const { data: existing, error: selectError } = await supabase
        .from("applications")
        .select("id, status")
        .eq("user_id", userId)
        .eq("source_job_id", job.id)
        .maybeSingle();
      if (selectError) {
        console.error("[jobs] failed to check existing application:", selectError);
      }

      if (existing) {
        // Only advance "saved" -> "applied". If it's already further along
        // the pipeline (interview/offer/rejected), clicking Apply again
        // shouldn't silently regress the tracker.
        if (existing.status === "saved") {
          const { error } = await supabase
            .from("applications")
            .update({
              status: "applied",
              applied_at: new Date().toISOString(),
              resume_id: defaultResumeId,
            })
            .eq("id", existing.id);
          if (error) console.error("[jobs] failed to mark application applied:", error);
        }
      } else {
        const { error } = await supabase.from("applications").insert({
          user_id: userId,
          source_job_id: job.id,
          resume_id: defaultResumeId,
          company: job.company,
          title: job.title,
          location: job.location || null,
          apply_url: job.applyUrl || null,
          status: "applied",
          applied_at: new Date().toISOString(),
        });
        if (error) console.error("[jobs] failed to record application:", error);
      }
    } catch (err) {
      // Network-level failure only reaches here — DB-level errors are
      // caught and logged above, since Supabase calls don't throw for those.
      console.error("[jobs] failed to record application (network):", err);
    }
  }

  function handleApply(job: Job) {
    if (plan !== "pro") {
      setShowUpgradeBanner(true);
      return;
    }
    // Pro users get a "prepare application" step first: their contact
    // info and resume are pulled up ready to use, and a cover letter can be
    // generated on demand, so opening the employer's own apply page is a
    // one-click confirmation rather than starting from a blank form. This
    // isn't literal zero-interaction submission — see the note in the
    // modal — no job source used here exposes a public API that would let
    // us submit on the candidate's behalf without becoming an employer/
    // platform partner.
    setCoverLetter("");
    setLetterError(null);
    setCopiedLetter(false);
    setPrepareJob(job);
  }

  function closePrepareModal() {
    setPrepareJob(null);
  }

  async function handleConfirmOpenApplication() {
    if (!prepareJob) return;
    window.open(prepareJob.applyUrl, "_blank", "noreferrer");
    await recordApplied(prepareJob);
    closePrepareModal();
  }

  async function handleDownloadResume() {
    if (!defaultResumeStructured) return;
    await downloadResumePdf(defaultResumeStructured, "resume.pdf");
  }

  async function handleGenerateCoverLetter() {
    if (!prepareJob || !defaultResumeStructured) return;
    setGeneratingLetter(true);
    setLetterError(null);
    try {
      const res = await fetch("/api/resume/cover-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resume: defaultResumeStructured,
          jobTitle: prepareJob.title,
          company: prepareJob.company,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      setCoverLetter(data.letter as string);
    } catch (err) {
      setLetterError(err instanceof Error ? err.message : t("prepare.letterError"));
    } finally {
      setGeneratingLetter(false);
    }
  }

  async function handleCopyCoverLetter() {
    try {
      await navigator.clipboard.writeText(coverLetter);
      setCopiedLetter(true);
      setTimeout(() => setCopiedLetter(false), 2000);
    } catch {
      // Not critical — the letter is still visible and selectable.
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
      <p className="mt-1 text-sm text-foreground/60">{t("subtitle")}</p>

      <div className="relative mt-6 max-w-lg">
        <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 text-foreground/40" size={18} />
        <input
          value={query}
          onChange={(e) => {
            userTypedRef.current = true;
            setQuery(e.target.value);
          }}
          placeholder={t("searchPlaceholder")}
          className="w-full rounded-full border border-border bg-surface py-3 ps-11 pe-4 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
      </div>

      {resumeTitle && !userTypedRef.current && query === resumeTitle && (
        <p className="mt-2 text-xs text-foreground/50">
          {t("matchedToResume", { title: resumeTitle })}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 text-foreground/50">
          <SlidersHorizontal size={15} />
        </div>

        <select
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="rounded-full border border-border bg-surface px-4 py-2 text-sm text-foreground focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        >
          <option value="">{t("allLocations")}</option>
          {locations.map((loc) => (
            <option key={loc} value={loc}>
              {t.has(`locationNames.${loc}`) ? t(`locationNames.${loc}`) : loc}
            </option>
          ))}
        </select>

        <select
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          className="rounded-full border border-border bg-surface px-4 py-2 text-sm text-foreground focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        >
          <option value="">{t("allIndustries")}</option>
          {industries.map((ind) => (
            <option key={ind} value={ind}>
              {t.has(`industryNames.${ind}`) ? t(`industryNames.${ind}`) : ind}
            </option>
          ))}
        </select>

        <select
          value={workType}
          onChange={(e) => setWorkType(e.target.value as WorkType | "")}
          className="rounded-full border border-border bg-surface px-4 py-2 text-sm text-foreground focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        >
          <option value="">{t("allWorkTypes")}</option>
          {WORK_TYPES.map((wt) => (
            <option key={wt} value={wt}>
              {t(`workTypes.${wt}`)}
            </option>
          ))}
        </select>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="flex items-center gap-1 rounded-full px-3 py-2 text-sm font-medium text-foreground/60 hover:text-foreground"
          >
            <X size={14} />
            {t("clearFilters")}
          </button>
        )}
      </div>

      {!loading && (
        <p className="mt-4 text-sm text-foreground/50">{t("resultsCount", { count: jobs.length })}</p>
      )}

      {showUpgradeBanner && (
        <div className="mt-4 flex flex-col items-start gap-3 rounded-xl border border-gold-400/40 bg-gold-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <Lock className="mt-0.5 text-gold-600" size={16} />
            <p className="text-sm text-foreground/80">{t("applyLocked")}</p>
          </div>
          <Link
            href="/pricing"
            className="flex-none rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            {t("upgradeCta")}
          </Link>
        </div>
      )}

      <div className="mt-4 space-y-4">
        {loading && (
          <p className="text-sm text-foreground/50">{t("loading")}</p>
        )}
        {!loading &&
          jobs.map((job) => (
            <div
              key={job.id}
              className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-surface p-6 sm:flex-row sm:items-center"
            >
              <div>
                <h3 className="font-semibold text-foreground">{job.title}</h3>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-foreground/60">
                  <span className="flex items-center gap-1.5">
                    <Building2 size={14} /> {job.company}
                  </span>
                  {job.location && (
                    <span className="flex items-center gap-1.5">
                      <MapPin size={14} /> {job.location}
                    </span>
                  )}
                  {job.industry && job.industry !== "Other" && (
                    <span className="rounded-full bg-sand-100 px-2.5 py-0.5 text-xs font-medium text-foreground/70">
                      {t.has(`industryNames.${job.industry}`) ? t(`industryNames.${job.industry}`) : job.industry}
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      job.workType === "remote"
                        ? "bg-emerald-50 text-emerald-700"
                        : job.workType === "hybrid"
                          ? "bg-sky-50 text-sky-700"
                          : "bg-sand-100 text-foreground/70"
                    }`}
                  >
                    {t(`workTypes.${job.workType}`)}
                  </span>
                </div>
              </div>
              <div className="flex flex-none items-center gap-2">
                {userId && (
                  <button
                    type="button"
                    onClick={() => handleSave(job)}
                    disabled={trackedIds.has(job.id)}
                    title={trackedIds.has(job.id) ? t("saved") : t("save")}
                    className={`flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${
                      trackedIds.has(job.id)
                        ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                        : "border-border text-foreground/50 hover:border-emerald-300 hover:text-emerald-600"
                    }`}
                  >
                    {trackedIds.has(job.id) ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleApply(job)}
                  className="flex items-center justify-center gap-1.5 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  {plan !== "pro" ? <Lock size={13} /> : null}
                  {job.applyType === "one_click" ? t("apply") : t("smartApply")}
                  {plan === "pro" && <ExternalLink size={14} />}
                </button>
              </div>
            </div>
          ))}
        {!loading && jobs.length === 0 && (
          <p className="text-sm text-foreground/50">{t("noResults")}</p>
        )}
      </div>

      {prepareJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={closePrepareModal} />
          <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-foreground">{t("prepare.title")}</h2>
                <p className="mt-1 text-sm text-foreground/60">
                  {t("prepare.subtitle", { title: prepareJob.title, company: prepareJob.company })}
                </p>
              </div>
              <button
                onClick={closePrepareModal}
                className="flex-none rounded-full p-1.5 text-foreground/50 hover:bg-sand-100 hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>

            <p className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-2.5 text-xs text-sky-800">
              {t("prepare.note")}
            </p>

            {/* Contact info */}
            <div className="mt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground/50">
                {t("prepare.contactHeading")}
              </h3>
              <div className="mt-2 space-y-1.5 rounded-xl border border-border bg-background p-3.5 text-sm">
                <div className="flex items-center gap-2 text-foreground/80">
                  <User size={14} className="text-foreground/40" />
                  {contactInfo?.fullName || t("prepare.notSet")}
                </div>
                <div className="flex items-center gap-2 text-foreground/80">
                  <Mail size={14} className="text-foreground/40" />
                  {contactInfo?.email || t("prepare.notSet")}
                </div>
                <div className="flex items-center gap-2 text-foreground/80">
                  <Phone size={14} className="text-foreground/40" />
                  {contactInfo?.phone || t("prepare.notSet")}
                </div>
              </div>
            </div>

            {/* Resume */}
            <div className="mt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground/50">
                {t("prepare.resumeHeading")}
              </h3>
              {defaultResumeStructured ? (
                <button
                  onClick={handleDownloadResume}
                  className="mt-2 flex w-full items-center justify-between rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm font-medium text-foreground hover:bg-sand-100"
                >
                  <span className="truncate">{resumeTitle || t("prepare.yourResume")}</span>
                  <Download size={15} className="flex-none text-emerald-600" />
                </button>
              ) : (
                <p className="mt-2 text-sm text-foreground/50">{t("prepare.noResume")}</p>
              )}
            </div>

            {/* Cover letter */}
            {defaultResumeStructured && (
              <div className="mt-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground/50">
                    {t("prepare.coverLetterHeading")}
                  </h3>
                  {!coverLetter && (
                    <button
                      onClick={handleGenerateCoverLetter}
                      disabled={generatingLetter}
                      className="flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 disabled:opacity-60"
                    >
                      {generatingLetter ? (
                        <Loader2 className="animate-spin" size={13} />
                      ) : (
                        <Sparkles size={13} />
                      )}
                      {generatingLetter ? t("prepare.generating") : t("prepare.generateLetter")}
                    </button>
                  )}
                </div>
                {letterError && <p className="mt-2 text-xs text-red-600">{letterError}</p>}
                {coverLetter && (
                  <div className="mt-2">
                    <textarea
                      value={coverLetter}
                      onChange={(e) => setCoverLetter(e.target.value)}
                      rows={8}
                      className="w-full resize-y rounded-xl border border-border bg-background p-3 text-xs leading-relaxed text-foreground focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                    <button
                      onClick={handleCopyCoverLetter}
                      className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-foreground/60 hover:text-foreground"
                    >
                      {copiedLetter ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                      {copiedLetter ? t("prepare.copied") : t("prepare.copy")}
                    </button>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={handleConfirmOpenApplication}
              className="mt-6 flex w-full items-center justify-center gap-1.5 rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              {t("prepare.confirmCta")}
              <ExternalLink size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
