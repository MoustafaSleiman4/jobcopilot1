"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Search, MapPin, Building2, ExternalLink, SlidersHorizontal, X } from "lucide-react";

type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  applyUrl: string;
  applyType: "one_click" | "external";
  industry: string;
  remote: boolean;
};

type SearchResponse = {
  jobs: Job[];
  industries: string[];
  locations: string[];
};

export default function JobSearchPage() {
  const t = useTranslations("dashboard.jobs");
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [industry, setIndustry] = useState("");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [industries, setIndustries] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (location) params.set("location", location);
    if (industry) params.set("industry", industry);
    if (remoteOnly) params.set("remote", "true");

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
  }, [query, location, industry, remoteOnly]);

  const hasActiveFilters = Boolean(location || industry || remoteOnly);

  function clearFilters() {
    setLocation("");
    setIndustry("");
    setRemoteOnly(false);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
      <p className="mt-1 text-sm text-foreground/60">{t("subtitle")}</p>

      <div className="relative mt-6 max-w-lg">
        <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 text-foreground/40" size={18} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="w-full rounded-full border border-border bg-surface py-3 ps-11 pe-4 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
      </div>

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

        <button
          type="button"
          onClick={() => setRemoteOnly((v) => !v)}
          aria-pressed={remoteOnly}
          className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
            remoteOnly
              ? "border-emerald-600 bg-emerald-600 text-white"
              : "border-border bg-surface text-foreground hover:bg-sand-100"
          }`}
        >
          {t("remoteOnly")}
        </button>

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
                  {job.remote && (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                      {t("remoteOnly")}
                    </span>
                  )}
                </div>
              </div>
              <a
                href={job.applyUrl}
                target="_blank"
                rel="noreferrer"
                className="flex flex-none items-center justify-center gap-1.5 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                {job.applyType === "one_click" ? t("apply") : t("smartApply")}
                <ExternalLink size={14} />
              </a>
            </div>
          ))}
        {!loading && jobs.length === 0 && (
          <p className="text-sm text-foreground/50">{t("noResults")}</p>
        )}
      </div>
    </div>
  );
}
