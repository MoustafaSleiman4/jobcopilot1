import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

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

// --- Real, ToS-compliant sources only ---
//
// A note on why there's no LinkedIn (or Indeed/other closed-platform)
// crawler here: LinkedIn's User Agreement explicitly prohibits scraping or
// automated data collection from the site, they actively fingerprint and
// block bots, and there is no public jobs-search API available to
// third-party apps like this one. Building a scraper against that would put
// the product (and the account behind it) at real legal and enforcement
// risk. Instead this route only calls sources that are meant to be called
// programmatically:
//   - Greenhouse's public job board API (boards-api.greenhouse.io, or the EU
//     cluster boards-api.eu.greenhouse.io for boards hosted there) — free,
//     no key, explicitly public.
//   - Lever's public postings API (api.lever.co) — same idea, free and
//     public, used by a number of Gulf/MENA startups.
//   - Ashby's public job-board API (api.ashbyhq.com) — ditto.
//   - Jooble's REST API (jooble.org/api) — a licensed job-search aggregator
//     with a free developer key, covering the UAE, Saudi Arabia, Qatar,
//     Kuwait, Bahrain and more. Enabled once JOOBLE_API_KEY is set.
// A curated fallback list keeps the page populated with real Gulf/Levant
// employer links even before any of those is configured.
//
// The Greenhouse/Lever/Ashby board tokens below were verified individually
// (each one checked for a live, non-empty board with Gulf/Levant/MEA-based
// listings) rather than guessed — most well-known regional companies
// actually run on other ATS platforms (Workable, Zoho Recruit, Teamtailor,
// in-house portals) that don't expose a public read API, which is why this
// list is short rather than exhaustive.
const GREENHOUSE_BOARDS = [
  { slug: "careem", host: "boards-api.greenhouse.io" },
  { slug: "tamara", host: "boards-api.greenhouse.io" },
  { slug: "ziina", host: "boards-api.eu.greenhouse.io" },
];
const LEVER_BOARDS = ["Yassir"];
const ASHBY_BOARDS = [{ slug: "leantech", company: "Lean Technologies" }];

