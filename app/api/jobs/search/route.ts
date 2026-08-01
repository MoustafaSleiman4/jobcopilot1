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
//   - Careerjet's v4 search API (search.api.careerjet.net/v4/query) — a free
//     API key from careerjet.com/partners/api, HTTP Basic Auth (key as
//     username, empty password). Enabled once CAREERJET_API_KEY is set.
//   - SerpApi's Google Jobs engine (serpapi.com, engine=google_jobs) — this
//     is what actually replaces the old "Search on LinkedIn" outbound button
//     with real inline result cards. It does NOT call LinkedIn directly (that
//     would violate their ToS, same reasoning as above); instead it reads
//     Google's own Jobs search index, which aggregates postings from many
//     boards including LinkedIn, Indeed, Bayt, etc. Enabled once SERPAPI_KEY
//     is set — SerpApi's free tier is 250 searches/month, enough to validate
//     result quality before deciding whether a paid tier is worth it at this
//     app's expected volume. Nothing changes in the UI until that key is
//     set; this source is a silent no-op until then, same pattern as Jooble
//     and Careerjet above.
// A curated fallback list keeps the page populated with real Gulf/Levant
// employer links even before any of those is configured.
//
// The Greenhouse/Lever/Ashby board tokens below were verified individually
// (each one checked for a live, non-empty board with Gulf/Levant/MEA-based
// listings) rather than guessed — most well-known regional companies
// actually run on other ATS platforms (Workable, Zoho Recruit, Teamtailor,
// in-house portals) that don't expose a public read API, which is why this
// list is short rather than exhaustive. ~25 other plausible Gulf/MENA
// companies (Property Finder, Tabby, Huspy, Kitopi, Trella, Vezeeta, Salla,
// etc.) were checked and excluded because their public board now 404s
// (migrated ATS or closed the public board) — better to leave them out than
// ship a slug that silently returns nothing.
//
// Correction from an earlier version of this file: Ziina's board is on
// Ashby, not Greenhouse — the Greenhouse slug 404s and was silently
// returning zero jobs for that company this whole time.
const GREENHOUSE_BOARDS = [
  { slug: "careem", host: "boards-api.greenhouse.io" },
  { slug: "tamara", host: "boards-api.greenhouse.io" },
];
// "econstruct" (e.construct, an engineering firm with Cairo and Dubai
// offices) and "soum" (a Riyadh-based re-commerce marketplace) were both
// individually verified via their live Lever feeds to have real, current
// Gulf/Levant listings — soum in particular is the first real source with
// actual Riyadh/Saudi Arabia postings, which the curated fallback list
// alone couldn't provide. Lever's board slug is case-sensitive and often
// lowercase/abbreviated, so (like Greenhouse/Ashby above) it's paired with
// its own display name rather than shown to users as-is.
const LEVER_BOARDS = [
  { slug: "Yassir", company: "Yassir" },
  { slug: "econstruct", company: "e.construct" },
  { slug: "soum", company: "Soum" },
  { slug: "Bosta", company: "Bosta" }, // Egypt logistics, ~20 live listings
  { slug: "rewaatech", company: "Rewaa" }, // Riyadh retail/inventory SaaS
];
const ASHBY_BOARDS = [
  { slug: "leantech", company: "Lean Technologies" },
  { slug: "ziina", company: "Ziina" }, // moved here from Greenhouse — see note above
  { slug: "checkout.com", company: "Checkout.com" }, // several Saudi/UAE-based roles
  { slug: "mexdigital", company: "MultiBank Group" },
  { slug: "thndr", company: "Thndr" }, // Egyptian fintech
  { slug: "rain", company: "Rain" }, // Bahrain-based, CBB-regulated crypto exchange
];

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
    return (data.jobs ?? []).slice(0, 25).map((j: { id: number; title: string; location?: { name?: string }; absolute_url: string }) =>
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

async function fetchLeverJobs(slug: string, company: string): Promise<Job[]> {
  try {
    const res = await fetch(`https://api.lever.co/v0/postings/${slug}?mode=json`, {
      next: { revalidate: 3600 },
    });
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

type JoobleJob = {
  id?: string | number;
  title?: string;
  company?: string;
  location?: string;
  link?: string;
};

async function fetchJoobleJobsPage(
  apiKey: string,
  keywords: string,
  location: string,
  page: number
): Promise<Job[]> {
  try {
    const res = await fetch(`https://jooble.org/api/${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // ResultOnPage explicitly asks Jooble for more results per call — this
      // used to rely on whatever Jooble's unstated default page size is and
      // then truncate to 8, which meant the single biggest real source of
      // volume in this whole route was capped well below what it could
      // actually return. 25 per (query × location) combination, across up
      // to 9 locations, is the main lever for going from "a handful of
      // jobs" to genuinely broad Gulf/Levant coverage once JOOBLE_API_KEY
      // is configured.
      body: JSON.stringify({ keywords, location, ResultOnPage: 25, page }),
      next: { revalidate: 1800 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const jobs: JoobleJob[] = data.jobs ?? [];
    return jobs.map((j, idx) =>
      finalize({
        id: `jooble-${location}-p${page}-${j.id ?? idx}`,
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

// Jooble supports a documented `page` parameter for pagination, on top of
// `ResultOnPage` — pulling 2 pages per (keyword × location) combination
// roughly doubles Jooble's yield (up to 50 per location instead of 25)
// without needing an undocumented, unverified ResultOnPage ceiling. This is
// the single biggest source of real volume in this whole route once
// JOOBLE_API_KEY is actually set.
async function fetchJoobleJobs(apiKey: string, keywords: string, location: string): Promise<Job[]> {
  const [page1, page2] = await Promise.all([
    fetchJoobleJobsPage(apiKey, keywords, location, 1),
    fetchJoobleJobsPage(apiKey, keywords, location, 2),
  ]);
  return [...page1, ...page2];
}

type CareerjetJob = {
  url?: string;
  title?: string;
  company?: string;
  locations?: string;
};

// Careerjet is a second, independent job aggregator (separate company from
// Jooble, sourcing from a different mix of boards/employers) with confirmed
// locale support for the UAE, Saudi Arabia, Kuwait, Oman, and Qatar — real
// redundancy rather than being 100% dependent on Jooble alone.
//
// Corrected this session: Careerjet has retired the old affid-based
// `public.api.careerjet.net/search` endpoint this integration was originally
// built against (that older client-library pattern is no longer what their
// own partner API page documents) in favor of a v4 API at
// `search.api.careerjet.net/v4/query`, authenticated with HTTP Basic Auth
// (the API key as the username, empty password) rather than an `affid` query
// param — confirmed directly against careerjet.com/partners/api. The env var
// is now CAREERJET_API_KEY (a free key from the same signup page), not
// CAREERJET_AFFID. Still gracefully does nothing until that's set, same
// no-op-until-configured pattern as Jooble/SerpApi. NOTE: still not
// live-tested end to end (this sandbox's network policy blocks
// careerjet.net), so verify a real response shape once CAREERJET_API_KEY is
// set, before relying on this as a primary source.
async function fetchCareerjetJobs(apiKey: string, keywords: string, locale: string): Promise<Job[]> {
  try {
    const params = new URLSearchParams({
      keywords,
      user_ip: "0.0.0.0",
      user_agent: "Mozilla/5.0 (GulfJobCopilot server-side job search)",
      locale_code: locale,
      page_size: "25",
    });
    const res = await fetch(`https://search.api.careerjet.net/v4/query?${params.toString()}`, {
      headers: {
        // Base64("<api-key>:") — Careerjet's v4 API uses the key as the Basic
        // Auth username with an empty password, not a bearer token.
        Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
      },
      next: { revalidate: 1800 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const jobs: CareerjetJob[] = data.jobs ?? [];
    return jobs.map((j, idx) =>
      finalize({
        id: `careerjet-${locale}-${idx}`,
        title: j.title ?? "Untitled role",
        company: j.company || "—",
        location: j.locations || locale,
        applyUrl: j.url ?? "#",
        applyType: "external" as const,
      })
    );
  } catch {
    return [];
  }
}

// Careerjet locale codes with confirmed Gulf coverage (en_AE, en_SA, en_KW,
// en_OM, en_QA) — Bahrain, Lebanon, Jordan, and Egypt aren't in Careerjet's
// locale list, so those keep relying on Jooble + the curated fallback list.
const CAREERJET_LOCALES = ["en_AE", "en_SA", "en_KW", "en_OM", "en_QA"];

type SerpApiJobResult = {
  job_id?: string;
  title?: string;
  company_name?: string;
  location?: string;
  via?: string; // e.g. "via LinkedIn", "via Indeed" — the original source board
  apply_options?: { title?: string; link?: string }[];
  share_link?: string;
};

// SerpApi's Google Jobs engine — the source that lets a Gulf/MEA job seeker
// see real, live postings (including ones Google has indexed from LinkedIn)
// as native cards on our own jobs page, with no navigation to linkedin.com
// required just to see what's out there. Clicking "Apply" still goes to
// wherever the original posting actually lives (LinkedIn, the employer's own
// site, Indeed, etc.) — same as every other source in this file — because
// actually submitting an application on a third-party site can only happen
// on that site; this route only ever fetches indexed search results, never
// authenticated or account-specific data.
async function fetchSerpApiJobs(apiKey: string, keywords: string, location: string): Promise<Job[]> {
  try {
    const params = new URLSearchParams({
      engine: "google_jobs",
      q: keywords ? `${keywords} jobs in ${location}` : `jobs in ${location}`,
      location,
      api_key: apiKey,
      hl: "en",
    });
    const res = await fetch(`https://serpapi.com/search.json?${params.toString()}`, {
      next: { revalidate: 1800 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const results: SerpApiJobResult[] = data.jobs_results ?? [];
    return results.map((j, idx) => {
      // Prefer a direct apply link if SerpApi surfaced one; fall back to the
      // Google Jobs share link (still a real, working destination) rather
      // than a dead "#" — every other source in this file always resolves
      // to a real URL, so this one should too.
      const applyUrl = j.apply_options?.[0]?.link ?? j.share_link ?? "#";
      // "via" comes back as "via LinkedIn" / "via Indeed" / etc. — stripped
      // down to just the board name so it can be shown as a small source
      // badge on the card without the leading "via ".
      const sourceBoard = j.via?.replace(/^via\s+/i, "").trim();
      return finalize({
        id: `serpapi-${location}-${j.job_id ?? idx}`,
        title: j.title ?? "Untitled role",
        company: (j.company_name || sourceBoard) || "—",
        location: j.location || location,
        applyUrl,
        applyType: "external" as const,
      });
    });
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

  const careerjetApiKey = process.env.CAREERJET_API_KEY;
  if (careerjetApiKey) {
    // Country name -> Careerjet locale code, so the same locationFilter used
    // for Jooble/curated filtering also narrows which Careerjet locales get
    // queried.
    const COUNTRY_TO_CAREERJET_LOCALE: Record<string, string> = {
      "United Arab Emirates": "en_AE",
      "Saudi Arabia": "en_SA",
      Kuwait: "en_KW",
      Oman: "en_OM",
      Qatar: "en_QA",
    };
    const careerjetLocales = locationFilter
      ? [COUNTRY_TO_CAREERJET_LOCALE[locationFilter]].filter(Boolean)
      : CAREERJET_LOCALES;
    try {
      const results = await Promise.all(
        careerjetLocales.map((locale) => fetchCareerjetJobs(careerjetApiKey, qRaw, locale))
      );
      realJobs = realJobs.concat(results.flat());
    } catch {
      // ignore — fall through to other sources
    }
  }

  const serpApiKey = process.env.SERPAPI_KEY;
  if (serpApiKey) {
    // Same locationFilter-narrowing logic as Jooble above: if the user picked
    // one country, only spend one SerpApi call on it instead of nine.
    const serpApiLocations = locationFilter ? [locationFilter] : LOCATIONS;
    try {
      const results = await Promise.all(
        serpApiLocations.map((loc) => fetchSerpApiJobs(serpApiKey, qRaw, loc))
      );
      realJobs = realJobs.concat(results.flat());
    } catch {
      // ignore — fall through to other sources
    }
  }

  try {
    const [greenhouseResults, leverResults, ashbyResults] = await Promise.all([
      Promise.all(GREENHOUSE_BOARDS.map((b) => fetchGreenhouseJobs(b.slug, b.host))),
      Promise.all(LEVER_BOARDS.map((b) => fetchLeverJobs(b.slug, b.company))),
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
    // Raised from 60 now that real sources (Jooble pagination, more verified
    // ATS boards, Careerjet) can genuinely return enough volume to make a
    // higher cap meaningful — 60 was leaving real results on the table
    // whenever more than one source returned a healthy number of jobs.
    jobs: jobs.slice(0, 120),
    industries: INDUSTRY_KEYWORDS.map(([name]) => name).concat("Other"),
    locations: LOCATIONS,
    workTypes: ["remote", "hybrid", "onsite"] satisfies WorkType[],
  });
}
