// Detects which application-tracking system (ATS) actually hosts a job's
// apply page, purely from the apply URL's hostname/scheme — no extra
// network call, so every job from every source (crawled boards, the paid
// aggregator cache, employer postings, even the curated fallback list) gets
// tagged for free at the moment it's normalized. This is the "additional
// value" layer the job-crawling functions now store per job (see
// lib/jobSources.ts's finalize() and lib/jobCache.ts's storeJobs()): once we
// know a job is Greenhouse-hosted, lib/screeningAnswers.ts can go fetch that
// specific posting's real application questions; for every platform, the
// Application Assist panel (app/[locale]/dashboard/auto-apply/page.tsx) can
// show a one-line heads-up about how that platform's application flow
// behaves before the user clicks through.
export type AtsPlatform =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "workday"
  | "icims"
  | "taleo"
  | "smartrecruiters"
  | "bamboohr"
  | "workable"
  | "successfactors"
  | "linkedin"
  | "email"
  | "company_site";

// Ordered by how common each platform actually is among this app's real
// sources (Greenhouse/Lever/Ashby are directly crawled; Workday/iCIMS/Taleo/
// SmartRecruiters/BambooHR/Workable/SuccessFactors are extremely common
// destinations for the Jooble/Careerjet/SerpApi/RemoteOK-sourced and
// employer-posted listings) — order doesn't affect correctness since every
// pattern is host-anchored and mutually exclusive, just kept readable.
const ATS_HOST_PATTERNS: [RegExp, AtsPlatform][] = [
  [/(^|\.)greenhouse\.io$/i, "greenhouse"],
  [/(^|\.)lever\.co$/i, "lever"],
  [/(^|\.)ashbyhq\.com$/i, "ashby"],
  [/(^|\.)myworkdayjobs\.com$/i, "workday"],
  [/(^|\.)myworkday\.com$/i, "workday"],
  [/(^|\.)icims\.com$/i, "icims"],
  [/(^|\.)taleo\.net$/i, "taleo"],
  [/(^|\.)smartrecruiters\.com$/i, "smartrecruiters"],
  [/(^|\.)bamboohr\.com$/i, "bamboohr"],
  [/(^|\.)workable\.com$/i, "workable"],
  [/(^|\.)successfactors\.(com|eu)$/i, "successfactors"],
  [/(^|\.)linkedin\.com$/i, "linkedin"],
];

/**
 * Pure function of the apply URL — safe to call on every job from every
 * source at crawl/normalize time. Falls back to "company_site" for anything
 * that isn't a recognized third-party ATS (a company's own in-house careers
 * page, most often) and to "email" for a mailto: apply link (employer-posted
 * jobs can use either — see lib/companyJobs.ts).
 */
export function detectAtsPlatform(url: string): AtsPlatform {
  if (!url || url === "#") return "company_site";
  if (/^mailto:/i.test(url)) return "email";
  try {
    const host = new URL(url).hostname;
    for (const [pattern, platform] of ATS_HOST_PATTERNS) {
      if (pattern.test(host)) return platform;
    }
  } catch {
    // Malformed URL — treat like any other unrecognized destination.
  }
  return "company_site";
}

// Display label per platform — brand names stay in Latin script even in the
// Arabic UI (same convention this app already uses for "Pro", "Whish", etc.
// in messages/ar.json), so this one label set is shared by both locales; the
// translated wrapper text around it lives in messages/{en,ar}.json under
// dashboard.autoApply.queue.atsBadge instead.
export const ATS_PLATFORM_LABELS: Record<AtsPlatform, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  workday: "Workday",
  icims: "iCIMS",
  taleo: "Taleo",
  smartrecruiters: "SmartRecruiters",
  bamboohr: "BambooHR",
  workable: "Workable",
  successfactors: "SuccessFactors",
  linkedin: "LinkedIn",
  email: "email",
  company_site: "company site",
};
