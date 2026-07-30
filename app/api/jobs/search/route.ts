import { NextRequest, NextResponse } from "next/server";

type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  applyUrl: string;
  applyType: "one_click" | "external";
};

// A handful of real public Greenhouse job boards (boards-api.greenhouse.io is a
// free, public, ToS-compliant API — no key needed) used as live demo data.
// See plan doc §4 for why this is the legitimate path vs. scraping/auto-submit bots.
const GREENHOUSE_BOARDS = ["doordash", "robinhood", "coinbase", "discord"];

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
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.toLowerCase() ?? "";

  let jobs: Job[] = [];
  try {
    const results = await Promise.all(GREENHOUSE_BOARDS.map(fetchGreenhouseJobs));
    jobs = results.flat();
  } catch {
    jobs = [];
  }

  if (jobs.length === 0) {
    jobs = FALLBACK_JOBS;
  }

  if (q) {
    jobs = jobs.filter(
      (j) => j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q)
    );
  }

  return NextResponse.json({ jobs });
}