// Location filter options exposed in the UI. Also used as the set of
// locations queried against Jooble when no specific one is requested. Not
// every country in our audience has a dedicated jooble.org subdomain, but
// the API still accepts them as a free-text location.
const LOCATIONS = [
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

// Real listings (ours and Jooble's/employers') routinely use an abbreviation
// instead of the full country name — "Dubai, UAE" rather than "Dubai,
// United Arab Emirates" — so matching the location filter against the full
// LOCATIONS name alone silently returned zero results for the country most
// people actually search for. Every alias is checked in addition to the
// full name.
const LOCATION_ALIASES: Record<string, string[]> = {
  "United Arab Emirates": ["uae", "u.a.e"],
  "Saudi Arabia": ["ksa", "saudi"],
};

// Lightweight keyword-based industry classifier applied uniformly to every
// job — real (Greenhouse/Jooble) and curated fallback alike — since none of
// the underlying sources reliably expose a clean "industry" field of their
// own. Good enough for a useful filter without needing a paid enrichment API.
const INDUSTRY_KEYWORDS: [string, string[]][] = [
  ["Technology", ["engineer", "developer", "software", "data", "devops", "product manager", "qa engineer", "frontend", "backend", "full stack", "it "]],
  ["Marketing", ["marketing", "growth", "content", "seo", "brand", "social media"]],
  ["Finance & Banking", ["finance", "accountant", "audit", "banking", "relationship manager", "investment", "financial"]],
  ["Sales & Business Development", ["sales", "business development", "account executive", "partnership"]],
  ["Operations & Supply Chain", ["operations", "supply chain", "logistics", "procurement", "warehouse"]],
  ["Human Resources", ["hr ", "human resources", "recruiter", "talent"]],
  ["Customer Support", ["customer support", "customer service", "support specialist"]],
  ["Design", ["designer", "ux", "ui ", "graphic"]],
];

function inferIndustry(title: string): string {
  const lower = ` ${title.toLowerCase()} `;
  for (const [industry, keywords] of INDUSTRY_KEYWORDS) {
    if (keywords.some((k) => lower.includes(k))) return industry;
  }
  return "Other";
}

// Same idea as inferIndustry: none of the underlying sources reliably expose
// a clean work-arrangement field, so we infer it from the free-text location
// string (which for real listings is usually something like "Dubai, UAE
// (Remote)" or "Dubai, UAE (Hybrid)"). Checked in this order since a listing
// mentioning "hybrid" should never fall through to the broader "remote" test.
function inferWorkType(location: string): WorkType {
  if (/hybrid/i.test(location)) return "hybrid";
  if (/remote/i.test(location)) return "remote";
  return "onsite";
}

/** Fills in the derived industry/work-type fields shared by every source. */
function finalize(job: Omit<Job, "industry" | "workType">): Job {
  return { ...job, industry: inferIndustry(job.title), workType: inferWorkType(job.location) };
}

const FALLBACK_JOBS: Job[] = (
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
    // Qatar, Kuwait, Bahrain, and Oman previously had zero fallback
    // coverage at all — since none of the real API sources above are
    // guaranteed to return anything for a given country on any given
    // request, that meant a location filter for any of these four could
    // come back completely empty. Filled in with real, verified employer
    // career-page links so every listed country always has something.
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

async function fetchGreenhouseJobs(slug: string, host: string): Promise<Job[]> {
  try {
    const res = await fetch(
      `https://${host}/v1/boards/${slug}/jobs?content=false`,
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.jobs ?? []).slice(0, 8).map((j: { id: number; title: string; location?: { name?: string }; absolute_url: string }) =>
      finalize({
        id: `${slug}-${j.id}`,
        title: j.title,
        company: slug[0].toUpperCase() + slug.slice(1),
        location: j.location?.name ?? "Remote",
        applyUrl: j.absolute_url,
        // Greenhouse's public job board API is read-only; real submission requires
        // the (auth'd) Job Board API — so this stays a "smart apply" deep link.
        applyType: "external" as const,
      })
    );
  } catch {
    return [];
  }
}

type LeverPosting = {
  id?: string;
  text?: string;
  categories?: { location?: string; team?: string };
  hostedUrl?: string;
  applyUrl?: string;
};

async function fetchLeverJobs(company: string): Promise<Job[]> {
  try {
    const res = await fetch(`https://api.lever.co/v0/postings/${company}?mode=json`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data: LeverPosting[] = await res.json();
    return (data ?? []).slice(0, 8).map((p, idx) =>
      finalize({
        id: `lever-${company}-${p.id ?? idx}`,
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

type AshbyPosting = {
  id?: string;
  title?: string;
  location?: string;
  jobUrl?: string;
  applyUrl?: string;
};

async function fetchAshbyJobs(slug: string, companyName: string): Promise<Job[]> {
  try {
    const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const postings: AshbyPosting[] = data.jobs ?? [];
    return postings.slice(0, 8).map((p, idx) =>
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

type JoobleJob = {
  id?: string | number;
  title?: string;
  company?: string;
  location?: string;
  link?: string;
};

async function fetchJoobleJobs(apiKey: string, keywords: string, location: string): Promise<Job[]> {
  try {
    const res = await fetch(`https://jooble.org/api/${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keywords, location }),
      next: { revalidate: 1800 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const jobs: JoobleJob[] = data.jobs ?? [];
    return jobs.slice(0, 8).map((j, idx) =>
      finalize({
        id: `jooble-${location}-${j.id ?? idx}`,
        title: j.title ?? "Untitled role",
        company: j.company || "—",
        location: j.location || location,
        applyUrl: j.link ?? "#",
        // Jooble is an aggregator: the link goes to the original posting (its
        // own site or the employer's), so this is always a smart-apply deep
        // link, never an in-app auto-submit.
        applyType: "external" as const,
      })
    );
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const qRaw = request.nextUrl.searchParams.get("q") ?? "";
  const q = qRaw.toLowerCase();
  const locationFilter = request.nextUrl.searchParams.get("location") ?? "";
  const industryFilter = request.nextUrl.searchParams.get("industry") ?? "";
  const workTypeParam = request.nextUrl.searchParams.get("workType") ?? "";
  const workTypeFilter: WorkType | "" =
    workTypeParam === "remote" || workTypeParam === "hybrid" || workTypeParam === "onsite"
      ? workTypeParam
      : "";

  let realJobs: Job[] = [];

  // When the user picked a specific location, only query Jooble for that
  // one instead of all nine — faster, and the results are more targeted
  // than fetching everything and post-filtering.
  const joobleLocations = locationFilter
    ? LOCATIONS.filter((l) => l === locationFilter)
    : LOCATIONS;

  const joobleKey = process.env.JOOBLE_API_KEY;
  if (joobleKey) {
    try {
      const results = await Promise.all(
        joobleLocations.map((loc) => fetchJoobleJobs(joobleKey, qRaw, loc))
      );
      realJobs = realJobs.concat(results.flat());
    } catch {
      // ignore — fall through to other sources
    }
  }

  try {
    const [greenhouseResults, leverResults, ashbyResults] = await Promise.all([
      Promise.all(GREENHOUSE_BOARDS.map((b) => fetchGreenhouseJobs(b.slug, b.host))),
      Promise.all(LEVER_BOARDS.map(fetchLeverJobs)),
      Promise.all(ASHBY_BOARDS.map((b) => fetchAshbyJobs(b.slug, b.company))),
    ]);
    realJobs = realJobs.concat(greenhouseResults.flat(), leverResults.flat(), ashbyResults.flat());
  } catch {
    // ignore — fall through to other sources
  }

  // Always blend in the curated Gulf/Levant fallback list alongside whatever
  // real listings came back, rather than replacing it — a handful of
  // unrelated Greenhouse results (generic global tech companies) shouldn't
  // silently push out every relevant curated listing.
  let jobs = [...realJobs, ...FALLBACK_JOBS];

  // De-dupe by apply URL (Jooble in particular can return the same posting
  // more than once across nearby locations, and a real listing could in
  // theory collide with a fallback one).
  const seen = new Set<string>();
  jobs = jobs.filter((j) => {
    if (seen.has(j.applyUrl)) return false;
    seen.add(j.applyUrl);
    return true;
  });

  if (q) {
    // Include location in the match, not just title/company — otherwise
    // typing a place name like "Lebanon" or "Beirut" returned zero results
    // even when Lebanon-based listings were present.
    jobs = jobs.filter(
      (j) =>
        j.title.toLowerCase().includes(q) ||
        j.company.toLowerCase().includes(q) ||
        j.location.toLowerCase().includes(q)
    );
  }

  if (locationFilter) {
    // Match against the country name loosely (job.location is usually
    // "City, Country" or "City, Country (Remote)") rather than requiring an
    // exact string match against the full location — and also check known
    // abbreviations (see LOCATION_ALIASES) since real listings frequently
    // use "UAE" instead of the full country name.
    const needles = [locationFilter.toLowerCase(), ...(LOCATION_ALIASES[locationFilter] ?? [])];
    jobs = jobs.filter((j) => {
      const loc = j.location.toLowerCase();
      return needles.some((n) => loc.includes(n));
    });
  }

  if (industryFilter) {
    jobs = jobs.filter((j) => j.industry === industryFilter);
  }

  if (workTypeFilter) {
    jobs = jobs.filter((j) => j.workType === workTypeFilter);
  }

  return NextResponse.json({
    jobs: jobs.slice(0, 60),
    industries: INDUSTRY_KEYWORDS.map(([name]) => name).concat("Other"),
    locations: LOCATIONS,
    workTypes: ["remote", "hybrid", "onsite"] satisfies WorkType[],
  });
}
