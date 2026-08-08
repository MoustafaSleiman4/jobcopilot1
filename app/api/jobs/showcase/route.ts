import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Powers the homepage's 3D "jobs showcase" animation (components/
// JobsShowcase.tsx) — a lightweight, cacheable read of public.retrieved_jobs
// meant purely to impress a first-time visitor with real scale ("thousands
// of live roles"), not to be a real search. Deliberately its own route
// rather than reusing /api/jobs/search: that route does auth, per-user
// quota, resume scoring, and pulls in every job source (Greenhouse/Lever/
// Ashby/RemoteOK/company portal jobs) — all unnecessary work for a page that
// just wants a random handful of titles/companies and a few counts, and
// would also drag the homepage's cold-start cost up for anonymous visitors.
//
// retrieved_jobs has RLS enabled with zero policies defined (confirmed via
// Supabase), so only the service-role admin client can read it at all — the
// browser's anon client would silently get zero rows. That's why this has
// to be a server route rather than a direct client-side Supabase query.

export type ShowcaseJob = {
  title: string;
  company: string;
  location: string;
  industry: string;
};

// Small enough to be cheap, big enough that a random slice still looks
// varied across repeated loads/visitors.
const SAMPLE_POOL_SIZE = 200;
const SHOWCASE_COUNT = 24;

// PostgREST caps a single request at 1000 rows regardless of .limit() (see
// the same note in lib/jobCache.ts) — paginate the company-column read so
// the distinct-company count reflects the whole active table, not just its
// first page.
const COMPANY_PAGE_SIZE = 1000;
const COMPANY_PAGE_CAP = 10;

function shuffle<T>(items: T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export async function GET() {
  try {
    const admin = createAdminClient();
    const nowIso = new Date().toISOString();

    const [sampleRes, totalRes, companiesResult] = await Promise.all([
      admin
        .from("retrieved_jobs")
        .select("title, company, location, industry")
        .gt("expires_at", nowIso)
        .limit(SAMPLE_POOL_SIZE),
      admin
        .from("retrieved_jobs")
        .select("id", { count: "exact", head: true })
        .gt("expires_at", nowIso),
      (async () => {
        const companies = new Set<string>();
        for (let page = 0; page < COMPANY_PAGE_CAP; page++) {
          const from = page * COMPANY_PAGE_SIZE;
          const to = from + COMPANY_PAGE_SIZE - 1;
          const { data, error } = await admin
            .from("retrieved_jobs")
            .select("company")
            .gt("expires_at", nowIso)
            .range(from, to);
          if (error || !data) break;
          for (const row of data as { company: string }[]) {
            if (row.company) companies.add(row.company);
          }
          if (data.length < COMPANY_PAGE_SIZE) break;
        }
        return companies.size;
      })(),
    ]);

    const pool = (sampleRes.data ?? []) as ShowcaseJob[];
    const industries = new Set(pool.map((j) => j.industry).filter(Boolean));
    const jobs = shuffle(pool).slice(0, SHOWCASE_COUNT);

    return NextResponse.json(
      {
        jobs,
        total: totalRes.count ?? pool.length,
        companies: companiesResult,
        // Sampled from a 200-row pool rather than the full table, so this
        // is a lower bound on real industry variety, not exact — fine for a
        // marketing stat, not shown as a precise figure anywhere.
        industries: Math.max(industries.size, 1),
      },
      { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" } }
    );
  } catch {
    // Admin client not configured, or the table/migration isn't there yet —
    // the client component already ships its own static fallback data, so
    // just report failure rather than a 500 that could surface visibly.
    return NextResponse.json({ jobs: [], total: 0, companies: 0, industries: 0 }, { status: 200 });
  }
}
