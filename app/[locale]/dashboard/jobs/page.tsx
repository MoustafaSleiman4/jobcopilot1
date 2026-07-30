"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Search, MapPin, Building2, ExternalLink } from "lucide-react";

type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  applyUrl: string;
  applyType: "one_click" | "external";
};

export default function JobSearchPage() {
  const t = useTranslations("dashboard.jobs");
  const [query, setQuery] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/jobs/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => setJobs(data.jobs ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [query]);

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

      <div className="mt-8 space-y-4">
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
          <p className="text-sm text-foreground/50">No matching jobs found — try a different search.</p>
        )}
      </div>
    </div>
  );
}
