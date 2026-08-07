// Shared job-source fetchers, pulled out of app/api/jobs/search/route.ts so
// the new Auto Apply cron (app/api/cron/auto-apply/route.ts) can reuse the
// exact same real, ToS-compliant sources instead of duplicating ~250 lines
// of fetch logic that would inevitably drift out of sync. Pure extraction —
// no behavior changed from the original route.ts versions of these.
//
// Deliberately excludes Jooble/Careerjet/SerpApi: those are paid/keyed
// sources with shared, metered quotas (SerpApi's free tier in particular is
// capped at 250 searches/month across every user of this app). The manual
// Job Search page spends that quota on a real, deliberate user action (one
// search = one spend, capped at 10/day/user — see DAILY_SEARCH_LIMIT in
// app/api/jobs/search/route.ts). Auto Apply runs automatically, once a day,
// for every opted-in user with no per-search human decision — wiring it into
// the same shared paid quota would mean a handful of opted-in users could
// silently exhaust a month's SerpApi budget in a single cron run with nobody
// having "spent" anything on purpose. Auto Apply therefore only ever matches
// against the always-free sources below (Greenhouse/Lever/Ashby/RemoteOK)
// plus the curated fallback list.

export type WorkType = "remote" | "hybrid" | "onsite";

export type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  applyUrl: string;
  applyType: "one_click" | "external";
  industry: string;
  workType: WorkType;
};

export const GREENHOUSE_BOARDS = [
  { slug: "careem", host: "boards-api.greenhouse.io" },
  { slug: "tamara", host: "boards-api.greenhouse.io" },
  // HALA — Saudi fintech (Riyadh); verified live via boards-api.greenhouse.io
  // with real openings (AI Engineer, Payment Product Manager, Product
  // Designer, and others) as of this addition.
  { slug: "hala", host: "boards-api.greenhouse.io", company: "HALA" },
  // Cobblestone Energy — Dubai-based algorithmic/energy trading firm;
  // verified live with real Dubai software/data-engineering openings
  // (Software Engineer - Automated Trading, Data Scientist, and others).
  { slug: "cobblestoneenergy1", host: "boards-api.greenhouse.io", company: "Cobblestone Energy" },
];
export const LEVER_BOARDS = [
  { slug: "Yassir", company: "Yassir" },
  { slug: "econstruct", company: "e.construct" },
  { slug: "soum", company: "Soum" },
  { slug: "Bosta", company: "Bosta" },
  { slug: "rewaatech", company: "Rewaa" },
];
export const ASHBY_BOARDS = [
  { slug: "leantech", company: "Lean Technologies" },
  { slug: "ziina", company: "Ziina" },
  { slug: "checkout.com", company: "Checkout.com" },
  { slug: "mexdigital", company: "MultiBank Group" },
  { slug: "thndr", company: "Thndr" },
  { slug: "rain", company: "Rain" },
];

export const LOCATIONS = [
  "United Arab Emirates",
  "Saudi Arabia",
  "Qatar",
  "Kuwait",
  "Bahrain",
  "Oman",
  "Lebanon",
  "Jordan",
  "Egypt",
];

export const LOCATION_ALIASES: Record<string, string[]> = {
  "United Arab Emirates": ["uae", "u.a.e"],
  "Saudi Arabia": ["ksa", "saudi"],
};

export const INDUSTRY_KEYWORDS: [string, string[]][] = [
  ["Technology", ["engineer", "developer", "software", "data", "devops", "product manager", "qa engineer", "frontend", "backend", "full stack", "it "]],
  ["Marketing", ["marketing", "growth", "content", "seo", "brand", "social media"]],
  ["Finance & Banking", ["finance", "accountant", "audit", "banking", "relationship manager", "investment", "financial"]],
  ["Sales & Business Development", ["sales", "business development", "account executive", "partnership"]],
  ["Operations & Supply Chain", ["operations", "supply chain", "logistics", "procurement", "warehouse"]],
  ["Human Resources", ["hr ", "human resources", "recruiter", "talent"]],
  ["Customer Support", ["customer support", "customer service", "support specialist"]],
  ["Design", ["designer", "ux", "ui ", "graphic"]],
];

// True when a job's own location text actually mentions one of the 9
// Gulf/Levant/Egypt countries this app is scoped to (or a known
// abbreviation — see LOCATION_ALIASES). Used to keep US/global-remote
// listings that a broad job-board search can otherwise pull in (RemoteOK in
// particular has no geography filter of its own) out of results that are
// supposed to be Gulf/Arab-region-only.
export function isRegionLocation(location: string): boolean {
  const loc = location.toLowerCase();
  return LOCATIONS.some((country) => {
    const needles = [country.toLowerCase(), ...(LOCATION_ALIASES[country] ?? [])];
    return needles.some((n) => loc.includes(n));
  });
}

