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

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB
const DEMO_RESUME =
  "Marketing coordinator with 3 years of experience running paid social campaigns for retail brands across the UAE.";

export default function ResumeBuilderPage() {
  const t = useTranslations("dashboard.resume");

  // The single source of truth for "what the user currently sees/edits" —
  // starts as demo placeholder text, becomes the AI-improved version once a
  // resume has been uploaded and enhanced.
  const [resumeText, setResumeText] = useState(DEMO_RESUME);
  const [originalText, setOriginalText] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);

  const [enhancing, setEnhancing] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [pipelineErrorMsg, setPipelineErrorMsg] = useState<string | null>(null);

  const [userId, setUserId] = useState<string | null | undefined>(undefined); // undefined = not checked yet
  const [plan, setPlan] = useState<"free" | "pro">("free");
  const [resumeId, setResumeId] = useState<string | null>(null);

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
    try {
      const supabase = createClient();
      supabase.auth.getUser().then(async ({ data }) => {
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
      }).catch((err: unknown) => {
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
  }, []);

  async function runEnhance(text: string): Promise<string> {
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
    return data.enhanced ?? text;
  }

  async function handleEnhance() {
    setEnhancing(true);
    setPipelineErrorMsg(null);
    try {
      const enhanced = await runEnhance(resumeText);
      setResumeText(enhanced);
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

    let newResumeId: string | null = null;

    try {
      const supabase = createClient();
      const path = `${userId}/${Date.now()}-${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from("resumes")
        .upload(path, file, { upsert: false });
      if (uploadError) throw uploadError;

      const { data: inserted, error: insertError } = await supabase
        .from("resumes")
        .insert({ user_id: userId, title: file.name, file_url: path, content: {} })
        .select("id")
        .single();
      if (insertError) throw insertError;

      newResumeId = inserted?.id ?? null;
      setResumeId(newResumeId);
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
    // file safely uploaded and can type/paste text manually below.
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

      setEnhancing(true);
      const enhanced = await runEnhance(extracted);
      setResumeText(enhanced);

      if (newResumeId) {
        try {
          const supabase = createClient();
          await supabase
            .from("resumes")
            .update({ content: { original: extracted, enhanced } })
            .eq("id", newResumeId);
        } catch (err) {
          console.error("[resume] failed to persist AI-enhanced content:", err);
        }
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
      const content = { original: originalText, enhanced: resumeText };

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
    const pageHeight = doc.internal.pageSize.getHeight();
    let y = 72;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("My Resume", marginX, y);
    y += 28;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    const lines = doc.splitTextToSize(resumeText, 500);
    for (const line of lines) {
      if (y > pageHeight - 56) {
        doc.addPage();
        y = 56;
      }
      doc.text(line, marginX, y);
      y += 15;
    }

    doc.save("resume.pdf");
  }

  const busy = parsing || enhancing;

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
      <p className="mt-1 text-sm text-foreground/60">{t("subtitle")}</p>

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

      <div className="mt-8 rounded-2xl border border-border bg-surface p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">
            {originalText ? t("aiImprovedLabel") : "Professional summary"}
          </h2>
          <button
            onClick={handleEnhance}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
          >
            <Sparkles size={14} />
            {enhancing ? t("enhancing") : t("enhance")}
          </button>
        </div>
        {originalText && (
          <p className="mt-1.5 text-xs text-foreground/50">{t("aiImprovedNote")}</p>
        )}
        <textarea
          value={resumeText}
          onChange={(e) => setResumeText(e.target.value)}
          rows={originalText ? 14 : 6}
          className="mt-4 w-full rounded-lg border border-border bg-background p-3 text-sm leading-relaxed focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
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
