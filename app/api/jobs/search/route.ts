import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  applyUrl: string;
  applyType: "one_click" | "external";
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
//   - Greenhouse's public job board API (boards-api.greenhouse.io) — free,
//     no key, explicitly public.
//   - Jooble's REST API (jooble.org/api) — a licensed job-search aggregator
//     with a free developer key, covering the UAE, Saudi Arabia, Qatar,
//     Kuwait, Bahrain and more. Enabled once JOOBLE_API_KEY is set.
// A curated fallback list keeps the page populated with real Gulf/Levant
// employer links even before either of those is configured.

const GREENHOUSE_BOARDS = ["doordash", "robinhood", "coinbase", "discord"];

// Locations queried against Jooble to cover the app's core region. Jooble
// aggregates from local job boards per-country; not every country in our
// audience (e.g. Lebanon, Jordan) has a dedicated jooble.org subdomain, but
// the API still accepts them as a free-text location.
const JOOBLE_LOCATIONS = [
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

const FALLBACK_JOBS: Job[] = [
  {
    id: "demo-1",
    title: "Growth Marketing Manager",
    company: "Careem",
    location: "Dubai, UAE",
    applyUrl: "https://www.careem.com/careers",
    applyType: "external",
  },
  {
    id: "demo-2",
    title: "Product Analyst",
    company: "STC",
    location: "Riyadh, Saudi Arabia",
    applyUrl: "https://www.stc.com.sa/careers",
    applyType: "external",
  },
  {
    id: "demo-3",
    title: "Senior Frontend Engineer",
    company: "noon",
    location: "Dubai, UAE (Remote)",
    applyUrl: "https://www.noon.com/careers",
    applyType: "external",
  },
  {
    id: "demo-4",
    title: "Data Analyst",
    company: "Aramco Digital",
    location: "Dhahran, Saudi Arabia",
    applyUrl: "https://www.aramco.com/careers",
    applyType: "external",
  },
  {
    id: "demo-5",
    title: "Relationship Manager",
    company: "Bank Audi",
    location: "Beirut, Lebanon",
    applyUrl: "https://www.bankaudigroup.com/careers",
    applyType: "external",
  },
  {
    id: "demo-6",
    title: "Operations Lead",
    company: "Talabat",
    location: "Amman, Jordan (Remote)",
    applyUrl: "https://www.talabat.com/careers",
    applyType: "external",
  },
  {
    id: "demo-7",
    title: "Supply Chain Analyst",
    company: "Americana Group",
    location: "Cairo, Egypt",
    applyUrl: "https://www.americana-group.com/careers",
    applyType: "external",
  },
];

async function fetchGreenhouseJobs(board: string): Promise<Job[]> {
  try {
    const res = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=false`,
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.jobs ?? []).slice(0, 5).map((j: { id: number; title: string; location?: { name?: string }; absolute_url: string }) => ({
      id: `${board}-${j.id}`,
      title: j.title,
      company: board[0].toUpperCase() + board.slice(1),
      location: j.location?.name ?? "Remote",
      applyUrl: j.absolute_url,
      // Greenhouse's public job board API is read-only; real submission requires
      // the (auth'd) Job Board API — so this stays a "smart apply" deep link.
      applyType: "external" as const,
    }));
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
    return jobs.slice(0, 8).map((j, idx) => ({
      id: `jooble-${location}-${j.id ?? idx}`,
      title: j.title ?? "Untitled role",
      company: j.company || "—",
      location: j.location || location,
      applyUrl: j.link ?? "#",
      // Jooble is an aggregator: the link goes to the original posting (its
      // own site or the employer's), so this is always a smart-apply deep
      // link, never an in-app auto-submit.
      applyType: "external" as const,
    }));
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const qRaw = request.nextUrl.searchParams.get("q") ?? "";
  const q = qRaw.toLowerCase();

  let realJobs: Job[] = [];

  const joobleKey = process.env.JOOBLE_API_KEY;
  if (joobleKey) {
    try {
      const results = await Promise.all(
        JOOBLE_LOCATIONS.map((loc) => fetchJoobleJobs(joobleKey, qRaw, loc))
      );
      realJobs = realJobs.concat(results.flat());
    } catch {
      // ignore — fall through to other sources
    }
  }

  try {
    const results = await Promise.all(GREENHOUSE_BOARDS.map(fetchGreenhouseJobs));
    realJobs = realJobs.concat(results.flat());
  } catch {
    // ignore — fall through to other sources
  }

  // Always blend in the curated Gulf/Levant fallback list alongside whatever
  // real listings came back, rather than replacing it. Previously this
  // *replaced* the curated list the moment any real job showed up — so a
  // handful of unrelated Greenhouse results (generic global tech companies,
  // not Gulf/MEA employers) would silently push out every relevant curated
  // listing, which is why the page could show as few as ~10 jobs total with
  // none of them regionally relevant.
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
    jobs = jobs.filter(
      (j) => j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q)
    );
  }

  return NextResponse.json({ jobs: jobs.slice(0, 60) });
}