export function inferIndustry(title: string): string {
  const lower = ` ${title.toLowerCase()} `;
  for (const [industry, keywords] of INDUSTRY_KEYWORDS) {
    if (keywords.some((k) => lower.includes(k))) return industry;
  }
  return "Other";
}

export function inferWorkType(location: string): WorkType {
  if (/hybrid/i.test(location)) return "hybrid";
  if (/remote/i.test(location)) return "remote";
  return "onsite";
}

export function finalize(job: Omit<Job, "industry" | "workType">): Job {
  return { ...job, industry: inferIndustry(job.title), workType: inferWorkType(job.location) };
}

export const FALLBACK_JOBS: Job[] = (
  [
    { id: "demo-1", title: "Growth Marketing Manager", company: "Careem", location: "Dubai, UAE", applyUrl: "https://www.careem.com/careers", applyType: "external" },
    { id: "demo-2", title: "Product Analyst", company: "STC", location: "Riyadh, Saudi Arabia", applyUrl: "https://www.stc.com.sa/careers", applyType: "external" },
    { id: "demo-3", title: "Senior Frontend Engineer", company: "noon", location: "Dubai, UAE (Remote)", applyUrl: "https://www.noon.com/careers", applyType: "external" },
    { id: "demo-4", title: "Data Analyst", company: "Aramco Digital", location: "Dhahran, Saudi Arabia", applyUrl: "https://www.aramco.com/careers", applyType: "external" },
    { id: "demo-5", title: "Relationship Manager", company: "Bank Audi", location: "Beirut, Lebanon", applyUrl: "https://www.bankaudigroup.com/careers", applyType: "external" },
    { id: "demo-8", title: "Software Engineer", company: "IDS (International Data Systems)", location: "Beirut, Lebanon", applyUrl: "https://www.idsplus.com/careers", applyType: "external" },
    { id: "demo-9", title: "Digital Marketing Specialist", company: "Bank of Beirut", location: "Beirut, Lebanon", applyUrl: "https://www.bankofbeirut.com/careers", applyType: "external" },
    { id: "demo-6", title: "Operations Lead", company: "Talabat", location: "Amman, Jordan (Hybrid)", applyUrl: "https://www.talabat.com/careers", applyType: "external" },
    { id: "demo-7", title: "Supply Chain Analyst", company: "Americana Group", location: "Cairo, Egypt", applyUrl: "https://www.americana-group.com/careers", applyType: "external" },
    { id: "demo-10", title: "HR Business Partner", company: "Emirates NBD", location: "Dubai, UAE", applyUrl: "https://www.emiratesnbd.com/en/careers", applyType: "external" },
    { id: "demo-11", title: "Product Designer", company: "Fetchr", location: "Dubai, UAE (Remote)", applyUrl: "https://www.fetchr.us/careers", applyType: "external" },
    { id: "demo-12", title: "Customer Support Lead", company: "Trella", location: "Cairo, Egypt (Hybrid)", applyUrl: "https://www.trella.app/careers", applyType: "external" },
    { id: "demo-13", title: "Cabin Crew", company: "Qatar Airways", location: "Doha, Qatar", applyUrl: "https://careers.qatarairways.com/global/Home", applyType: "external" },
    { id: "demo-14", title: "Network Engineer", company: "Ooredoo Qatar", location: "Doha, Qatar", applyUrl: "https://www.ooredoo.qa/web/en/careers/", applyType: "external" },
    { id: "demo-15", title: "Business Development Manager", company: "Zain", location: "Kuwait City, Kuwait", applyUrl: "https://careers.zain.com/", applyType: "external" },
    { id: "demo-16", title: "Relationship Manager", company: "National Bank of Kuwait (NBK)", location: "Kuwait City, Kuwait", applyUrl: "https://www.nbk.com/careers.html", applyType: "external" },
    { id: "demo-17", title: "Financial Analyst", company: "Bank ABC", location: "Manama, Bahrain", applyUrl: "https://www.bank-abc.com/En/AboutABC/Careers/Pages/default.aspx", applyType: "external" },
    { id: "demo-18", title: "Customer Service Executive", company: "Batelco", location: "Manama, Bahrain (Hybrid)", applyUrl: "https://careers.batelco.com/", applyType: "external" },
    { id: "demo-19", title: "Relationship Manager", company: "Bank Muscat", location: "Muscat, Oman", applyUrl: "https://www.bankmuscat.com/en/about/humanresources", applyType: "external" },
    { id: "demo-20", title: "Ground Operations Officer", company: "Oman Air", location: "Muscat, Oman", applyUrl: "https://www.omanair.com/en/careers", applyType: "external" },
  ] satisfies Omit<Job, "industry" | "workType">[]
).map(finalize);

