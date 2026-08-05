import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchFreeSourceJobs, LOCATION_ALIASES, type Job } from "@/lib/jobSources";
import { generateCoverLetter } from "@/lib/coverLetter";
import type { StructuredResume } from "@/lib/resume-types";

export const runtime = "nodejs";
// Cron runs can take a while once there are many opted-in users (one AI
// cover-letter call per queued match) — raise the default serverless
// timeout rather than risk a partial run getting killed mid-user.
export const maxDuration = 300;

// Hard ceiling per user per run, independent of their configured daily_cap
// (which only goes up to 20 per the DB check constraint) — a second safety
// net against one misconfigured or malicious `daily_cap` write turning into
// a runaway AI-spend loop.
const MAX_MATCHES_PER_USER_PER_RUN = 20;

type Preferences = {
  user_id: string;
  enabled: boolean;
  daily_cap: number;
  keywords: string;
  location: string;
  work_type: "remote" | "hybrid" | "onsite" | null;
  excluded_companies: string[];
};

type ResumeRow = { content: { structured?: StructuredResume } | null };

/**
 * Lightweight, free, deterministic match score (0-100) — NOT an AI call.
 * Calling the AI once per candidate job per user, every day, across every
 * opted-in user would be slow and expensive at any real scale; this keyword
 * overlap heuristic is cheap enough to run against hundreds of jobs per user
 * per cron run, and only the jobs that actually get queued (top N) pay for
 * a real AI cover-letter call.
 */
function scoreJob(job: Job, resume: StructuredResume): number {
  const resumeWords = new Set(
    [
      resume.title,
      ...(resume.skills ?? []),
      ...(resume.experience ?? []).flatMap((e) => [e.role, e.company]),
    ]
      .join(" ")
      .toLowerCase()
      .split(/[^a-z0-9+#.]+/)
      .filter((w) => w.length > 2)
  );
  if (resumeWords.size === 0) return 50; // no resume signal — neutral score, don't zero everything out

  const jobWords = `${job.title} ${job.industry}`
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .filter((w) => w.length > 2);
  if (jobWords.length === 0) return 0;

  let hits = 0;
  for (const w of jobWords) {
    if (resumeWords.has(w)) hits += 1;
  }
  // Title-word overlap ratio, scaled to 0-100. A resume titled "Senior
  // Product Manager" scores highest against job titles that share those
  // words, without needing an AI call to tell us that.
  return Math.round((hits / jobWords.length) * 100);
}

function matchesPreferences(job: Job, prefs: Preferences): boolean {
  if (prefs.excluded_companies?.some((c) => job.company.toLowerCase() === c.toLowerCase())) return false;
  if (prefs.work_type && job.workType !== prefs.work_type) return false;
  if (prefs.location) {
    const needles = [prefs.location.toLowerCase(), ...(LOCATION_ALIASES[prefs.location] ?? [])];
    const loc = job.location.toLowerCase();
    if (!needles.some((n) => loc.includes(n))) return false;
  }
  if (prefs.keywords.trim()) {
    const kw = prefs.keywords.toLowerCase();
    const hay = `${job.title} ${job.company}`.toLowerCase();
    // Loose OR match across comma/space-separated keywords — same
    // permissiveness as a free-text search box, not a strict AND filter
    // that could silently return zero matches most days.
    const terms = kw.split(/[,\s]+/).filter(Boolean);
    if (terms.length > 0 && !terms.some((term) => hay.includes(term))) return false;
  }
  return true;
}

export async function GET(request: NextRequest) {
  // Vercel Cron calls this on schedule (see vercel.json). CRON_SECRET
  // protects it from being triggered by anyone who finds the URL — set it in
  // Vercel's project env vars and Vercel automatically sends it as a Bearer
  // token on scheduled invocations. Fails open (same convention as every
  // other optional-migration/optional-secret check in this repo) if it
  // isn't set yet, rather than a cron feature silently 401ing forever with
  // no obvious cause.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const admin = createAdminClient();

  const { data: prefsRows, error: prefsError } = await admin
    .from("auto_apply_preferences")
    .select("user_id, enabled, daily_cap, keywords, location, work_type, excluded_companies")
    .eq("enabled", true);

  if (prefsError) {
    return NextResponse.json({ error: prefsError.message }, { status: 500 });
  }

  const preferences = (prefsRows ?? []) as Preferences[];
  if (preferences.length === 0) {
    return NextResponse.json({ processed: 0, queued: 0 });
  }

  // Fetched once and reused across every user this run — the free sources
  // (Greenhouse/Lever/Ashby/RemoteOK + curated fallback) return the same
  // listings regardless of who's asking, so there's no reason to refetch
  // per user.
  const candidateJobs = await fetchFreeSourceJobs();

  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);

  let totalQueued = 0;

  for (const prefs of preferences) {
    try {
      const { count: queuedToday } = await admin
        .from("auto_apply_queue")
        .select("id", { count: "exact", head: true })
        .eq("user_id", prefs.user_id)
        .gte("created_at", startOfToday.toISOString());

      const remainingCapToday = prefs.daily_cap - (queuedToday ?? 0);
      if (remainingCapToday <= 0) continue;

      const { data: resumeRow } = await admin
        .from("resumes")
        .select("content")
        .eq("user_id", prefs.user_id)
        .order("is_primary", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle<ResumeRow>();
      const structured = resumeRow?.content?.structured;
      if (!structured || !structured.fullName) continue; // nothing to match/write a cover letter against yet

      const [{ data: appliedRows }, { data: queuedRows }] = await Promise.all([
        admin.from("applications").select("source_job_id").eq("user_id", prefs.user_id).not("source_job_id", "is", null),
        admin.from("auto_apply_queue").select("source_job_id").eq("user_id", prefs.user_id),
      ]);
      const seenIds = new Set<string>([
        ...(appliedRows ?? []).map((r) => r.source_job_id as string),
        ...(queuedRows ?? []).map((r) => r.source_job_id as string),
      ]);

      const matches = candidateJobs
        .filter((j) => !seenIds.has(j.id) && matchesPreferences(j, prefs))
        .map((j) => ({ job: j, score: scoreJob(j, structured) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, Math.min(remainingCapToday, MAX_MATCHES_PER_USER_PER_RUN));

      for (const { job, score } of matches) {
        let coverLetter = "";
        try {
          coverLetter = await generateCoverLetter({ resume: structured, jobTitle: job.title, company: job.company });
        } catch {
          // Missing resume name etc. — already guarded above, but stay
          // defensive; an empty cover letter still leaves a reviewable
          // queue entry rather than skipping the match entirely.
        }

        const { error: insertError } = await admin.from("auto_apply_queue").insert({
          user_id: prefs.user_id,
          source_job_id: job.id,
          title: job.title,
          company: job.company,
          location: job.location || null,
          apply_url: job.applyUrl,
          source: job.id.split("-")[0] || "unknown",
          industry: job.industry || null,
          work_type: job.workType,
          match_score: score,
          cover_letter: coverLetter,
          status: "pending",
        });
        // 23505 = duplicate (user_id, source_job_id) — another run/tab beat
        // us to it, not a real failure.
        if (!insertError) totalQueued += 1;
      }
    } catch (err) {
      // One user's failure (bad resume shape, transient DB error) shouldn't
      // abort matching for every other opted-in user in this run.
      console.error(`[auto-apply-cron] failed for user ${prefs.user_id}:`, err);
    }
  }

  return NextResponse.json({ processed: preferences.length, queued: totalQueued });
}
