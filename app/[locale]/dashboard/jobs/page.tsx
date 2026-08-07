"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { downloadResumePdf } from "@/lib/resume-pdf";
import type { StructuredResume } from "@/lib/resume-types";
import {
  Search,
  MapPin,
  Building2,
  ExternalLink,
  SlidersHorizontal,
  X,
  Lock,
  Bookmark,
  BookmarkCheck,
  Sparkles,
  Loader2,
  Download,
  Copy,
  Check,
  Mail,
  Phone,
  User,
  CheckSquare,
  Square,
  CheckCircle2,
  AlertTriangle,
  Zap,
  ChevronRight,
  Target,
} from "lucide-react";

// Bulk apply fans out one AI cover-letter generation call per selected job —
// capped so a user can't accidentally fire off 80 simultaneous AI calls (and
// so the results panel stays scannable). Selecting more than this just
// applies to the first MAX_BULK_APPLY and says so, rather than silently
// dropping the rest with no explanation.
const MAX_BULK_APPLY = 15;

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
  // Set server-side (app/api/jobs/search/route.ts) only when the signed-in
  // user has a usable resume on file — same scoreJob() heuristic Auto Apply
  // uses, so "{score}% match" here means the same thing as in the Auto
  // Apply queue. Undefined (not 0) when there's no resume to score against.
  matchScore?: number;
};

type SearchResponse = {
  jobs: Job[];
  total: number;
  offset: number;
  pageSize: number;
  isPro: boolean;
  industries: string[];
  locations: string[];
  workTypes: WorkType[];
  meta: { used: number; limit: number; remaining: number } | null;
};

type ResumeContent = {
  structured?: StructuredResume;
};

type ContactInfo = {
  fullName: string;
  email: string;
  phone: string;
};

const WORK_TYPES: WorkType[] = ["remote", "hybrid", "onsite"];

// lucide-react has no LinkedIn glyph (brand icons were dropped from the
// library), so the recognizable "in" mark is drawn inline here — used only
// as a small badge next to an outbound link to linkedin.com itself, the
// same way any site links out to LinkedIn.
function LinkedInGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.38-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.07 2.07 0 1 1 0-4.13 2.07 2.07 0 0 1 0 4.13ZM7.12 20.45H3.56V9h3.56v11.45Z" />
    </svg>
  );
}

