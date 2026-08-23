"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { LOCATIONS } from "@/lib/jobSources";
import { type AtsPlatform, ATS_PLATFORM_LABELS } from "@/lib/atsPlatform";
import {
  Lock,
  Zap,
  Loader2,
  Check,
  Copy,
  ExternalLink,
  X,
  AlertTriangle,
  Sparkles,
  Info,
  Play,
  Clock,
  ClipboardList,
  Building2,
  Flag,
} from "lucide-react";

// Must match RUN_NOW_COOLDOWN_MS in lib/autoApplyRun.ts — duplicated here
// rather than imported because that file pulls in server-only Supabase
// admin/cover-letter code that can't end up in the client bundle. Set to 0
// now that matching reads from our own cached table instead of calling
// paid/free job-board APIs directly — nothing left to rate-limit, so
// "Run now" stays clickable immediately instead of showing a countdown.
const RUN_NOW_COOLDOWN_MS = 0;

type WorkType = "remote" | "hybrid" | "onsite";
const WORK_TYPES: WorkType[] = ["remote", "hybrid", "onsite"];

type Preferences = {
  enabled: boolean;
  daily_cap: number;
  keywords: string;
  location: string;
  work_type: WorkType | null;
  excluded_companies: string[];
  // null = no explicit choice — matching falls back to the primary/most
  // recently updated resume, same as before this field existed.
  resume_id: string | null;
};

const DEFAULT_PREFS: Preferences = {
  enabled: false,
  daily_cap: 5,
  keywords: "",
  location: "",
  work_type: null,
  excluded_companies: [],
  resume_id: null,
};

type ResumeOption = { id: string; title: string; is_primary: boolean };

type ScreeningQA = { question: string; answer: string };

type QueueItem = {
  id: string;
  source_job_id: string;
  title: string;
  company: string;
  location: string | null;
  apply_url: string;
  match_score: number;
  cover_letter: string;
  status: "pending" | "sent" | "dismissed";
  created_at: string;
  ats_platform: AtsPlatform | null;
  suggested_answers: ScreeningQA[] | null;
};

// A short heads-up shown only for platforms whose application flow tends to
// surprise someone expecting a single-page form like Greenhouse/Lever —
// most platforms don't need a note at all, so this stays a sparse map
// keyed off dashboard.autoApply.queue.atsTip in messages/{en,ar}.json
// rather than one entry per AtsPlatform value.
const ATS_TIP_PLATFORMS: AtsPlatform[] = ["workday", "icims", "taleo", "linkedin", "email"];

type WorkAuthorization = "citizen" | "resident_no_sponsorship" | "requires_sponsorship" | "gcc_national";
const WORK_AUTHORIZATIONS: WorkAuthorization[] = ["citizen", "resident_no_sponsorship", "requires_sponsorship", "gcc_national"];

type NoticePeriod = "immediate" | "2_weeks" | "1_month" | "2_months" | "3_months_plus";
const NOTICE_PERIODS: NoticePeriod[] = ["immediate", "2_weeks", "1_month", "2_months", "3_months_plus"];

type ApplicantProfileState = {
  workAuthorization: WorkAuthorization | "";
  noticePeriod: NoticePeriod | "";
  expectedSalary: string;
  willingToRelocate: boolean;
  willingToTravel: boolean;
  linkedinUrl: string;
  portfolioUrl: string;
  totalYearsExperience: string;
  earliestStartDate: string;
  additionalNotes: string;
};

const DEFAULT_APPLICANT_PROFILE: ApplicantProfileState = {
  workAuthorization: "",
  noticePeriod: "",
  expectedSalary: "",
  willingToRelocate: false,
  willingToTravel: false,
  linkedinUrl: "",
  portfolioUrl: "",
  totalYearsExperience: "",
  earliestStartDate: "",
  additionalNotes: "",
};