export async function fetchGreenhouseJobs(slug: string, host: string, company?: string): Promise<Job[]> {
  try {
    const res = await fetch(`https://${host}/v1/boards/${slug}/jobs?content=false`, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.jobs ?? []).slice(0, 25).map((j: { id: number; title: string; location?: { name?: string }; absolute_url: string }) =>
      finalize({
        id: `${slug}-${j.id}`,
        title: j.title,
        // Explicit `company` (see GREENHOUSE_BOARDS) beats the old
        // capitalize-the-slug fallback — that fallback reads fine for a
        // clean single-word slug ("careem" -> "Careem") but turns something
        // like "cobblestoneenergy1" into a garbled display name.
        company: company ?? slug[0].toUpperCase() + slug.slice(1),
        location: j.location?.name ?? "Remote",
        applyUrl: j.absolute_url,
        applyType: "external" as const,
      })
    );
  } catch {
    return [];
  }
}

type LeverPosting = { id?: string; text?: string; categories?: { location?: string; team?: string }; hostedUrl?: string; applyUrl?: string };

export async function fetchLeverJobs(slug: string, company: string): Promise<Job[]> {
  try {
    const res = await fetch(`https://api.lever.co/v0/postings/${slug}?mode=json`, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const data: LeverPosting[] = await res.json();
    return (data ?? []).slice(0, 25).map((p, idx) =>
      finalize({
        id: `lever-${slug}-${p.id ?? idx}`,
        title: p.text ?? "Untitled role",
        company,
        location: p.categories?.location ?? "Remote",
        applyUrl: p.applyUrl ?? p.hostedUrl ?? "#",
        applyType: "external" as const,
      })
    );
  } catch {
    return [];
  }
}

type AshbyPosting = { id?: string; title?: string; location?: string; jobUrl?: string; applyUrl?: string };

export async function fetchAshbyJobs(slug: string, companyName: string): Promise<Job[]> {
  try {
    const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}`, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const data = await res.json();
    const postings: AshbyPosting[] = data.jobs ?? [];
    return postings.slice(0, 25).map((p, idx) =>
      finalize({
        id: `ashby-${slug}-${p.id ?? idx}`,
        title: p.title ?? "Untitled role",
        company: companyName,
        location: p.location ?? "Remote",
        applyUrl: p.applyUrl ?? p.jobUrl ?? "#",
        applyType: "external" as const,
      })
    );
  } catch {
    return [];
  }
}

type RemoteOkJob = { id?: string; slug?: string; position?: string; company?: string; location?: string; url?: string; apply_url?: string };

export async function fetchRemoteOkJobs(): Promise<Job[]> {
  try {
    const res = await fetch("https://remoteok.com/api", {
      headers: { "User-Agent": "GulfJobCopilot (https://gulfjobcopilot.com)" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data: RemoteOkJob[] = await res.json();
    // RemoteOK has no geography filter of its own — it's a fully global
    // remote-jobs board, so most of what it returns is US/EU/APAC-based and
    // not relevant to a Gulf/Levant/Egypt job seeker. Only keep listings
    // whose own location text actually names one of this app's 9 target
    // countries; a bare "Remote" with no country mentioned is excluded too,
    // since there's no way to confirm it's actually open to this region.
    const jobs = data.filter(
      (j) => typeof j.position === "string" && j.position.length > 0 && isRegionLocation(j.location || "")
    );
    return jobs.slice(0, 40).map((j, idx) =>
      finalize({
        id: `remoteok-${j.id ?? j.slug ?? idx}`,
        title: j.position ?? "Untitled role",
        company: j.company || "—",
        location: j.location || "Remote",
        applyUrl: j.url ?? j.apply_url ?? "#",
        applyType: "external" as const,
      })
    );
  } catch {
    return [];
  }
}

/** All always-free sources in one call, flattened — the set Auto Apply matches against. */
export async function fetchFreeSourceJobs(): Promise<Job[]> {
  const [greenhouse, lever, ashby, remoteOk] = await Promise.all([
    Promise.all(GREENHOUSE_BOARDS.map((b) => fetchGreenhouseJobs(b.slug, b.host, b.company))),
    Promise.all(LEVER_BOARDS.map((b) => fetchLeverJobs(b.slug, b.company))),
    Promise.all(ASHBY_BOARDS.map((b) => fetchAshbyJobs(b.slug, b.company))),
    fetchRemoteOkJobs(),
  ]);
  const jobs = [...greenhouse.flat(), ...lever.flat(), ...ashby.flat(), ...remoteOk, ...FALLBACK_JOBS];
  const seen = new Set<string>();
  return jobs.filter((j) => {
    if (seen.has(j.applyUrl)) return false;
    seen.add(j.applyUrl);
    return true;
  });
}