export default function JobSearchPage() {
  const t = useTranslations("dashboard.jobs");
  // `query`/`location`/`industry`/`workType` are the COMMITTED search
  // params — the only ones the fetch effect below depends on, and the only
  // ones actually sent to the API. The `*Draft` twins are what the inputs
  // are bound to. Search used to re-fetch on every keystroke (up to 9
  // SerpApi calls per character typed, once that source was configured),
  // which is a real problem against a metered free-tier quota — now nothing
  // is sent until the Search button is clicked (or Enter pressed), so
  // typing/picking filters is free and only an explicit search spends one
  // of the day's searches (see the server-side daily cap in
  // app/api/jobs/search/route.ts).
  const [query, setQuery] = useState("");
  const [queryDraft, setQueryDraft] = useState("");
  const [location, setLocation] = useState("");
  const [locationDraft, setLocationDraft] = useState("");
  const [industry, setIndustry] = useState("");
  const [industryDraft, setIndustryDraft] = useState("");
  const [workType, setWorkType] = useState<WorkType | "">("");
  const [workTypeDraft, setWorkTypeDraft] = useState<WorkType | "">("");
  // Populated only for a signed-in Pro user once the search-quota migration
  // has been run (see app/api/jobs/search/route.ts) — null means "don't
  // show a quota indicator at all", not "unlimited".
  const [searchQuota, setSearchQuota] = useState<{ used: number; limit: number; remaining: number } | null>(
    null
  );
  // Server-confirmed (see app/api/jobs/search/route.ts's `isPro`) rather than
  // just mirroring the client's own `plan` state — the location/applyUrl
  // masking already happened server-side either way, this only drives which
  // UI (locked vs. real) renders around that data. Defaults to true so the
  // pre-first-fetch render doesn't flash the "limited results" banner.
  const [resultsArePro, setResultsArePro] = useState(true);
  const [jobs, setJobs] = useState<Job[]>([]);
  // The real filtered count from the server (see app/api/jobs/search/
  // route.ts's `total`), not just how many have been loaded onto the page —
  // drives both the "N jobs found" text and whether "Load more" still has
  // anything to fetch.
  const [totalJobs, setTotalJobs] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [industries, setIndustries] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Job Search itself no longer has a whole-page Pro gate (see
  // resultsArePro above, which is what actually drives Pro vs. limited UI —
  // confirmed per-request from the server rather than this client-only
  // profile lookup). `checking` still gates the initial loading flash while
  // the signed-in user's own data (contact info, resume, tracked
  // applications) loads in.
  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [trackedIds, setTrackedIds] = useState<Set<string>>(new Set());
  const [resumeTitle, setResumeTitle] = useState<string | null>(null);
  const [defaultResumeId, setDefaultResumeId] = useState<string | null>(null);
  const [defaultResumeStructured, setDefaultResumeStructured] = useState<StructuredResume | null>(null);
  const [contactInfo, setContactInfo] = useState<ContactInfo | null>(null);
  const [defaultQueryReady, setDefaultQueryReady] = useState(false);
  const [prepareJob, setPrepareJob] = useState<Job | null>(null);
  const [coverLetter, setCoverLetter] = useState("");
  const [generatingLetter, setGeneratingLetter] = useState(false);
  const [letterError, setLetterError] = useState<string | null>(null);
  const [copiedLetter, setCopiedLetter] = useState(false);
  // True when handleApply's window.open() came back null — every browser
  // blocks popups NOT triggered synchronously inside a click handler, so
  // this should stay false in the normal case (the open call here IS
  // synchronous), but some browsers/extensions block more aggressively —
  // this is the fallback so "one click" never silently fails to open
  // anything with no way to recover.
  const [popupBlocked, setPopupBlocked] = useState(false);
  const userTypedRef = useRef(false);

  // --- Per-card inline cover letter (Auto Apply queue-style ▶ toggle) ---
  // Keyed by job id rather than reusing the single prepareJob/coverLetter
  // state above, since multiple cards' letters can be expanded/cached at
  // once here, independent of the "prepare" modal's own single-job flow.
  const [expandedCoverLetterIds, setExpandedCoverLetterIds] = useState<Set<string>>(new Set());
  const [cardCoverLetters, setCardCoverLetters] = useState<Record<string, string>>({});
  const [cardCoverLetterLoading, setCardCoverLetterLoading] = useState<Record<string, boolean>>({});
  const [cardCoverLetterErrors, setCardCoverLetterErrors] = useState<Record<string, string>>({});
  // Client-only, not persisted — search results are already ephemeral
  // per-query, so "dismissed" just needs to survive for this result set.
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  // --- Bulk apply ---
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkResults, setBulkResults] = useState<
    { job: Job; coverLetter: string; letterError?: string }[] | null
  >(null);

  // Load the signed-in user's plan and their saved resume's job title, so
  // the search can default to "jobs like the one on your resume" instead of
  // an unfiltered list. Only ever applied once, and only if the user hasn't
  // already started typing their own query in the meantime.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        const uid = data.user?.id;
        if (!uid || cancelled) {
          setDefaultQueryReady(true);
          setChecking(false);
          return;
        }

        setUserId(uid);

        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, phone")
          .eq("id", uid)
          .single();
        if (cancelled) return;
        setChecking(false);

        const { data: tracked } = await supabase
          .from("applications")
          .select("source_job_id")
          .eq("user_id", uid)
          .not("source_job_id", "is", null);
        if (!cancelled && tracked) {
          setTrackedIds(new Set(tracked.map((r) => r.source_job_id as string)));
        }

        // Ordered primary-first so a user with multiple saved versions gets
        // their intentionally-chosen "main" resume associated with new
        // applications (for Reports' resume-performance breakdown), not
        // just whichever one they touched most recently.
        const { data: resume } = await supabase
          .from("resumes")
          .select("id, content")
          .eq("user_id", uid)
          .order("is_primary", { ascending: false })
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (cancelled) return;

        if (resume?.id) setDefaultResumeId(resume.id as string);
        const structured = (resume?.content as ResumeContent | undefined)?.structured;
        if (structured) setDefaultResumeStructured(structured);

        // Contact info shown in the "prepare" popup — the profile's
        // full_name/phone (set on the Profile settings page) take priority
        // when present, but most users fill in their name/phone on their
        // resume and never separately on the profile page, so this used to
        // show "Not set" even when the resume clearly had that info. Fall
        // back to the resume's own fullName/phone fields before giving up.
        setContactInfo({
          fullName: profile?.full_name || structured?.fullName || "",
          email: data.user?.email ?? "",
          phone: profile?.phone || structured?.phone || "",
        });

        // Pre-fill the search box with the resume's own job title — a real
        // keyword pulled straight from the user's resume gives Job Copilot
        // something relevant to search on the moment the page loads instead
        // of showing an empty box, while still leaving it fully editable.
        // Guarded on userTypedRef so it never clobbers anything the user
        // already started typing while this (async) load was in flight.
        const title = structured?.title;
        if (title) {
          setResumeTitle(title);
          if (!userTypedRef.current) {
            setQuery(title);
            setQueryDraft(title);
          }
        }
      } catch {
        // Not logged in / Supabase not configured — fall back to an
        // unfiltered search, same as a logged-out visitor sees today.
      } finally {
        if (!cancelled) {
          setDefaultQueryReady(true);
          setChecking(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!defaultQueryReady) return;
    const controller = new AbortController();
    setLoading(true);
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (location) params.set("location", location);
    if (industry) params.set("industry", industry);
    if (workType) params.set("workType", workType);
    // A new search (or filter change) always starts back at page 1 — no
    // offset param needed, the route defaults to 0.

    fetch(`/api/jobs/search?${params.toString()}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data: SearchResponse) => {
        setJobs(data.jobs ?? []);
        setTotalJobs(data.total ?? data.jobs?.length ?? 0);
        setResultsArePro(data.isPro ?? false);
        if (data.industries?.length) setIndustries(data.industries);
        if (data.locations?.length) setLocations(data.locations);
        setSearchQuota(data.meta ?? null);
        // Fresh result set — clear any dismissed/expanded state from the
        // previous search rather than letting a stale dismiss hide a job
        // that's reappeared in new results.
        setDismissedIds(new Set());
        setExpandedCoverLetterIds(new Set());
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [query, location, industry, workType, defaultQueryReady]);

  // Fetches the next page (current jobs.length as the offset) and appends —
  // a professional "Load more" pattern instead of dumping every result at
  // once or silently capping at some fixed number. Uses the same committed
  // query/filters as the main search effect above, just with an offset.
  async function loadMoreJobs() {
    if (loadingMore || jobs.length >= totalJobs) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (location) params.set("location", location);
      if (industry) params.set("industry", industry);
      if (workType) params.set("workType", workType);
      params.set("offset", String(jobs.length));

      const res = await fetch(`/api/jobs/search?${params.toString()}`);
      const data: SearchResponse = await res.json();
      setJobs((prev) => {
        // Defend against the same job showing up twice across pages (a
        // freshly-cached job inserted between page loads could otherwise
        // shift the ordering enough to duplicate one across the boundary).
        const existingIds = new Set(prev.map((j) => j.id));
        const fresh = (data.jobs ?? []).filter((j) => !existingIds.has(j.id));
        return [...prev, ...fresh];
      });
      setTotalJobs(data.total ?? totalJobs);
    } catch {
      // Silent — the "Load more" button just stays available to retry.
    } finally {
      setLoadingMore(false);
    }
  }

  const hasActiveFilters = Boolean(location || industry || workType);
  // Reflects whatever's currently typed/selected but not yet searched —
  // used to grey out "Search" when there's nothing new to run.
  const hasUnappliedChanges =
    queryDraft !== query || locationDraft !== location || industryDraft !== industry || workTypeDraft !== workType;

  // Commits the draft query/filters and runs one search — the only thing
  // that actually spends a search from today's quota, along with Clear
  // below (both change the committed state the fetch effect depends on).
  function applySearch() {
    setQuery(queryDraft.trim());
    setLocation(locationDraft);
    setIndustry(industryDraft);
    setWorkType(workTypeDraft);
  }

  function clearFilters() {
    setLocationDraft("");
    setIndustryDraft("");
    setWorkTypeDraft("");
    setLocation("");
    setIndustry("");
    setWorkType("");
  }

  // There is no public LinkedIn API for job search (and no ToS-compliant
  // way to build one — see the codebase note atop app/api/jobs/search/
  // route.ts), so this can't be a real in-app data source the way
  // Greenhouse/Lever/Ashby/Jooble are. What it CAN be, with zero API and
  // zero scraping, is a plain outbound deep link into LinkedIn's own public
  // jobs-search results, pre-filled with whatever the user has already
  // typed here — a one-click bridge to LinkedIn's listings rather than a
  // dead end.
  function linkedInSearchUrl(): string {
    const params = new URLSearchParams();
    if (queryDraft.trim()) params.set("keywords", queryDraft.trim());
    if (locationDraft.trim()) params.set("location", locationDraft.trim());
    return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
  }

  // Snapshot the listing's own fields into `applications` rather than
  // relying on a `job_id` foreign key — live results come from external ATS
  // APIs and an in-memory fallback list, not from rows in the `jobs` table,
  // so there's nothing for a job_id to reference.
  async function handleSave(job: Job) {
    if (!userId || trackedIds.has(job.id)) return;
    setTrackedIds((prev) => new Set(prev).add(job.id));
    try {
      const supabase = createClient();
      const { error } = await supabase.from("applications").insert({
        user_id: userId,
        source_job_id: job.id,
        resume_id: defaultResumeId,
        company: job.company,
        title: job.title,
        location: job.location || null,
        apply_url: job.applyUrl || null,
        status: "saved",
      });
      // Supabase query calls resolve successfully (no throw) even when the
      // database rejects the write — the error comes back as `error`, not
      // as an exception. A duplicate-key error (23505) here just means it
      // was already saved (e.g. from another tab); anything else is a real
      // failure and needs to be visible, not silently swallowed.
      if (error && error.code !== "23505") {
        console.error("[jobs] failed to save job:", error);
      }
    } catch (err) {
      console.error("[jobs] failed to save job (network):", err);
    }
  }

  async function recordApplied(job: Job) {
    if (!userId) return;
    setTrackedIds((prev) => new Set(prev).add(job.id));
    try {
      const supabase = createClient();
      const { data: existing, error: selectError } = await supabase
        .from("applications")
        .select("id, status")
        .eq("user_id", userId)
        .eq("source_job_id", job.id)
        .maybeSingle();
      if (selectError) {
        console.error("[jobs] failed to check existing application:", selectError);
      }

      if (existing) {
        // Only advance "saved" -> "applied". If it's already further along
        // the pipeline (interview/offer/rejected), clicking Apply again
        // shouldn't silently regress the tracker.
        if (existing.status === "saved") {
          const { error } = await supabase
            .from("applications")
            .update({
              status: "applied",
              applied_at: new Date().toISOString(),
              resume_id: defaultResumeId,
            })
            .eq("id", existing.id);
          if (error) console.error("[jobs] failed to mark application applied:", error);
        }
      } else {
        const { error } = await supabase.from("applications").insert({
          user_id: userId,
          source_job_id: job.id,
          resume_id: defaultResumeId,
          company: job.company,
          title: job.title,
          location: job.location || null,
          apply_url: job.applyUrl || null,
          status: "applied",
          applied_at: new Date().toISOString(),
        });
        if (error) console.error("[jobs] failed to record application:", error);
      }
    } catch (err) {
      // Network-level failure only reaches here — DB-level errors are
      // caught and logged above, since Supabase calls don't throw for those.
      console.error("[jobs] failed to record application (network):", err);
    }
  }

  // Shared by the single-job flow (handleApply) and bulk apply — one AI
  // call, returns the letter text or throws with a message good enough to
  // show directly.
  async function generateCoverLetterFor(job: Job): Promise<string> {
    if (!defaultResumeStructured) throw new Error(t("prepare.noResume"));
    const res = await fetch("/api/resume/cover-letter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resume: defaultResumeStructured,
        jobTitle: job.title,
        company: job.company,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Generation failed");
    return data.letter as string;
  }

  // Expands/collapses a card's inline cover letter, lazily generating it on
  // first expand only (cached in cardCoverLetters after that, so re-toggling
  // never re-triggers a second AI call for the same job).
  function toggleCardCoverLetter(job: Job) {
    const willExpand = !expandedCoverLetterIds.has(job.id);
    setExpandedCoverLetterIds((prev) => {
      const next = new Set(prev);
      if (willExpand) next.add(job.id);
      else next.delete(job.id);
      return next;
    });
    if (willExpand && !cardCoverLetters[job.id] && !cardCoverLetterLoading[job.id]) {
      setCardCoverLetterLoading((prev) => ({ ...prev, [job.id]: true }));
      setCardCoverLetterErrors((prev) => ({ ...prev, [job.id]: "" }));
      generateCoverLetterFor(job)
        .then((letter) => setCardCoverLetters((prev) => ({ ...prev, [job.id]: letter })))
        .catch((err) =>
          setCardCoverLetterErrors((prev) => ({
            ...prev,
            [job.id]: err instanceof Error ? err.message : t("prepare.letterError"),
          }))
        )
        .finally(() => setCardCoverLetterLoading((prev) => ({ ...prev, [job.id]: false })));
    }
  }

  // Local-only — just removes the card from view, nothing to persist since
  // this is a live search result, not a saved/tracked record. Also drops it
  // from any pending bulk-apply selection so a dismissed card can't still be
  // counted/applied to after it's hidden.
  function handleDismiss(job: Job) {
    setDismissedIds((prev) => new Set(prev).add(job.id));
    setSelectedIds((prev) => {
      if (!prev.has(job.id)) return prev;
      const next = new Set(prev);
      next.delete(job.id);
      return next;
    });
  }

  // True one-click: opens the employer's application page immediately
  // (synchronously, inside the click handler — see popupBlocked above for
  // why that matters) and marks the job Applied in the background, instead
  // of the previous 3-step flow (open a "prepare" modal -> click Generate
  // -> click Confirm to finally open the page). The modal now opens
  // *alongside* the new tab as a live status/reference panel — contact
  // info, resume download, and the cover letter (auto-generating itself,
  // no button to click) — not a gate the user has to clear before anything
  // happens.
  //
  // This still isn't literal blind submission on the candidate's behalf —
  // see the note in the modal — no job source used here exposes a public
  // API that would let us submit on the candidate's behalf without
  // becoming an employer/platform partner.
  //
  // Defensive guard, not the primary gate — the button that calls this is
  // only ever rendered for Pro results (see resultsArePro in the card
  // markup below), and job.applyUrl is already stripped to "" server-side
  // for non-Pro responses either way (see app/api/jobs/search/route.ts), so
  // there'd be nothing real to open even if this were somehow reached.
  function handleApply(job: Job) {
    if (!resultsArePro || !job.applyUrl) return;
    const win = window.open(job.applyUrl, "_blank", "noreferrer");
    setPopupBlocked(!win);
    setCoverLetter("");
    setLetterError(null);
    setCopiedLetter(false);
    setPrepareJob(job);
    void recordApplied(job);
    if (defaultResumeStructured) {
      setGeneratingLetter(true);
      generateCoverLetterFor(job)
        .then((letter) => setCoverLetter(letter))
        .catch((err) => setLetterError(err instanceof Error ? err.message : t("prepare.letterError")))
        .finally(() => setGeneratingLetter(false));
    }
  }

  function closePrepareModal() {
    setPrepareJob(null);
  }

  async function handleDownloadResume() {
    if (!defaultResumeStructured) return;
    await downloadResumePdf(defaultResumeStructured, "resume.pdf");
  }

  async function handleGenerateCoverLetter() {
    if (!prepareJob || !defaultResumeStructured) return;
    setGeneratingLetter(true);
    setLetterError(null);
    try {
      setCoverLetter(await generateCoverLetterFor(prepareJob));
    } catch (err) {
      setLetterError(err instanceof Error ? err.message : t("prepare.letterError"));
    } finally {
      setGeneratingLetter(false);
    }
  }

  // --- Bulk apply ---
  function toggleSelected(job: Job) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(job.id)) next.delete(job.id);
      else next.add(job.id);
      return next;
    });
  }

  // Deliberately does NOT try to window.open() every selected job's
  // application page — browsers only reliably allow one popup per user
  // gesture, so auto-opening e.g. 8 tabs from a single click would silently
  // fail for most of them with no error and no way for the user to tell
  // which ones actually opened. Instead this preps everything (marks each
  // Applied, generates each cover letter) and hands back a checklist where
  // every "Open" is its own real click — same total effort as opening tabs,
  // but nothing silently fails.
  async function handleBulkApply() {
    // Defensive guard — see the comment on handleApply above. The
    // select-checkboxes and this whole banner are only rendered when
    // resultsArePro, so selectedIds should already be empty otherwise.
    if (!resultsArePro) return;
    const targets = jobs.filter((j) => selectedIds.has(j.id)).slice(0, MAX_BULK_APPLY);
    if (targets.length === 0) return;
    setBulkRunning(true);
    setBulkProgress(0);
    setBulkResults(null);

    const results: { job: Job; coverLetter: string; letterError?: string }[] = [];
    for (const job of targets) {
      await recordApplied(job);
      let letter = "";
      let letterErr: string | undefined;
      if (defaultResumeStructured) {
        try {
          letter = await generateCoverLetterFor(job);
        } catch (err) {
          letterErr = err instanceof Error ? err.message : t("prepare.letterError");
        }
      }
      results.push({ job, coverLetter: letter, letterError: letterErr });
      setBulkProgress(results.length);
    }

    setBulkResults(results);
    setSelectedIds(new Set());
    setBulkRunning(false);
  }

  function closeBulkResults() {
    setBulkResults(null);
  }

  async function handleCopyCoverLetter() {
    try {
      await navigator.clipboard.writeText(coverLetter);
      setCopiedLetter(true);
      setTimeout(() => setCopiedLetter(false), 2000);
    } catch {
      // Not critical — the letter is still visible and selectable.
    }
  }

  // Cards hide dismissed results without touching the underlying `jobs`
  // array (bulk-apply selection, the prepare modal, etc. all still key off
  // the full list/job ids as before) — dismiss is purely a view filter.
  const visibleJobs = jobs.filter((j) => !dismissedIds.has(j.id));

  if (checking) {
    return <p className="text-sm text-foreground/50">{t("loading")}</p>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
      <p className="mt-1 text-sm text-foreground/60">{t("subtitle")}</p>

      {/* Job Search used to be a whole-page Pro gate (nothing visible at all
          below free). Now everyone can browse real results — this banner
          replaces that full-page lock, explaining what's still Pro-only
          (location, the real apply link, one-click/bulk apply, cover
          letters) without blocking the results themselves. */}
      {!resultsArePro && (
        <div className="mt-4 flex flex-col items-start gap-3 rounded-2xl border border-gold-400/40 bg-gold-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-gold-100 text-gold-600">
              <Lock size={16} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">{t("limitedTitle")}</h2>
              <p className="mt-0.5 text-xs text-foreground/70">{t("limitedBody")}</p>
            </div>
          </div>
          <Link
            href="/pricing"
            className="flex-none rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            {t("upgradeCta")}
          </Link>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          applySearch();
        }}
      >
        <div className="relative mt-6 max-w-lg">
          <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 text-foreground/40" size={18} />
          <input
            value={queryDraft}
            onChange={(e) => {
              userTypedRef.current = true;
              setQueryDraft(e.target.value);
            }}
            placeholder={t("searchPlaceholder")}
            className="w-full rounded-full border border-border bg-surface py-3 ps-11 pe-4 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>

        {resumeTitle && !userTypedRef.current && query === resumeTitle && (
          <p className="mt-2 text-xs text-foreground/50">
            {t("matchedToResume", { title: resumeTitle })}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-foreground/50">
            <SlidersHorizontal size={15} />
          </div>

          <select
            value={locationDraft}
            onChange={(e) => setLocationDraft(e.target.value)}
            className="rounded-full border border-border bg-surface px-4 py-2 text-sm text-foreground focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="">{t("allLocations")}</option>
            {locations.map((loc) => (
              <option key={loc} value={loc}>
                {t.has(`locationNames.${loc}`) ? t(`locationNames.${loc}`) : loc}
              </option>
            ))}
          </select>

          <select
            value={industryDraft}
            onChange={(e) => setIndustryDraft(e.target.value)}
            className="rounded-full border border-border bg-surface px-4 py-2 text-sm text-foreground focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="">{t("allIndustries")}</option>
            {industries.map((ind) => (
              <option key={ind} value={ind}>
                {t.has(`industryNames.${ind}`) ? t(`industryNames.${ind}`) : ind}
              </option>
            ))}
          </select>

          <select
            value={workTypeDraft}
            onChange={(e) => setWorkTypeDraft(e.target.value as WorkType | "")}
            className="rounded-full border border-border bg-surface px-4 py-2 text-sm text-foreground focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="">{t("allWorkTypes")}</option>
            {WORK_TYPES.map((wt) => (
              <option key={wt} value={wt}>
                {t(`workTypes.${wt}`)}
              </option>
            ))}
          </select>

          <button
            type="submit"
            disabled={loading || !hasUnappliedChanges}
            className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Search size={14} />
            {t("searchButton")}
          </button>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="flex items-center gap-1 rounded-full px-3 py-2 text-sm font-medium text-foreground/60 hover:text-foreground"
            >
              <X size={14} />
              {t("clearFilters")}
            </button>
          )}

          <a
            href={linkedInSearchUrl()}
            target="_blank"
            rel="noreferrer"
            className="ms-auto flex items-center gap-2 rounded-full bg-[#0A66C2] px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#0A66C2]/25 transition-all hover:bg-[#004182] hover:shadow-lg hover:shadow-[#0A66C2]/35"
          >
            <LinkedInGlyph className="h-4 w-4 shrink-0" />
            {t("searchOnLinkedIn")}
            <ExternalLink size={13} className="opacity-80" />
          </a>
        </div>
      </form>

      {!loading && (
        <p className="mt-4 text-sm text-foreground/50">{t("resultsCount", { count: totalJobs })}</p>
      )}

      {searchQuota && (
        <p
          className={`mt-1 text-xs ${
            searchQuota.remaining === 0 ? "text-gold-700" : "text-foreground/40"
          }`}
        >
          {searchQuota.remaining > 0
            ? t("searchesRemainingToday", { count: searchQuota.remaining, limit: searchQuota.limit })
            : t("searchLimitReachedToday")}
        </p>
      )}

      {resultsArePro && selectedIds.size > 0 && (
        <div className="sticky top-2 z-30 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 shadow-sm">
          <p className="text-sm font-semibold text-emerald-800">
            {t("bulk.selectedCount", { count: selectedIds.size })}
            {selectedIds.size > MAX_BULK_APPLY && (
              <span className="ms-1.5 font-normal text-emerald-700/70">
                {t("bulk.cappedNote", { max: MAX_BULK_APPLY })}
              </span>
            )}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              disabled={bulkRunning}
              className="rounded-full px-3 py-2 text-xs font-semibold text-emerald-800/70 hover:text-emerald-900 disabled:opacity-60"
            >
              {t("bulk.clear")}
            </button>
            <button
              type="button"
              onClick={handleBulkApply}
              disabled={bulkRunning}
              className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-70"
            >
              {bulkRunning ? (
                <>
                  <Loader2 className="animate-spin" size={13} />
                  {t("bulk.applying", { done: bulkProgress, total: Math.min(selectedIds.size, MAX_BULK_APPLY) })}
                </>
              ) : (
                <>
                  <Zap size={13} />
                  {t("bulk.applyCta", { count: Math.min(selectedIds.size, MAX_BULK_APPLY) })}
                </>
              )}
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-4">
        {loading && (
          <p className="text-sm text-foreground/50">{t("loading")}</p>
        )}
        {!loading &&
          visibleJobs.map((job) => (
            <div
              key={job.id}
              className={`flex flex-col justify-between gap-4 rounded-2xl border bg-surface p-6 sm:flex-row sm:items-start ${
                selectedIds.has(job.id) ? "border-emerald-400 ring-1 ring-emerald-400/30" : "border-border"
              }`}
            >
              <div className="flex items-start gap-3">
                {resultsArePro && !trackedIds.has(job.id) && (
                  <button
                    type="button"
                    onClick={() => toggleSelected(job)}
                    title={t("bulk.select")}
                    className="mt-0.5 flex-none text-foreground/30 hover:text-emerald-600"
                  >
                    {selectedIds.has(job.id) ? (
                      <CheckSquare size={19} className="text-emerald-600" />
                    ) : (
                      <Square size={19} />
                    )}
                  </button>
                )}
                <div>
                <h3 className="font-semibold text-foreground">{job.title}</h3>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-foreground/60">
                  <span className="flex items-center gap-1.5">
                    <Building2 size={14} /> {job.company}
                  </span>
                  {job.location && (
                    <span className="flex items-center gap-1.5">
                      <MapPin size={14} /> {job.location}
                    </span>
                  )}
                  {job.industry && job.industry !== "Other" && (
                    <span className="rounded-full bg-sand-100 px-2.5 py-0.5 text-xs font-medium text-foreground/70">
                      {t.has(`industryNames.${job.industry}`) ? t(`industryNames.${job.industry}`) : job.industry}
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      job.workType === "remote"
                        ? "bg-emerald-50 text-emerald-700"
                        : job.workType === "hybrid"
                          ? "bg-sky-50 text-sky-700"
                          : "bg-sand-100 text-foreground/70"
                    }`}
                  >
                    {t(`workTypes.${job.workType}`)}
                  </span>
                  {typeof job.matchScore === "number" && (
                    <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                      <Target size={12} />
                      {t("matchScore", { score: job.matchScore })}
                    </span>
                  )}
                </div>

                {/* Inline collapsible cover letter — same ▶ toggle pattern
                    as the Auto Apply queue, lazily generated on first
                    expand and cached per job id after that. Pro-only: each
                    expand is a real AI call, so this stays behind the same
                    gate as Apply rather than opening cost up to anyone who
                    can now browse results. */}
                {!resultsArePro && defaultResumeStructured && (
                  <Link
                    href="/pricing"
                    className="mt-2.5 flex items-center gap-1 text-xs font-semibold text-gold-700 hover:text-gold-800"
                  >
                    <Lock size={12} />
                    {t("prepare.coverLetterHeading")} — {t("upgradeCta")}
                  </Link>
                )}
                {resultsArePro && defaultResumeStructured && (
                  <div className="mt-2.5">
                    <button
                      type="button"
                      onClick={() => toggleCardCoverLetter(job)}
                      className="flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                    >
                      <ChevronRight
                        size={13}
                        className={`transition-transform ${
                          expandedCoverLetterIds.has(job.id) ? "rotate-90" : ""
                        }`}
                      />
                      {t("prepare.coverLetterHeading")}
                    </button>
                    {expandedCoverLetterIds.has(job.id) && (
                      <div className="mt-2 max-w-md">
                        {cardCoverLetterLoading[job.id] && (
                          <p className="flex items-center gap-1.5 text-xs text-foreground/50">
                            <Loader2 className="animate-spin" size={13} />
                            {t("prepare.generating")}
                          </p>
                        )}
                        {cardCoverLetterErrors[job.id] && (
                          <p className="text-xs text-red-600">{cardCoverLetterErrors[job.id]}</p>
                        )}
                        {cardCoverLetters[job.id] && (
                          <textarea
                            readOnly
                            value={cardCoverLetters[job.id]}
                            rows={6}
                            className="w-full resize-y rounded-lg border border-border bg-background p-2.5 text-xs leading-relaxed text-foreground"
                          />
                        )}
                      </div>
                    )}
                  </div>
                )}
                </div>
              </div>
              <div className="flex flex-none flex-col items-end gap-2">
                <div className="flex items-center gap-2">
                  {userId && (
                    <button
                      type="button"
                      onClick={() => handleSave(job)}
                      disabled={trackedIds.has(job.id)}
                      title={trackedIds.has(job.id) ? t("saved") : t("save")}
                      className={`flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${
                        trackedIds.has(job.id)
                          ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                          : "border-border text-foreground/50 hover:border-emerald-300 hover:text-emerald-600"
                      }`}
                    >
                      {trackedIds.has(job.id) ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}
                    </button>
                  )}
                  {resultsArePro ? (
                    <button
                      type="button"
                      onClick={() => handleApply(job)}
                      className="flex items-center justify-center gap-1.5 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
                    >
                      {t("sendApplication")}
                      <ExternalLink size={14} />
                    </button>
                  ) : (
                    // Location and the real apply link are stripped
                    // server-side for non-Pro results (see app/api/jobs/
                    // search/route.ts) — there's nothing for handleApply to
                    // open here even if it were wired up, so this links
                    // straight to pricing instead of pretending to apply.
                    <Link
                      href="/pricing"
                      title={t("upgradeCta")}
                      className="flex items-center justify-center gap-1.5 rounded-full border border-gold-400/50 bg-gold-50 px-5 py-2.5 text-sm font-semibold text-gold-700 hover:bg-gold-100"
                    >
                      <Lock size={14} />
                      {t("upgradeToApply")}
                    </Link>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleDismiss(job)}
                  className="flex items-center gap-1 text-xs font-medium text-foreground/40 hover:text-red-600"
                >
                  <X size={13} />
                  {t("dismiss")}
                </button>
              </div>
            </div>
          ))}
        {!loading && visibleJobs.length === 0 && (
          <p className="text-sm text-foreground/50">{t("noResults")}</p>
        )}
      </div>

      {!loading && jobs.length > 0 && jobs.length < totalJobs && (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={loadMoreJobs}
            disabled={loadingMore}
            className="flex items-center gap-2 rounded-full border border-border bg-surface px-6 py-2.5 text-sm font-semibold text-foreground hover:border-emerald-300 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingMore && <Loader2 className="animate-spin" size={15} />}
            {loadingMore ? t("loadingMore") : t("loadMore", { count: Math.min(24, totalJobs - jobs.length) })}
          </button>
        </div>
      )}

      {prepareJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={closePrepareModal} />
          <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="flex items-center gap-1.5 text-lg font-bold text-foreground">
                  <CheckCircle2 size={18} className="text-emerald-600" />
                  {t("prepare.title")}
                </h2>
                <p className="mt-1 text-sm text-foreground/60">
                  {t("prepare.subtitle", { title: prepareJob.title, company: prepareJob.company })}
                </p>
              </div>
              <button
                onClick={closePrepareModal}
                className="flex-none rounded-full p-1.5 text-foreground/50 hover:bg-sand-100 hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>

            {popupBlocked ? (
              <div className="mt-4 flex flex-col items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800 sm:flex-row sm:items-center sm:justify-between">
                <span className="flex items-start gap-1.5">
                  <AlertTriangle size={14} className="mt-0.5 flex-none" />
                  {t("prepare.popupBlocked")}
                </span>
                <a
                  href={prepareJob.applyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-none items-center gap-1 rounded-full bg-amber-600 px-3 py-1.5 font-semibold text-white hover:bg-amber-700"
                >
                  {t("prepare.openAgain")}
                  <ExternalLink size={12} />
                </a>
              </div>
            ) : (
              <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-800">
                {t("prepare.note")}
              </p>
            )}

            {/* Contact info */}
            <div className="mt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground/50">
                {t("prepare.contactHeading")}
              </h3>
              <div className="mt-2 space-y-1.5 rounded-xl border border-border bg-background p-3.5 text-sm">
                <div className="flex items-center gap-2 text-foreground/80">
                  <User size={14} className="text-foreground/40" />
                  {contactInfo?.fullName || t("prepare.notSet")}
                </div>
                <div className="flex items-center gap-2 text-foreground/80">
                  <Mail size={14} className="text-foreground/40" />
                  {contactInfo?.email || t("prepare.notSet")}
                </div>
                <div className="flex items-center gap-2 text-foreground/80">
                  <Phone size={14} className="text-foreground/40" />
                  {contactInfo?.phone || t("prepare.notSet")}
                </div>
              </div>
            </div>

            {/* Resume */}
            <div className="mt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground/50">
                {t("prepare.resumeHeading")}
              </h3>
              {defaultResumeStructured ? (
                <button
                  onClick={handleDownloadResume}
                  className="mt-2 flex w-full items-center justify-between rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm font-medium text-foreground hover:bg-sand-100"
                >
                  <span className="truncate">{resumeTitle || t("prepare.yourResume")}</span>
                  <Download size={15} className="flex-none text-emerald-600" />
                </button>
              ) : (
                <p className="mt-2 text-sm text-foreground/50">{t("prepare.noResume")}</p>
              )}
            </div>

            {/* Cover letter — generated automatically as soon as the modal
                opens (see handleApply), no button to click. A manual retry
                button only appears if that background generation failed. */}
            {defaultResumeStructured && (
              <div className="mt-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground/50">
                    {t("prepare.coverLetterHeading")}
                  </h3>
                  {letterError && (
                    <button
                      onClick={handleGenerateCoverLetter}
                      disabled={generatingLetter}
                      className="flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 disabled:opacity-60"
                    >
                      <Sparkles size={13} />
                      {t("prepare.retryLetter")}
                    </button>
                  )}
                </div>
                {generatingLetter && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-foreground/50">
                    <Loader2 className="animate-spin" size={13} />
                    {t("prepare.generating")}
                  </p>
                )}
                {letterError && <p className="mt-2 text-xs text-red-600">{letterError}</p>}
                {coverLetter && (
                  <div className="mt-2">
                    <textarea
                      value={coverLetter}
                      onChange={(e) => setCoverLetter(e.target.value)}
                      rows={8}
                      className="w-full resize-y rounded-xl border border-border bg-background p-3 text-xs leading-relaxed text-foreground focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                    <button
                      onClick={handleCopyCoverLetter}
                      className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-foreground/60 hover:text-foreground"
                    >
                      {copiedLetter ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                      {copiedLetter ? t("prepare.copied") : t("prepare.copy")}
                    </button>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={closePrepareModal}
              className="mt-6 flex w-full items-center justify-center gap-1.5 rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              {t("prepare.doneCta")}
            </button>
          </div>
        </div>
      )}

      {(bulkRunning || bulkResults) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={bulkRunning ? undefined : closeBulkResults} />
          <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-foreground">
                  {bulkRunning ? t("bulk.resultsRunningTitle") : t("bulk.resultsTitle")}
                </h2>
                <p className="mt-1 text-sm text-foreground/60">
                  {bulkRunning
                    ? t("bulk.resultsRunningSubtitle")
                    : t("bulk.resultsSubtitle", { count: bulkResults?.length ?? 0 })}
                </p>
              </div>
              {!bulkRunning && (
                <button
                  onClick={closeBulkResults}
                  className="flex-none rounded-full p-1.5 text-foreground/50 hover:bg-sand-100 hover:text-foreground"
                >
                  <X size={18} />
                </button>
              )}
            </div>

            <div className="mt-5 space-y-3">
              {(bulkResults ?? []).map(({ job, coverLetter: letter, letterError: err }) => (
                <div key={job.id} className="rounded-xl border border-border bg-background p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-foreground">
                        <CheckCircle2 size={14} className="flex-none text-emerald-600" />
                        {job.title}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-foreground/50">{job.company}</p>
                    </div>
                    <a
                      href={job.applyUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex flex-none items-center gap-1 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      {t("bulk.openApplication")}
                      <ExternalLink size={12} />
                    </a>
                  </div>
                  {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
                  {letter && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-semibold text-emerald-700 hover:text-emerald-800">
                        {t("prepare.coverLetterHeading")}
                      </summary>
                      <textarea
                        readOnly
                        value={letter}
                        rows={6}
                        className="mt-2 w-full resize-y rounded-lg border border-border bg-surface p-2.5 text-xs leading-relaxed text-foreground"
                      />
                    </details>
                  )}
                </div>
              ))}
              {bulkRunning &&
                Array.from({ length: Math.max(0, Math.min(selectedIds.size, MAX_BULK_APPLY) - bulkProgress) }).map(
                  (_, i) => (
                    <div
                      key={`pending-${i}`}
                      className="flex items-center gap-2 rounded-xl border border-dashed border-border p-3.5 text-xs text-foreground/40"
                    >
                      <Loader2 className="animate-spin" size={13} />
                      {t("bulk.pending")}
                    </div>
                  )
                )}
            </div>

            {!bulkRunning && (
              <button
                onClick={closeBulkResults}
                className="mt-6 flex w-full items-center justify-center gap-1.5 rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                {t("prepare.doneCta")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
