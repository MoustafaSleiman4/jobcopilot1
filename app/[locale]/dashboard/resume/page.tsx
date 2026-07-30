"use client";

import { useState, useRef, useEffect, ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  Upload,
  Sparkles,
  Save,
  FileCheck2,
  AlertCircle,
  Download,
  Lock,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import ResumePreview from "@/components/ResumePreview";
import type { StructuredResume } from "@/lib/resume-types";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

const DEMO_STRUCTURED: StructuredResume = {
  fullName: "Your Name",
  title: "Marketing Coordinator",
  summary:
    "Marketing coordinator with 3 years of experience running paid social campaigns for retail brands across the UAE.",
  skills: ["Paid Social", "Campaign Analytics", "Arabic & English Copywriting"],
  experience: [],
  education: [],
};

type ResumeContent = {
  original?: string | null;
  enhanced?: string;
  structured?: StructuredResume;
  aiEnhanceCount?: number;
};

export default function ResumeBuilderPage() {
  const t = useTranslations("dashboard.resume");

  const [structured, setStructured] = useState<StructuredResume>(DEMO_STRUCTURED);
  const [originalText, setOriginalText] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [isDemoContent, setIsDemoContent] = useState(true);

  const [enhancing, setEnhancing] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [pipelineErrorMsg, setPipelineErrorMsg] = useState<string | null>(null);
  const [enhanceCount, setEnhanceCount] = useState(0);
  const [showEnhanceLimit, setShowEnhanceLimit] = useState(false);

  const [userId, setUserId] = useState<string | null | undefined>(undefined); // undefined = not checked yet
  const [plan, setPlan] = useState<"free" | "pro">("free");
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [loadErrorMsg, setLoadErrorMsg] = useState<string | null>(null);

  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "success" | "error">(
    "idle"
  );
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadErrorMsg, setUploadErrorMsg] = useState<string | null>(null);

  const [saveState, setSaveState] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadExistingResume(supabase: ReturnType<typeof createClient>, uid: string) {
      try {
        const { data: existing, error } = await supabase
          .from("resumes")
          .select("id, content")
          .eq("user_id", uid)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        if (cancelled || !existing) return;

        const content = (existing.content ?? {}) as ResumeContent;
        setResumeId(existing.id);
        if (content.structured) {
          setStructured(content.structured);
          setIsDemoContent(false);
        }
        if (typeof content.original === "string") setOriginalText(content.original);
        setEnhanceCount(content.aiEnhanceCount ?? 0);
      } catch (err) {
        console.error("[resume] failed to load saved resume:", err);
        if (!cancelled) setLoadErrorMsg(t("loadError"));
      }
    }

    try {
      const supabase = createClient();
      supabase.auth
        .getUser()
        .then(async ({ data }) => {
          if (cancelled) return;
          const uid = data.user?.id ?? null;
          setUserId(uid);
          if (!uid) return;

          const { data: profile } = await supabase
            .from("profiles")
            .select("plan")
            .eq("id", uid)
            .single();
          if (!cancelled && profile?.plan === "pro") setPlan("pro");

          await loadExistingResume(supabase, uid);
        })
        .catch((err: unknown) => {
          // A network/auth failure here (not just "unconfigured") should
          // still resolve to "no user" rather than leaving the page stuck
          // thinking the session check is still in progress forever.
          console.error("[resume] Supabase getUser() failed:", err);
          if (!cancelled) setUserId(null);
        });
    } catch (err) {
      // Supabase not configured yet — treat as no user, features stay disabled.
      console.error("[resume] Supabase client unavailable:", err);
      setUserId(null);
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runEnhance(text: string): Promise<StructuredResume> {
    const res = await fetch("/api/resume/enhance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "AI enhancement failed");
    }
    const data = await res.json();
    return data.structured as StructuredResume;
  }

  async function persistContent(id: string, content: ResumeContent) {
    try {
      const supabase = createClient();
      await supabase.from("resumes").update({ content, updated_at: new Date().toISOString() }).eq("id", id);
    } catch (err) {
      console.error("[resume] failed to persist content:", err);
    }
  }

  // Free-plan users get exactly one AI enhancement (whether that's the
  // automatic pass right after upload, or a manual re-run); after that,
  // further AI rewrites require Pro. Pro has no limit.
  function enhanceLimitBlocks(): boolean {
    return plan !== "pro" && enhanceCount >= 1;
  }

  async function handleEnhance() {
    if (!originalText) return;
    if (enhanceLimitBlocks()) {
      setShowEnhanceLimit(true);
      return;
    }

    setEnhancing(true);
    setPipelineErrorMsg(null);
    setShowEnhanceLimit(false);
    try {
      const result = await runEnhance(originalText);
      setStructured(result);
      setIsDemoContent(false);
      const nextCount = enhanceCount + 1;
      setEnhanceCount(nextCount);
      if (resumeId) {
        await persistContent(resumeId, { original: originalText, structured: result, aiEnhanceCount: nextCount });
      }
    } catch (err) {
      console.error("[resume] manual enhance failed:", err);
      setPipelineErrorMsg(err instanceof Error ? err.message : "AI enhancement failed");
    } finally {
      setEnhancing(false);
    }
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;

    if (!userId) {
      setUploadState("error");
      setUploadErrorMsg(t("loginRequired"));
      return;
    }

    if (file.size > MAX_FILE_BYTES) {
      setUploadState("error");
      setUploadErrorMsg(t("uploadTooBig"));
      return;
    }

    setUploadState("uploading");
    setUploadErrorMsg(null);
    setPipelineErrorMsg(null);
    setShowEnhanceLimit(false);

    let newResumeId: string | null = resumeId;

    try {
      const supabase = createClient();
      const path = `${userId}/${Date.now()}-${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from("resumes")
        .upload(path, file, { upsert: false });
      if (uploadError) throw uploadError;

      if (newResumeId) {
        const { error: updateError } = await supabase
          .from("resumes")
          .update({ title: file.name, file_url: path })
          .eq("id", newResumeId);
        if (updateError) throw updateError;
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from("resumes")
          .insert({ user_id: userId, title: file.name, file_url: path, content: {}, is_primary: true })
          .select("id")
          .single();
        if (insertError) throw insertError;
        newResumeId = inserted?.id ?? null;
        setResumeId(newResumeId);
      }

      setUploadedFileName(file.name);
      setUploadState("success");
    } catch (err) {
      console.error("[resume] upload failed:", err);
      setUploadState("error");
      setUploadErrorMsg(err instanceof Error ? err.message : t("uploadError"));
      return; // don't attempt to parse/enhance a file that failed to upload
    }

    // Extract text from the file, then run it through the AI rewrite —
    // both steps are best-effort: if either fails, the user still has their
    // file safely uploaded.
    setParsing(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const parseRes = await fetch("/api/resume/parse", { method: "POST", body: formData });
      const parseData = await parseRes.json();
      if (!parseRes.ok) throw new Error(parseData.error ?? "Could not read this file.");

      const extracted: string = parseData.text;
      setOriginalText(extracted);
      setParsing(false);

      if (enhanceLimitBlocks()) {
        // They've already used their one free AI enhancement — the file is
        // uploaded and readable (via "view original text"), but we don't
        // auto-spend an AI call they'd need Pro for.
        setShowEnhanceLimit(true);
        if (newResumeId) await persistContent(newResumeId, { original: extracted, structured, aiEnhanceCount: enhanceCount });
        return;
      }

      setEnhancing(true);
      const result = await runEnhance(extracted);
      setStructured(result);
      setIsDemoContent(false);
      const nextCount = enhanceCount + 1;
      setEnhanceCount(nextCount);

      if (newResumeId) {
        await persistContent(newResumeId, { original: extracted, structured: result, aiEnhanceCount: nextCount });
      }
    } catch (err) {
      console.error("[resume] parse/enhance pipeline failed:", err);
      setPipelineErrorMsg(err instanceof Error ? err.message : "Couldn't process this file automatically.");
    } finally {
      setParsing(false);
      setEnhancing(false);
    }
  }

  async function handleSave() {
    if (!userId) {
      setSaveState("error");
      setSaveErrorMsg(t("loginRequired"));
      return;
    }

    setSaveState("saving");
    setSaveErrorMsg(null);

    try {
      const supabase = createClient();
      const content: ResumeContent = { original: originalText, structured, aiEnhanceCount: enhanceCount };

      if (resumeId) {
        const { error } = await supabase
          .from("resumes")
          .update({ content, updated_at: new Date().toISOString() })
          .eq("id", resumeId);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await supabase
          .from("resumes")
          .insert({ user_id: userId, title: "My Resume", content, is_primary: true })
          .select("id")
          .single();
        if (error) throw error;
        setResumeId(inserted?.id ?? null);
      }

      setSaveState("success");
    } catch (err) {
      console.error("[resume] save failed:", err);
      setSaveState("error");
      setSaveErrorMsg(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function handleDownload() {
    if (plan !== "pro") {
      setShowPaywall(true);
      return;
    }

    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const marginX = 56;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let y = 64;

    function ensureRoom(next: number) {
      if (y + next > pageHeight - 48) {
        doc.addPage();
        y = 56;
      }
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text(structured.fullName || "Resume", marginX, y);
    y += 22;

    if (structured.title) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(12);
      doc.setTextColor(80);
      doc.text(structured.title, marginX, y);
      doc.setTextColor(0);
      y += 26;
    } else {
      y += 10;
    }

    function sectionHeading(label: string) {
      ensureRoom(24);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(30, 110, 80);
      doc.text(label.toUpperCase(), marginX, y);
      doc.setTextColor(0);
      y += 16;
    }

    if (structured.summary) {
      sectionHeading("Summary");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      const lines = doc.splitTextToSize(structured.summary, pageWidth - marginX * 2);
      for (const line of lines) {
        ensureRoom(14);
        doc.text(line, marginX, y);
        y += 14;
      }
      y += 8;
    }

    if (structured.skills.length > 0) {
      sectionHeading("Skills");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      const line = structured.skills.join("   •   ");
      const wrapped = doc.splitTextToSize(line, pageWidth - marginX * 2);
      for (const l of wrapped) {
        ensureRoom(14);
        doc.text(l, marginX, y);
        y += 14;
      }
      y += 8;
    }

    if (structured.experience.length > 0) {
      sectionHeading("Experience");
      for (const job of structured.experience) {
        ensureRoom(16);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10.5);
        const heading = [job.role, job.company].filter(Boolean).join(" · ");
        doc.text(heading, marginX, y);
        if (job.period) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.text(job.period, pageWidth - marginX, y, { align: "right" });
        }
        y += 13;
        if (job.location) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.setTextColor(100);
          doc.text(job.location, marginX, y);
          doc.setTextColor(0);
          y += 12;
        }
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        for (const bullet of job.bullets) {
          const wrapped = doc.splitTextToSize(`•  ${bullet}`, pageWidth - marginX * 2 - 8);
          for (const l of wrapped) {
            ensureRoom(13);
            doc.text(l, marginX + 8, y);
            y += 13;
          }
        }
        y += 6;
      }
    }

    if (structured.education.length > 0) {
      sectionHeading("Education");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      for (const ed of structured.education) {
        ensureRoom(14);
        const line = [ed.degree, ed.school].filter(Boolean).join(" · ");
        doc.text(line, marginX, y);
        if (ed.period) {
          doc.setFontSize(9);
          doc.text(ed.period, pageWidth - marginX, y, { align: "right" });
          doc.setFontSize(10.5);
        }
        y += 14;
      }
    }

    doc.save("resume.pdf");
  }

  const busy = parsing || enhancing;
  const enhanceBlockedByPlan = !!originalText && enhanceLimitBlocks();
  const canReEnhance = !!originalText && !enhanceLimitBlocks();

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
      <p className="mt-1 text-sm text-foreground/60">{t("subtitle")}</p>

      {loadErrorMsg && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertCircle className="mt-0.5 flex-none" size={16} />
          <span>{loadErrorMsg}</span>
        </div>
      )}

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <label
          className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
            uploadState === "error"
              ? "border-red-300 bg-red-50"
              : "cursor-pointer border-border bg-surface hover:border-emerald-400"
          }`}
        >
          {uploadState === "success" ? (
            <>
              <FileCheck2 className="text-emerald-600" size={28} />
              <span className="text-sm font-medium text-foreground">
                {t("uploaded")}: {uploadedFileName}
              </span>
            </>
          ) : uploadState === "error" ? (
            <>
              <AlertCircle className="text-red-500" size={28} />
              <span className="text-sm font-medium text-red-600">{uploadErrorMsg}</span>
            </>
          ) : (
            <>
              <Upload className="text-emerald-600" size={28} />
              <span className="text-sm font-medium text-foreground">
                {uploadState === "uploading" ? t("uploading") : t("upload")}
              </span>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx"
            className="hidden"
            disabled={uploadState === "uploading"}
            onChange={handleFileChange}
          />
        </label>
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-surface p-8 text-center text-sm text-foreground/60">
          {t("orBuild")}
        </div>
      </div>

      {busy && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          <Loader2 className="animate-spin" size={16} />
          {parsing ? t("parsing") : t("rewriting")}
        </div>
      )}

      {pipelineErrorMsg && !busy && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertCircle className="mt-0.5 flex-none" size={16} />
          <span>{pipelineErrorMsg}</span>
        </div>
      )}

      {showEnhanceLimit && !busy && (
        <div className="mt-4 flex flex-col items-start gap-3 rounded-xl border border-gold-400/40 bg-gold-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <Lock className="mt-0.5 text-gold-600" size={16} />
            <p className="text-sm text-foreground/80">{t("enhanceLimitReached")}</p>
          </div>
          <Link
            href="/pricing"
            className="flex-none rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            {t("upgradeCta")}
          </Link>
        </div>
      )}

      {originalText && (
        <div className="mt-4">
          <button
            onClick={() => setShowOriginal((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold text-foreground/60 hover:text-foreground"
          >
            {showOriginal ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {showOriginal ? t("hideOriginal") : t("viewOriginal")}
          </button>
          {showOriginal && (
            <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl border border-border bg-sand-50 p-4 font-sans text-xs leading-relaxed text-foreground/70">
              {originalText}
            </pre>
          )}
        </div>
      )}

      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">{t("aiImprovedLabel")}</h2>
          <button
            onClick={handleEnhance}
            disabled={busy || !originalText}
            title={enhanceBlockedByPlan ? t("enhanceLimitReached") : undefined}
            className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
          >
            {enhanceBlockedByPlan ? <Lock size={12} className="text-gold-500" /> : <Sparkles size={14} />}
            {enhancing ? t("enhancing") : t("reEnhance")}
          </button>
        </div>
        <p className="mb-3 text-xs text-foreground/50">
          {isDemoContent ? t("noResumeYet") : t("aiImprovedNote")}
        </p>

        <ResumePreview
          resume={structured}
          labels={{
            summary: t("sectionSummary"),
            skills: t("sectionSkills"),
            experience: t("sectionExperience"),
            education: t("sectionEducation"),
          }}
        />

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saveState === "saving"}
            className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            <Save size={15} />
            {saveState === "saving" ? t("saving") : t("save")}
          </button>

          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-sand-100"
          >
            {plan === "pro" ? <Download size={15} /> : <Lock size={14} className="text-gold-500" />}
            {t("download")}
          </button>

          {saveState === "success" && (
            <span className="text-sm font-medium text-emerald-600">{t("saved")}</span>
          )}
          {saveState === "error" && (
            <span className="text-sm font-medium text-red-600">{saveErrorMsg}</span>
          )}
        </div>

        {showPaywall && (
          <div className="mt-5 flex flex-col items-start gap-3 rounded-xl border border-gold-400/40 bg-gold-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5">
              <Lock className="mt-0.5 text-gold-600" size={16} />
              <p className="text-sm text-foreground/80">{t("downloadLocked")}</p>
            </div>
            <Link
              href="/pricing"
              className="flex-none rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              {t("upgradeCta")}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
