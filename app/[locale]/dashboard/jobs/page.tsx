"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Search,
  MapPin,
  Building2,
  ExternalLink,
  SlidersHorizontal,
  X,
  Lock,
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
  structured?: { title?: string };
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
  const [resumeTitle, setResumeTitle] = useState<string | null>(null);
  const [defaultQueryReady, setDefaultQueryReady] = useState(false);
  const [showUpgradeBanner, setShowUpgradeBanner] = useState(false);
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

        const { data: profile } = await supabase
          .from("profiles")
          .select("plan")
          .eq("id", uid)
          .single();
        if (!cancelled && profile?.plan === "pro") setPlan("pro");

        const { data: resume } = await supabase
          .from("resumes")
          .select("content")
          .eq("user_id", uid)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (cancelled) return;

        const title = (resume?.content as ResumeContent | undefined)?.structured?.title;
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

  function handleApply(job: Job) {
    if (plan !== "pro") {
      setShowUpgradeBanner(true);
      return;
    }
    window.open(job.applyUrl, "_blank", "noreferrer");
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
              <button
                type="button"
                onClick={() => handleApply(job)}
                className="flex flex-none items-center justify-center gap-1.5 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                {plan !== "pro" ? <Lock size={13} /> : null}
                {job.applyType === "one_click" ? t("apply") : t("smartApply")}
                {plan === "pro" && <ExternalLink size={14} />}
              </button>
            </div>
          ))}
        {!loading && jobs.length === 0 && (
          <p className="text-sm text-foreground/50">{t("noResults")}</p>
        )}
      </div>
    </div>
  );
}
