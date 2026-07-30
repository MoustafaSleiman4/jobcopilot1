"use client";

import { useState, useRef, useEffect, ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { Upload, Sparkles, Save, FileCheck2, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

export default function ResumeBuilderPage() {
  const t = useTranslations("dashboard.resume");
  const [summary, setSummary] = useState(
    "Marketing coordinator with 3 years of experience running paid social campaigns for retail brands across the UAE."
  );
  const [enhancing, setEnhancing] = useState(false);

  const [userId, setUserId] = useState<string | null | undefined>(undefined); // undefined = not checked yet
  const [resumeId, setResumeId] = useState<string | null>(null);

  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "success" | "error">(
    "idle"
  );
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadErrorMsg, setUploadErrorMsg] = useState<string | null>(null);

  const [saveState, setSaveState] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    try {
      const supabase = createClient();
      supabase.auth.getUser().then(({ data }) => {
        if (!cancelled) setUserId(data.user?.id ?? null);
      });
    } catch {
      // Supabase not configured yet — treat as no user, features stay disabled.
      setUserId(null);
    }
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleEnhance() {
    setEnhancing(true);
    try {
      const res = await fetch("/api/resume/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: summary }),
      });
      const data = await res.json();
      setSummary(data.enhanced ?? summary);
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

      setResumeId(inserted?.id ?? null);
      setUploadedFileName(file.name);
      setUploadState("success");
    } catch (err) {
      setUploadState("error");
      setUploadErrorMsg(err instanceof Error ? err.message : t("uploadError"));
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
      const content = { summary };

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
      setSaveState("error");
      setSaveErrorMsg(err instanceof Error ? err.message : "Save failed");
    }
  }

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

      <div className="mt-8 rounded-2xl border border-border bg-surface p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Professional summary</h2>
          <button
            onClick={handleEnhance}
            disabled={enhancing}
            className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
          >
            <Sparkles size={14} />
            {enhancing ? t("enhancing") : t("enhance")}
          </button>
        </div>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={6}
          className="mt-4 w-full rounded-lg border border-border bg-background p-3 text-sm leading-relaxed focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saveState === "saving"}
            className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            <Save size={15} />
            {saveState === "saving" ? t("saving") : t("save")}
          </button>
          {saveState === "success" && (
            <span className="text-sm font-medium text-emerald-600">{t("saved")}</span>
          )}
          {saveState === "error" && (
            <span className="text-sm font-medium text-red-600">{saveErrorMsg}</span>
          )}
        </div>
      </div>
    </div>
  );
}
