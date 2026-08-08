"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import type { ShowcaseCardJob } from "@/components/JobsShowcase3D";

// Inline dynamic(..., { ssr: false }) rather than a separate *Loader.tsx —
// this file is already a Client Component (needs useEffect for the fetch
// below and useTranslations for the stat row), so, unlike Hero3DLoader.tsx
// (whose only job is holding the ssr: false boundary for the Server
// Component homepage above it), there's nothing a separate loader file
// would add here.
const JobsShowcase3D = dynamic(() => import("@/components/JobsShowcase3D"), { ssr: false });

// Small, on-brand static sample shown immediately (server-rendered and on
// first client paint) before the live fetch below resolves — same handful
// of realistic Gulf-region roles used as the app's fallback job data
// elsewhere (see FALLBACK_JOBS in lib/jobSources.ts), trimmed to just the
// fields the 3D cards need. Kept as a fixed literal here (rather than
// importing FALLBACK_JOBS directly) so this component's initial render
// stays fully deterministic and independent of that list ever changing.
const FALLBACK_SHOWCASE_JOBS: ShowcaseCardJob[] = [
  { title: "Growth Marketing Manager", company: "Careem", location: "Dubai, UAE" },
  { title: "Product Analyst", company: "STC", location: "Riyadh, Saudi Arabia" },
  { title: "Senior Frontend Engineer", company: "noon", location: "Dubai, UAE" },
  { title: "Data Analyst", company: "Aramco Digital", location: "Dhahran, Saudi Arabia" },
  { title: "Relationship Manager", company: "Bank Audi", location: "Beirut, Lebanon" },
  { title: "Software Engineer", company: "IDS", location: "Beirut, Lebanon" },
  { title: "Digital Marketing Specialist", company: "Bank of Beirut", location: "Beirut, Lebanon" },
  { title: "Operations Lead", company: "Talabat", location: "Amman, Jordan" },
  { title: "Supply Chain Analyst", company: "Americana Group", location: "Cairo, Egypt" },
  { title: "HR Business Partner", company: "Emirates NBD", location: "Dubai, UAE" },
  { title: "Product Designer", company: "Fetchr", location: "Dubai, UAE" },
  { title: "Customer Support Lead", company: "Trella", location: "Cairo, Egypt" },
  { title: "Cabin Crew", company: "Qatar Airways", location: "Doha, Qatar" },
  { title: "Network Engineer", company: "Ooredoo Qatar", location: "Doha, Qatar" },
  { title: "Business Development Manager", company: "Zain", location: "Kuwait City, Kuwait" },
  { title: "Relationship Manager", company: "NBK", location: "Kuwait City, Kuwait" },
  { title: "Financial Analyst", company: "Bank ABC", location: "Manama, Bahrain" },
  { title: "Relationship Manager", company: "Bank Muscat", location: "Muscat, Oman" },
];

type ShowcaseStats = { total: number; companies: number; industries: number };

/**
 * Homepage section — "the site is full of real jobs," shown rather than
 * just claimed. Renders a live-updating stat row plus the 3D card drum
 * (components/JobsShowcase3D.tsx), pulling real listings from
 * public.retrieved_jobs via app/api/jobs/showcase.
 *
 * SSR-safe by construction (same discipline as ScrollReveal.tsx): all state
 * starts at a fixed, deterministic default — the static fallback job list
 * and null stats (hidden until real) — and only ever changes inside a
 * post-mount effect, never in a lazy useState initializer or a render-time
 * branch on `window`/fetch data. That keeps server and first-client-paint
 * output identical, so there's no hydration mismatch to trip up React or
 * this section's own ScrollReveal wrapper.
 */
export default function JobsShowcase() {
  const t = useTranslations("home.jobsShowcase");
  const [jobs, setJobs] = useState<ShowcaseCardJob[]>(FALLBACK_SHOWCASE_JOBS);
  // Hidden until the live fetch resolves, rather than showing a hardcoded
  // guess that could read as stale or overstated — the 3D drum is already
  // interesting on its own with the fallback data, so there's no rush to
  // show a number before the real one is available.
  const [stats, setStats] = useState<ShowcaseStats | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/jobs/showcase")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { jobs?: ShowcaseCardJob[]; total?: number; companies?: number; industries?: number } | null) => {
        if (cancelled || !data) return;
        if (data.jobs && data.jobs.length >= 6) {
          setJobs(data.jobs);
          setLive(true);
        }
        if (typeof data.total === "number" && data.total > 0) {
          setStats({ total: data.total, companies: data.companies ?? 0, industries: data.industries ?? 0 });
        }
      })
      .catch(() => {
        // Live fetch failed — the fallback drum stays up, nothing to do.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="relative">
      {stats && (
        <div className="mb-2 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
          <span className="rounded-full border border-gold-400/40 bg-gold-50 px-3 py-1 text-xs font-semibold text-gold-700 shadow-sm sm:px-4 sm:text-sm">
            {t("statsRoles", { count: stats.total })}
          </span>
          <span className="rounded-full border border-emerald-400/30 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 shadow-sm sm:px-4 sm:text-sm">
            {t("statsCompanies", { count: stats.companies })}
          </span>
          <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-foreground/70 shadow-sm sm:px-4 sm:text-sm">
            {t("statsIndustries", { count: stats.industries })}
          </span>
        </div>
      )}
      <div className="relative mx-auto h-28 w-full max-w-4xl sm:h-36 md:h-44">
        <JobsShowcase3D key={live ? "live" : "fallback"} jobs={jobs} />
      </div>
    </div>
  );
}