export default function AutoApplyPage() {
  const t = useTranslations("dashboard.autoApply");
  const tJobs = useTranslations("dashboard.jobs");

  const [checking, setChecking] = useState(true);
  const [plan, setPlan] = useState<"free" | "pro">("free");
  const [userId, setUserId] = useState<string | null>(null);
  const [defaultResumeId, setDefaultResumeId] = useState<string | null>(null);
  const [hasResume, setHasResume] = useState(false);
  const [resumeOptions, setResumeOptions] = useState<ResumeOption[]>([]);

  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS);
  const [excludedText, setExcludedText] = useState("");
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [popupBlockedId, setPopupBlockedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // Composite `${queueItemId}:${answerIndex}` key — a separate copy-feedback
  // tracker from copiedId above since a single queue item now has several
  // independently-copyable answers, not just the one cover letter.
  const [copiedQaKey, setCopiedQaKey] = useState<string | null>(null);

  const [applicantProfile, setApplicantProfile] = useState<ApplicantProfileState>(DEFAULT_APPLICANT_PROFILE);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaveState, setProfileSaveState] = useState<"idle" | "saved" | "error">("idle");

  // nextRunAt drives both the countdown display and whether "Run now" is
  // clickable. Set directly from whatever the server last told us (initial
  // load's last_run_at + 24h, or the nextRunAt a run-now call returns on
  // success or on a 429 cooldown) rather than recomputed client-side from a
  // separately-tracked lastRunAt, so it never drifts from the server's
  // 24h-cooldown source of truth.
  const [nextRunAt, setNextRunAt] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  // Distinct from runError: not a failure, just an explanation for why a
  // successful run queued zero matches (missing resume name, daily cap
  // already spent, or genuinely nothing matched this run) — shown even when
  // the run was triggered silently after saving, since "why did nothing
  // happen" is exactly the confusion this is meant to head off.
  const [runNote, setRunNote] = useState<string | null>(null);
  // Ticks once a minute purely to force the countdown text to re-render —
  // nextRunAt itself doesn't change just because time passes. Initialized
  // lazily (not in an effect) so the first render already has a real value.
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  async function loadQueue(uid: string) {
    const supabase = createClient();
    const { data: queueRows } = await supabase
      .from("auto_apply_queue")
      .select(
        "id, source_job_id, title, company, location, apply_url, match_score, cover_letter, status, created_at, ats_platform, suggested_answers"
      )
      .eq("user_id", uid)
      .eq("status", "pending")
      .order("match_score", { ascending: false })
      .order("created_at", { ascending: false });
    if (queueRows) setQueue(queueRows as QueueItem[]);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        const uid = data.user?.id;
        if (!uid || cancelled) {
          setChecking(false);
          setLoadingQueue(false);
          return;
        }
        setUserId(uid);

        const { data: profile } = await supabase.from("profiles").select("plan").eq("id", uid).single();
        if (cancelled) return;
        const isPro = profile?.plan === "pro";
        if (isPro) setPlan("pro");
        setChecking(false);
        if (!isPro) {
          setLoadingQueue(false);
          return;
        }

        // Fetch every resume, not just one — Auto Apply needs the full list
        // to offer as choices, ordered so the primary (then most recently
        // updated) resume is first, which is also what "no explicit choice
        // saved" falls back to, both here and server-side in
        // lib/autoApplyRun.ts.
        const { data: resumes } = await supabase
          .from("resumes")
          .select("id, title, is_primary")
          .eq("user_id", uid)
          .order("is_primary", { ascending: false })
          .order("updated_at", { ascending: false });
        if (cancelled) return;
        if (resumes && resumes.length > 0) {
          setResumeOptions(resumes as ResumeOption[]);
          setDefaultResumeId(resumes[0].id as string);
          setHasResume(true);
        }

        const { data: prefsRow } = await supabase
          .from("auto_apply_preferences")
          .select("enabled, daily_cap, keywords, location, work_type, excluded_companies, resume_id, last_run_at")
          .eq("user_id", uid)
          .maybeSingle();
        if (cancelled) return;
        if (prefsRow) {
          const loaded: Preferences = {
            enabled: prefsRow.enabled,
            daily_cap: prefsRow.daily_cap,
            keywords: prefsRow.keywords ?? "",
            location: prefsRow.location ?? "",
            work_type: (prefsRow.work_type as WorkType | null) ?? null,
            excluded_companies: prefsRow.excluded_companies ?? [],
            resume_id: prefsRow.resume_id ?? null,
          };
          setPrefs(loaded);
          setExcludedText(loaded.excluded_companies.join("\n"));
          if (prefsRow.last_run_at) {
            setNextRunAt(new Date(prefsRow.last_run_at as string).getTime() + RUN_NOW_COOLDOWN_MS);
          }
        }

        const { data: profileRow } = await supabase
          .from("applicant_profile")
          .select(
            "work_authorization, notice_period, expected_salary, willing_to_relocate, willing_to_travel, linkedin_url, portfolio_url, total_years_experience, earliest_start_date, additional_notes"
          )
          .eq("user_id", uid)
          .maybeSingle();
        if (cancelled) return;
        if (profileRow) {
          setApplicantProfile({
            workAuthorization: (profileRow.work_authorization as WorkAuthorization) ?? "",
            noticePeriod: (profileRow.notice_period as NoticePeriod) ?? "",
            expectedSalary: profileRow.expected_salary ?? "",
            willingToRelocate: Boolean(profileRow.willing_to_relocate),
            willingToTravel: Boolean(profileRow.willing_to_travel),
            linkedinUrl: profileRow.linkedin_url ?? "",
            portfolioUrl: profileRow.portfolio_url ?? "",
            totalYearsExperience:
              profileRow.total_years_experience !== null && profileRow.total_years_experience !== undefined
                ? String(profileRow.total_years_experience)
                : "",
            earliestStartDate: profileRow.earliest_start_date ?? "",
            additionalNotes: profileRow.additional_notes ?? "",
          });
        }

        await loadQueue(uid);
      } catch {
        // Not logged in / Supabase not configured.
      } finally {
        if (!cancelled) {
          setChecking(false);
          setLoadingQueue(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSavePrefs() {
    if (!userId) return;
    setSavingPrefs(true);
    setSaveState("idle");
    const excludedCompanies = excludedText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("auto_apply_preferences").upsert(
        {
          user_id: userId,
          enabled: prefs.enabled,
          daily_cap: prefs.daily_cap,
          keywords: prefs.keywords,
          location: prefs.location,
          work_type: prefs.work_type,
          excluded_companies: excludedCompanies,
          resume_id: prefs.resume_id,
        },
        { onConflict: "user_id" }
      );
      if (error) throw error;
      setPrefs((p) => ({ ...p, excluded_companies: excludedCompanies }));
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2500);
      // "Turn it on and it runs right away" instead of only ever running on
      // tomorrow's 6am UTC cron: if Auto Apply is (now) on, try an immediate
      // run right after saving. handleRunNow no-ops quietly (via `silent`)
      // if the 24h cooldown is still active — e.g. re-saving settings the
      // same day the cron or a prior "Run now" already ran — so this is
      // safe to fire on every save, not just the first time it's enabled.
      if (prefs.enabled) {
        handleRunNow({ silent: true });
      }
    } catch {
      setSaveState("error");
    } finally {
      setSavingPrefs(false);
    }
  }

  async function handleSaveProfile() {
    if (!userId) return;
    setSavingProfile(true);
    setProfileSaveState("idle");
    try {
      const supabase = createClient();
      const { error } = await supabase.from("applicant_profile").upsert(
        {
          user_id: userId,
          work_authorization: applicantProfile.workAuthorization || null,
          notice_period: applicantProfile.noticePeriod || null,
          expected_salary: applicantProfile.expectedSalary.trim() || null,
          willing_to_relocate: applicantProfile.willingToRelocate,
          willing_to_travel: applicantProfile.willingToTravel,
          linkedin_url: applicantProfile.linkedinUrl.trim() || null,
          portfolio_url: applicantProfile.portfolioUrl.trim() || null,
          total_years_experience: applicantProfile.totalYearsExperience.trim()
            ? Number(applicantProfile.totalYearsExperience)
            : null,
          earliest_start_date: applicantProfile.earliestStartDate || null,
          additional_notes: applicantProfile.additionalNotes.trim() || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
      if (error) throw error;
      setProfileSaveState("saved");
      setTimeout(() => setProfileSaveState("idle"), 2500);
    } catch {
      setProfileSaveState("error");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleCopyAnswer(item: QueueItem, index: number, answer: string) {
    try {
      await navigator.clipboard.writeText(answer);
      const key = `${item.id}:${index}`;
      setCopiedQaKey(key);
      setTimeout(() => setCopiedQaKey((k) => (k === key ? null : k)), 2000);
    } catch {
      // Not critical.
    }
  }

  async function handleRunNow(opts: { silent?: boolean } = {}) {
    if (!userId || running) return;
    if (nextRunAt && Date.now() < nextRunAt) return; // still in cooldown — button shouldn't be clickable anyway
    setRunning(true);
    if (!opts.silent) setRunError(null);
    setRunNote(null);
    try {
      const res = await fetch("/api/auto-apply/run-now", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body?.nextRunAt) setNextRunAt(new Date(body.nextRunAt as string).getTime());
        if (!opts.silent) setRunError(body?.error === "cooldown" ? null : t("queue.runError"));
        return;
      }
      if (body?.nextRunAt) setNextRunAt(new Date(body.nextRunAt as string).getTime());
      // A successful run that queued nothing still deserves an explanation —
      // shown even when this call was the silent auto-run-after-save, since
      // that's exactly when a user is most likely to wonder why the queue
      // stayed empty. Real errors (network, unexpected failure) stay gated
      // behind `!opts.silent` above; this is informational, not a failure.
      if (body?.reason) setRunNote(t(`queue.reason.${body.reason}`));
      // Show results immediately rather than waiting for the next full page
      // load — this is the whole point of an on-demand trigger.
      await loadQueue(userId);
    } catch {
      if (!opts.silent) setRunError(t("queue.runError"));
    } finally {
      setRunning(false);
    }
  }

  // Reuses the exact same one-click pattern as the Job Search page's
  // handleApply: open the real application synchronously inside the click
  // handler (the only way browsers allow it), then record it in the
  // background. The cover letter here was already generated by the cron —
  // no extra AI call or "prepare" step needed, which is the whole point of
  // the queue existing.
  async function handleSend(item: QueueItem) {
    const win = window.open(item.apply_url, "_blank", "noreferrer");
    setPopupBlockedId(win ? null : item.id);
    setSendingId(item.id);
    setQueue((prev) => prev.filter((q) => q.id !== item.id));

    // The resume the match/cover letter were actually generated from — the
    // explicit selection if one was saved, otherwise whatever resume Auto
    // Apply falls back to server-side (primary/most recent), mirrored here
    // via defaultResumeId. Recording this on the applications row (not just
    // "whichever resume happens to be primary right now") keeps the tracker
    // accurate even if the user's primary resume changes later.
    const usedResumeId = prefs.resume_id ?? defaultResumeId;

    try {
      const supabase = createClient();
      await supabase
        .from("auto_apply_queue")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", item.id);

      if (userId) {
        const { data: existing } = await supabase
          .from("applications")
          .select("id, status")
          .eq("user_id", userId)
          .eq("source_job_id", item.source_job_id)
          .maybeSingle();

        if (existing) {
          if (existing.status === "saved") {
            await supabase
              .from("applications")
              .update({ status: "applied", applied_at: new Date().toISOString(), resume_id: usedResumeId })
              .eq("id", existing.id);
          }
        } else {
          await supabase.from("applications").insert({
            user_id: userId,
            source_job_id: item.source_job_id,
            resume_id: usedResumeId,
            company: item.company,
            title: item.title,
            location: item.location,
            apply_url: item.apply_url,
            status: "applied",
            applied_at: new Date().toISOString(),
          });
        }
      }
    } catch (err) {
      console.error("[auto-apply] failed to record sent application:", err);
    } finally {
      setSendingId(null);
    }
  }

  async function handleDismiss(item: QueueItem) {
    setQueue((prev) => prev.filter((q) => q.id !== item.id));
    try {
      const supabase = createClient();
      await supabase.from("auto_apply_queue").update({ status: "dismissed" }).eq("id", item.id);
    } catch {
      // Non-critical — worst case it reappears if the page is reloaded before this lands.
    }
  }

  // "This link doesn't work anymore" — same report-and-remove-from-cache
  // flow as Job Search (see app/api/jobs/report-expired/route.ts). Removes
  // this queue entry the same way Dismiss does (there's no point leaving a
  // dead listing queued once it's been confirmed dead) and additionally
  // strikes it from the shared job cache so it stops being matched into
  // anyone else's queue, or shown in Job Search, going forward.
  async function handleReportExpired(item: QueueItem) {
    setQueue((prev) => prev.filter((q) => q.id !== item.id));
    try {
      const supabase = createClient();
      await supabase.from("auto_apply_queue").update({ status: "dismissed" }).eq("id", item.id);
      await fetch("/api/jobs/report-expired", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: item.source_job_id }),
      });
    } catch {
      // Already removed from view regardless.
    }
  }

  async function handleCopy(item: QueueItem) {
    try {
      await navigator.clipboard.writeText(item.cover_letter);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Not critical.
    }
  }

  // null once nextRunAt has passed (or was never set) — "Run now" is
  // clickable. Otherwise an "Xh Ym" / "Xm" string for the countdown.
  const countdownText =
    nextRunAt && nextRunAt > nowTick
      ? (() => {
          const totalMinutes = Math.ceil((nextRunAt - nowTick) / 60_000);
          const hours = Math.floor(totalMinutes / 60);
          const minutes = totalMinutes % 60;
          return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
        })()
      : null;

  if (checking) {
    return <p className="text-sm text-foreground/50">{t("loading")}</p>;
  }

  if (plan !== "pro") {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-foreground/60">{t("subtitle")}</p>

        <div className="mt-8 flex flex-col items-start gap-4 rounded-2xl border border-gold-400/40 bg-gold-50 p-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold-100 text-gold-600">
            <Lock size={20} />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">{t("lockedTitle")}</h2>
            <p className="mt-1 text-sm text-foreground/70">{t("lockedBody")}</p>
          </div>
          <Link
            href="/pricing"
            className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            {t("upgradeCta")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
        <Zap className="text-emerald-600" size={22} />
        {t("title")}
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-foreground/60">{t("subtitle")}</p>

      <p className="mt-4 flex max-w-2xl items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-800">
        <Info size={14} className="mt-0.5 flex-none" />
        {t("howItWorks")}
      </p>

      {!hasResume && (
        <p className="mt-4 flex max-w-2xl items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
          <AlertTriangle size={14} className="mt-0.5 flex-none" />
          {t("queue.noResume")}
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        {/* Settings + Application profile */}
        <div className="space-y-6">
        <div className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-sm font-bold text-foreground">{t("settings.heading")}</h2>

          <label className="mt-4 flex items-center justify-between gap-3">
            <span>
              <span className="block text-sm font-medium text-foreground">{t("settings.enableLabel")}</span>
              <span className="block text-xs text-foreground/50">{t("settings.enableHint")}</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={prefs.enabled}
              onClick={() => setPrefs((p) => ({ ...p, enabled: !p.enabled }))}
              className={`relative h-6 w-11 flex-none rounded-full transition-colors ${
                prefs.enabled ? "bg-emerald-600" : "bg-sand-200"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  prefs.enabled ? "translate-x-5 rtl:-translate-x-5" : "translate-x-0.5 rtl:-translate-x-0.5"
                }`}
              />
            </button>
          </label>

          <div className="mt-4">
            <label className="block text-sm font-medium text-foreground">{t("settings.dailyCapLabel")}</label>
            <p className="text-xs text-foreground/50">{t("settings.dailyCapHint")}</p>
            <input
              type="number"
              min={1}
              max={50}
              value={prefs.daily_cap}
              onChange={(e) =>
                setPrefs((p) => ({ ...p, daily_cap: Math.min(50, Math.max(1, Number(e.target.value) || 1)) }))
              }
              className="mt-1.5 w-24 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          {/* Only worth showing once there's an actual choice to make — with a single resume,
              matching already uses it automatically, so a dropdown here would just be noise. */}
          {resumeOptions.length > 1 && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-foreground">{t("settings.resumeLabel")}</label>
              <p className="text-xs text-foreground/50">{t("settings.resumeHint")}</p>
              <select
                value={prefs.resume_id ?? ""}
                onChange={(e) => setPrefs((p) => ({ ...p, resume_id: e.target.value || null }))}
                className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                <option value="">{t("settings.resumeAuto")}</option>
                {resumeOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title || t("settings.resumeUntitled")}
                    {r.is_primary ? ` (${t("settings.resumePrimaryTag")})` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="mt-4">
            <label className="block text-sm font-medium text-foreground">{t("settings.keywordsLabel")}</label>
            <input
              value={prefs.keywords}
              onChange={(e) => setPrefs((p) => ({ ...p, keywords: e.target.value }))}
              placeholder={t("settings.keywordsPlaceholder")}
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-foreground">{t("settings.locationLabel")}</label>
            <select
              value={prefs.location}
              onChange={(e) => setPrefs((p) => ({ ...p, location: e.target.value }))}
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="">{t("settings.anyLocation")}</option>
              {LOCATIONS.map((loc) => (
                <option key={loc} value={loc}>
                  {tJobs.has(`locationNames.${loc}`) ? tJobs(`locationNames.${loc}`) : loc}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-foreground">{t("settings.workTypeLabel")}</label>
            <select
              value={prefs.work_type ?? ""}
              onChange={(e) => setPrefs((p) => ({ ...p, work_type: (e.target.value || null) as WorkType | null }))}
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="">{t("settings.anyWorkType")}</option>
              {WORK_TYPES.map((wt) => (
                <option key={wt} value={wt}>
                  {tJobs(`workTypes.${wt}`)}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-foreground">{t("settings.excludedCompaniesLabel")}</label>
            <textarea
              value={excludedText}
              onChange={(e) => setExcludedText(e.target.value)}
              placeholder={t("settings.excludedCompaniesPlaceholder")}
              rows={3}
              className="mt-1.5 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          <button
            type="button"
            onClick={handleSavePrefs}
            disabled={savingPrefs}
            className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {savingPrefs ? (
              <Loader2 className="animate-spin" size={15} />
            ) : saveState === "saved" ? (
              <Check size={15} />
            ) : null}
            {saveState === "saved" ? t("settings.saved") : t("settings.saveButton")}
          </button>
          {saveState === "error" && <p className="mt-2 text-xs text-red-600">{t("settings.saveError")}</p>}
        </div>

        {/* Application profile — screening-question facts a resume alone
            doesn't carry, saved once and reused by every queued match's
            "ready to paste" Q&A panel (see lib/screeningAnswers.ts). */}
        <div className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <ClipboardList size={16} className="text-emerald-600" />
            {t("applicantProfile.heading")}
          </h2>
          <p className="mt-1 text-xs text-foreground/50">{t("applicantProfile.hint")}</p>

          <div className="mt-4">
            <label className="block text-sm font-medium text-foreground">{t("applicantProfile.workAuthorizationLabel")}</label>
            <select
              value={applicantProfile.workAuthorization}
              onChange={(e) =>
                setApplicantProfile((p) => ({ ...p, workAuthorization: e.target.value as WorkAuthorization | "" }))
              }
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="">{t("applicantProfile.workAuthorizationPlaceholder")}</option>
              {WORK_AUTHORIZATIONS.map((wa) => (
                <option key={wa} value={wa}>
                  {t(`applicantProfile.workAuthorization.${wa}`)}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-foreground">{t("applicantProfile.noticePeriodLabel")}</label>
            <select
              value={applicantProfile.noticePeriod}
              onChange={(e) => setApplicantProfile((p) => ({ ...p, noticePeriod: e.target.value as NoticePeriod | "" }))}
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="">{t("applicantProfile.noticePeriodPlaceholder")}</option>
              {NOTICE_PERIODS.map((np) => (
                <option key={np} value={np}>
                  {t(`applicantProfile.noticePeriod.${np}`)}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-foreground">{t("applicantProfile.expectedSalaryLabel")}</label>
            <input
              value={applicantProfile.expectedSalary}
              onChange={(e) => setApplicantProfile((p) => ({ ...p, expectedSalary: e.target.value }))}
              placeholder={t("applicantProfile.expectedSalaryPlaceholder")}
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-foreground">{t("applicantProfile.experienceLabel")}</label>
            <input
              type="number"
              min={0}
              max={60}
              value={applicantProfile.totalYearsExperience}
              onChange={(e) => setApplicantProfile((p) => ({ ...p, totalYearsExperience: e.target.value }))}
              className="mt-1.5 w-24 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-foreground">{t("applicantProfile.startDateLabel")}</label>
            <input
              type="date"
              value={applicantProfile.earliestStartDate}
              onChange={(e) => setApplicantProfile((p) => ({ ...p, earliestStartDate: e.target.value }))}
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          <label className="mt-4 flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-foreground">{t("applicantProfile.relocateLabel")}</span>
            <button
              type="button"
              role="switch"
              aria-checked={applicantProfile.willingToRelocate}
              onClick={() => setApplicantProfile((p) => ({ ...p, willingToRelocate: !p.willingToRelocate }))}
              className={`relative h-6 w-11 flex-none rounded-full transition-colors ${
                applicantProfile.willingToRelocate ? "bg-emerald-600" : "bg-sand-200"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  applicantProfile.willingToRelocate ? "translate-x-5 rtl:-translate-x-5" : "translate-x-0.5 rtl:-translate-x-0.5"
                }`}
              />
            </button>
          </label>

          <label className="mt-4 flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-foreground">{t("applicantProfile.travelLabel")}</span>
            <button
              type="button"
              role="switch"
              aria-checked={applicantProfile.willingToTravel}
              onClick={() => setApplicantProfile((p) => ({ ...p, willingToTravel: !p.willingToTravel }))}
              className={`relative h-6 w-11 flex-none rounded-full transition-colors ${
                applicantProfile.willingToTravel ? "bg-emerald-600" : "bg-sand-200"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  applicantProfile.willingToTravel ? "translate-x-5 rtl:-translate-x-5" : "translate-x-0.5 rtl:-translate-x-0.5"
                }`}
              />
            </button>
          </label>

          <div className="mt-4">
            <label className="block text-sm font-medium text-foreground">{t("applicantProfile.linkedinLabel")}</label>
            <input
              value={applicantProfile.linkedinUrl}
              onChange={(e) => setApplicantProfile((p) => ({ ...p, linkedinUrl: e.target.value }))}
              placeholder="https://linkedin.com/in/…"
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-foreground">{t("applicantProfile.portfolioLabel")}</label>
            <input
              value={applicantProfile.portfolioUrl}
              onChange={(e) => setApplicantProfile((p) => ({ ...p, portfolioUrl: e.target.value }))}
              placeholder="https://…"
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-foreground">{t("applicantProfile.notesLabel")}</label>
            <textarea
              value={applicantProfile.additionalNotes}
              onChange={(e) => setApplicantProfile((p) => ({ ...p, additionalNotes: e.target.value }))}
              placeholder={t("applicantProfile.notesPlaceholder")}
              rows={3}
              className="mt-1.5 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          <button
            type="button"
            onClick={handleSaveProfile}
            disabled={savingProfile}
            className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {savingProfile ? (
              <Loader2 className="animate-spin" size={15} />
            ) : profileSaveState === "saved" ? (
              <Check size={15} />
            ) : null}
            {profileSaveState === "saved" ? t("applicantProfile.saved") : t("applicantProfile.saveButton")}
          </button>
          {profileSaveState === "error" && <p className="mt-2 text-xs text-red-600">{t("applicantProfile.saveError")}</p>}
        </div>
        </div>

        {/* Queue */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-foreground">{t("queue.heading")}</h2>
            {prefs.enabled &&
              (countdownText ? (
                <span className="flex items-center gap-1.5 rounded-full bg-sand-100 px-3 py-1.5 text-xs font-medium text-foreground/60">
                  <Clock size={13} />
                  {t("queue.nextRunIn", { time: countdownText })}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => handleRunNow()}
                  disabled={running}
                  className="flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                >
                  {running ? <Loader2 className="animate-spin" size={13} /> : <Play size={13} />}
                  {running ? t("queue.running") : t("queue.runNow")}
                </button>
              ))}
          </div>
          {runError && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-red-600">
              <AlertTriangle size={13} />
              {runError}
            </p>
          )}
          {runNote && (
            <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle size={13} className="shrink-0" />
              <span>
                {runNote}
                {/* Only the missing-resume-name case has a concrete, one-click fix — link straight to it
                    rather than making the user go find the Resume page themselves. */}
                {runNote === t("queue.reason.no_resume") && (
                  <>
                    {" "}
                    <Link href="/dashboard/resume" className="font-semibold underline underline-offset-2">
                      {t("queue.reason.fixResumeLink")}
                    </Link>
                  </>
                )}
              </span>
            </p>
          )}
          <div className="mt-3 space-y-3">
            {loadingQueue && <p className="text-sm text-foreground/50">{t("loading")}</p>}
            {!loadingQueue && queue.length === 0 && (
              <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-foreground/50">
                {t("queue.empty")}
              </p>
            )}
            {!loadingQueue &&
              queue.map((item) => (
                <div key={item.id} className="rounded-2xl border border-border bg-surface p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-foreground">{item.title}</h3>
                      <p className="mt-0.5 text-sm text-foreground/60">
                        {item.company}
                        {item.location ? ` · ${item.location}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-none flex-wrap items-center justify-end gap-1.5">
                      <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        <Sparkles size={12} />
                        {t("queue.matchScore", { score: item.match_score })}
                      </span>
                      {item.ats_platform && (
                        <span className="flex items-center gap-1 rounded-full bg-sand-100 px-2.5 py-1 text-xs font-medium text-foreground/60">
                          <Building2 size={12} />
                          {t.has(`queue.atsBadge.${item.ats_platform}`)
                            ? t(`queue.atsBadge.${item.ats_platform}`)
                            : item.ats_platform}
                        </span>
                      )}
                    </div>
                  </div>

                  {item.ats_platform && ATS_TIP_PLATFORMS.includes(item.ats_platform) && (
                    <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-sand-50 px-3 py-2 text-xs text-foreground/70">
                      <Info size={13} className="mt-0.5 flex-none" />
                      {t(`queue.atsTip.${item.ats_platform}`)}
                    </p>
                  )}

                  {popupBlockedId === item.id && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
                      <span className="flex items-start gap-1.5">
                        <AlertTriangle size={14} className="mt-0.5 flex-none" />
                        {t("queue.popupBlocked")}
                      </span>
                      <a
                        href={item.apply_url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 rounded-full bg-amber-600 px-3 py-1.5 font-semibold text-white hover:bg-amber-700"
                      >
                        {t("queue.openAgain")}
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  )}

                  {item.cover_letter && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs font-semibold text-emerald-700 hover:text-emerald-800">
                        {t("queue.coverLetterHeading")}
                      </summary>
                      <textarea
                        readOnly
                        value={item.cover_letter}
                        rows={6}
                        className="mt-2 w-full resize-y rounded-lg border border-border bg-background p-2.5 text-xs leading-relaxed text-foreground"
                      />
                      <button
                        onClick={() => handleCopy(item)}
                        className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-foreground/60 hover:text-foreground"
                      >
                        {copiedId === item.id ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                        {copiedId === item.id ? t("queue.copied") : t("queue.copy")}
                      </button>
                    </details>
                  )}

                  {/* Application Assist: ready-to-paste draft answers to this
                      job's screening questions — drafted from the resume +
                      Application Profile (real, fetched Greenhouse
                      questions for Greenhouse postings; the common
                      cross-platform questions otherwise). Never auto-filled
                      or auto-submitted anywhere — copy-per-answer, paste by
                      hand, same review-then-send principle as the cover
                      letter above. */}
                  {item.suggested_answers && item.suggested_answers.length > 0 ? (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs font-semibold text-emerald-700 hover:text-emerald-800">
                        {t("queue.qaHeading")}
                      </summary>
                      <p className="mt-1.5 text-xs text-foreground/50">{t("queue.qaHint")}</p>
                      <div className="mt-2 space-y-2.5">
                        {item.suggested_answers.map((qa, idx) => {
                          const qaKey = `${item.id}:${idx}`;
                          return (
                            <div key={qaKey} className="rounded-lg border border-border bg-background p-2.5">
                              <p className="text-xs font-semibold text-foreground">{qa.question}</p>
                              <p className="mt-1 text-xs leading-relaxed text-foreground/70">{qa.answer}</p>
                              <button
                                onClick={() => handleCopyAnswer(item, idx, qa.answer)}
                                className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-foreground/60 hover:text-foreground"
                              >
                                {copiedQaKey === qaKey ? (
                                  <Check size={12} className="text-emerald-600" />
                                ) : (
                                  <Copy size={12} />
                                )}
                                {copiedQaKey === qaKey ? t("queue.copied") : t("queue.qaCopyAnswer")}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  ) : (
                    <p className="mt-3 text-xs text-foreground/40">{t("queue.qaEmpty")}</p>
                  )}

                  <div className="mt-4 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleSend(item)}
                      disabled={sendingId === item.id}
                      className="flex items-center justify-center gap-1.5 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-70"
                    >
                      {sendingId === item.id ? (
                        <Loader2 className="animate-spin" size={14} />
                      ) : (
                        <ExternalLink size={14} />
                      )}
                      {t("queue.sendCta")}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDismiss(item)}
                      className="flex items-center gap-1 rounded-full px-3 py-2 text-sm font-medium text-foreground/50 hover:text-foreground"
                    >
                      <X size={14} />
                      {t("queue.dismissCta")}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReportExpired(item)}
                      title={t("queue.reportExpiredHint")}
                      className="flex items-center gap-1 rounded-full px-3 py-2 text-xs font-medium text-foreground/40 hover:text-amber-700"
                    >
                      <Flag size={13} />
                      {t("queue.reportExpired")}
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
