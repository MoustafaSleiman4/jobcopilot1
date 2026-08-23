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

import { type AtsPlatform, detectAtsPlatform } from "@/lib/atsPlatform";

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
  // ISO 8601 timestamp — when the listing was actually posted/updated
  // upstream (Greenhouse/Lever/Ashby/RemoteOK) or, for the cached/
  // employer-posted sources, when it entered our own table. Optional
  // because the curated FALLBACK_JOBS demo list has no real posting date —
  // Job Search sorts by this, newest first, with undated jobs pushed to the
  // end rather than guessed at.
  postedAt?: string;
  // Which application-tracking system actually hosts the apply page —
  // derived once at crawl/normalize time (see finalize() below) and carried
  // through storage (lib/jobCache.ts's retrieved_jobs.ats_platform column)
  // so it never needs to be recomputed downstream. Drives both the "Applied
  // via Greenhouse" style badge on a job card and, for Greenhouse postings
  // specifically, lib/autoApplyRun.ts's fetch of that job's real application
  // questions — see lib/screeningAnswers.ts.
  atsPlatform?: AtsPlatform;
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

// Ordered most-specific-sector-first, Technology and the other broad
// corporate-function buckets last — inferIndustry() below returns the FIRST
// category whose keywords match, so a title like "Senior Engineer,
// Commissioning (Gas Operations)" needs to hit Oil & Gas & Energy's
// "commissioning"/"gas" before it ever reaches Technology's much broader
// "engineer" keyword. Without this ordering, "engineer"/"manager"/"data" —
// all genuinely common in construction, oil & gas, healthcare, etc. — swallow
// almost every non-tech role in the region, which is exactly what surfaced
// as "Technology" search results returning construction/oil & gas jobs (see
// the sector-specific categories added here in response to that report).
// 4th-tuple-slot (optional) is an EXCLUDE list: a title/company matching one
// of these blocks that category even if it also matched an include keyword.
// Currently only Technology/Software/IT needs one — "engineer" alone is far
// too broad a signal (mechanical/electrical/chemical/biomedical/aerospace/
// marine engineers are all real, common, non-tech Gulf job titles), and none
// of those disciplines have their own dedicated category here, so excluding
// them from Technology/Software/IT sends them to "Other" rather than
// mislabeling them as tech — reported directly ("Project Manager (Mechanical
// Engineer)" showing under Technology) after the sector categories below
// were first added.
export const INDUSTRY_KEYWORDS: [string, string[], string[]?][] = [
  ["Healthcare", ["nurse", "physician", "doctor", "medical officer", "pharmacist", "healthcare", "clinical", "hospital", "dentist", "radiologist", "physiotherapist", "surgeon", "paramedic"]],
  ["Oil & Gas & Energy", ["oil and gas", "oil & gas", "petroleum", "drilling", "refinery", "upstream", "downstream", "offshore", "onshore", "pipeline", "commissioning", "process engineer", "reservoir engineer", "renewable energy", "solar energy", "lng", "oil", "gas"]],
  ["Construction & Engineering", ["construction", "civil engineer", "structural engineer", "site engineer", "site manager", "resident engineer", "quantity surveyor", "architect", "mep engineer", "hvac", "fit out", "fit-out", "piping engineer", "foreman", "surveyor", "contracts manager"]],
  ["Aviation, Travel & Hospitality", ["pilot", "cabin crew", "flight attendant", "airline", "airport", "aviation", "ground operations", "hotel", "restaurant", "chef", "hospitality", "tourism", "travel agent", "concierge", "housekeeping", "resort"]],
  ["Real Estate & Property", ["real estate", "property management", "leasing", "facilities management", "property consultant"]],
  ["Legal", ["lawyer", "attorney", "legal counsel", "paralegal", "legal advisor", "compliance officer"]],
  ["Manufacturing & Industrial", ["manufacturing", "production line", "factory", "plant manager", "industrial engineer", "machinist", "quality control inspector"]],
  ["Retail & E-commerce", ["retail", "store manager", "merchandising", "e-commerce", "cashier", "visual merchandiser"]],
  ["Government & Public Sector", ["government", "ministry", "municipality", "public sector", "civil service"]],
  ["Education", ["teacher", "professor", "lecturer", "tutor", "curriculum", "academic advisor", "school principal", "university"]],
  [
    "Technology/Software/IT",
    ["engineer", "developer", "software", "data", "devops", "product manager", "qa engineer", "frontend", "backend", "full stack", "it", "scrum master", "programmer", "system administrator", "database administrator", "cyber security", "cybersecurity", "site reliability"],
    ["mechanical", "electrical", "chemical", "biomedical", "aerospace", "marine engineer", "automotive"],
  ],
  ["Marketing", ["marketing", "growth", "content", "seo", "brand", "social media"]],
  ["Finance & Banking", ["finance", "accountant", "audit", "banking", "relationship manager", "investment", "financial", "credit"]],
  ["Sales & Business Development", ["sales", "business development", "account executive", "partnership"]],
  ["Operations & Supply Chain", ["operations", "supply chain", "logistics", "procurement", "warehouse"]],
  ["Human Resources", ["hr", "human resources", "recruiter", "talent"]],
  ["Customer Support", ["customer support", "customer service", "support specialist"]],
  ["Design", ["designer", "ux", "ui", "graphic"]],
];

function escapeRegExpLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compileWordBoundaryPatterns(keywords: string[]): RegExp[] {
  // Word-boundary matching (\b), not substring — the old plain
  // `.includes(k)` check on "it " matched inside "fit out", "credit",
  // "audit", "visit", etc. (any word ending in "-it" followed by a space),
  // which is how a construction "Senior Project Manager - Fit Out" role was
  // silently getting tagged "Technology". \b anchors each keyword to actual
  // word edges instead.
  return keywords.map((k) => new RegExp(`\\b${escapeRegExpLiteral(k)}\\b`, "i"));
}

// Precompiled ONCE at module load, not per call — inferIndustry() below runs
// on every job from every source on every search request (and every seed/
// refresh run), so building a fresh RegExp per keyword per job would add up
// fast at the volumes this table is now at.
const COMPILED_INDUSTRY_KEYWORDS: [string, RegExp[], RegExp[]][] = INDUSTRY_KEYWORDS.map(
  ([industry, keywords, excludeKeywords]) => [
    industry,
    compileWordBoundaryPatterns(keywords),
    compileWordBoundaryPatterns(excludeKeywords ?? []),
  ]
);

// True when a job's own location text actually mentions one of the 9
const US_STATE_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY",
  "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND",
  "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
]);

// Several Gulf/Levant countries this app is scoped to happen to share a
// name with an ordinary US city — Lebanon, Tennessee being the big one in
// practice (a real, frequently-listed logistics/warehouse hub whose raw
// location text is just "Lebanon, TN": one report found 974 of ~3,000
// cached jobs were this single US posting, re-fetched under different
// tracking URLs across many keyword searches, all incorrectly accepted as
// "Lebanon" the country by the plain substring check below). US job listings
// are reliably formatted as "City, XX" (a 2-letter state code) in a way no
// genuine Gulf/Levant/Egypt listing this app's sources return ever is, so
// that shape is rejected outright before the substring match ever runs.
function looksLikeUSLocation(location: string): boolean {
  const match = /,\s*([A-Za-z]{2})\s*(\(.*\))?\s*$/.exec(location.trim());
  return !!match && US_STATE_CODES.has(match[1].toUpperCase());
}

// Gulf/Levant/Egypt countries this app is scoped to (or a known
// abbreviation — see LOCATION_ALIASES). Used to keep US/global-remote
// listings that a broad job-board search can otherwise pull in (RemoteOK in
// particular has no geography filter of its own) out of results that are
// supposed to be Gulf/Arab-region-only.
export function isRegionLocation(location: string): boolean {
  if (looksLikeUSLocation(location)) return false;
  const loc = location.toLowerCase();
  return LOCATIONS.some((country) => {
    const needles = [country.toLowerCase(), ...(LOCATION_ALIASES[country] ?? [])];
    return needles.some((n) => loc.includes(n));
  });
}

function normalizeForDedupe(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * De-dupes a job list two ways: first by exact apply URL (the original,
 * narrow check), then by a normalized title+company key.
 *
 * The second pass is what actually fixes "the same job shows up twice" —
 * reported as literal duplicate cards in Job Search (identical title,
 * company, tags, match %). Jooble/SerpApi/Careerjet frequently wrap the
 * SAME underlying posting in a DIFFERENT tracking/redirect URL depending on
 * which keyword search or which day's refresh happened to surface it (the
 * seed alone runs ~30 keyword combos per location — see SEED_KEYWORDS in
 * lib/jobCache.ts — so the same real PwC/Careem/etc. posting is easily
 * fetched more than once, each time wrapped in a fresh tracking link).
 * Apply-URL-only dedup lets every one of those accumulate as a "different"
 * job forever, since none of the URLs ever collide.
 *
 * Keying on title+company only (not location) is a deliberate tradeoff:
 * location text format varies MORE across sources for the identical
 * posting than title/company do (e.g. "Dubai" vs "Dubai, UAE" vs "United
 * Arab Emirates"), so requiring it to match too would under-dedupe and miss
 * real duplicates. The cost is that two genuinely distinct simultaneous
 * openings with the exact same title at the same company would also
 * collapse into one — judged rarer, and far less visibly broken, than
 * showing duplicate cards.
 *
 * Order matters: first-seen wins, so callers should put their
 * highest-quality/most-complete source first if that ever matters (today it
 * doesn't — every source populates the same fields).
 */
export function dedupeJobs<T extends Job>(jobs: T[]): T[] {
  const seenUrls = new Set<string>();
  const seenKeys = new Set<string>();
  const out: T[] = [];
  for (const job of jobs) {
    if (job.applyUrl && job.applyUrl !== "#" && seenUrls.has(job.applyUrl)) continue;
    const key = `${normalizeForDedupe(job.title)}|${normalizeForDedupe(job.company)}`;
    if (seenKeys.has(key)) continue;
    if (job.applyUrl && job.applyUrl !== "#") seenUrls.add(job.applyUrl);
    seenKeys.add(key);
    out.push(job);
  }
  return out;
}

// `company` is optional and folded into the same matching text as `title` —
// a generic title like "Senior Manager" often carries no sector signal on
// its own, but a company name like "ADNOC GAS" or "AECOM" does, so
// classification gets meaningfully more accurate by considering both rather
// than title alone.
export function inferIndustry(title: string, company?: string): string {
  const haystack = company ? `${title} ${company}` : title;
  for (const [industry, patterns, excludePatterns] of COMPILED_INDUSTRY_KEYWORDS) {
    if (!patterns.some((re) => re.test(haystack))) continue;
    if (excludePatterns.some((re) => re.test(haystack))) continue;
    return industry;
  }
  return "Other";
}

export function inferWorkType(location: string): WorkType {
  if (/hybrid/i.test(location)) return "hybrid";
  if (/remote/i.test(location)) return "remote";
  return "onsite";
}

export function finalize(job: Omit<Job, "industry" | "workType">): Job {
  return {
    ...job,
    industry: inferIndustry(job.title, job.company),
    workType: inferWorkType(job.location),
    // Only fill this in when a caller hasn't already set it explicitly —
    // fetchGreenhouseJobs/fetchLeverJobs/fetchAshbyJobs know their platform
    // for certain and could set it directly, but detecting it here from the
    // real apply URL is just as accurate and means every other source
    // (RemoteOK, the paid-aggregator cache, employer postings, even the
    // curated fallback list) gets tagged for free too, with zero special-
    // casing per source.
    atsPlatform: job.atsPlatform ?? detectAtsPlatform(job.applyUrl),
  };
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
    return (data.jobs ?? []).slice(0, 25).map((j: { id: number; title: string; location?: { name?: string }; absolute_url: string; updated_at?: string }) =>
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
        // Greenhouse's board API returns `updated_at` (bumped whenever the
        // posting itself changes, which is the closest thing to a "posted"
        // date it exposes) — real per-job dates instead of a guess.
        postedAt: j.updated_at || undefined,
      })
    );
  } catch {
    return [];
  }
}

type LeverPosting = { id?: string; text?: string; categories?: { location?: string; team?: string }; hostedUrl?: string; applyUrl?: string; createdAt?: number };

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
        // Lever returns `createdAt` as an epoch-millisecond number.
        postedAt: p.createdAt ? new Date(p.createdAt).toISOString() : undefined,
      })
    );
  } catch {
    return [];
  }
}

type AshbyPosting = { id?: string; title?: string; location?: string; jobUrl?: string; applyUrl?: string; publishedAt?: string; publishedDate?: string };

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
        // Ashby's field name has varied across board versions — accept
        // either.
        postedAt: p.publishedAt || p.publishedDate || undefined,
      })
    );
  } catch {
    return [];
  }
}

type RemoteOkJob = { id?: string; slug?: string; position?: string; company?: string; location?: string; url?: string; apply_url?: string; date?: string; epoch?: number };

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
        // RemoteOK gives an ISO `date`, or failing that an `epoch` (seconds).
        postedAt: j.date || (j.epoch ? new Date(j.epoch * 1000).toISOString() : undefined),
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
