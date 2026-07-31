"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { downloadTextPdf } from "@/lib/text-pdf";
import type { StructuredResume } from "@/lib/resume-types";
import {
  Sparkles,
  Loader2,
  Lock,
  Download,
  Copy,
  Check,
  AlertCircle,
  Mail,
} from "lucide-react";

type ResumeContent = { structured?: StructuredResume };
type ResumeOption = { id: string; title: string; structured: StructuredResume };
type Tone = "professional" | "enthusiastic" | "concise";

export default function CoverLetterPage() {
  const t = useTranslations("dashboard.coverLetter");

  const [checking, setChecking] = useState(true);
  const [plan, setPlan] = useState<"free" | "pro">("free");
  const [resumes, setResumes] = useState<ResumeOption[]>([]);
  const [resumeId, setResumeId] = useState<string>("");

  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [tone, setTone] = useState<Tone>("professional");

  const [generating, setGenerating] = useState(false);
  const [letter, setLetter] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        const uid = data.user?.id;
        if (!uid || cancelled) return;

        const { data: profile } = await supabase.from("profiles").select("plan").eq("id", uid).single();
        if (!cancelled && profile?.plan === "pro") setPlan("pro");

        const { data: resumeRows } = await supabase
          .from("resumes")
          .select("id, title, content, is_primary")
          .eq("user_id", uid)
          .order("is_primary", { ascending: false })
          .order("updated_at", { ascending: false });
        if (cancelled) return;

        const options = (resumeRows ?? [])
          .map((row) => {
            const content = (row.content ?? {}) as ResumeContent;
            return content.structured
              ? { id: row.id as string, title: (row.title as string) || t("untitledResume"), structured: content.structured }
              : null;
          })
          .filter((r): r is ResumeOption => r !== null);
        setResumes(options);
        if (options[0]) setResumeId(options[0].id);
      } catch {
        // Not logged in / Supabase not configured — stays on free/locked view.
      } finally {
        if (!cancelled) setChecking(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleGenerate() {
    const selected = resumes.find((r) => r.id === resumeId);
    if (!selected) {
      setErrorMsg(t("noResumeSelected"));
      return;
    }
    setGenerating(true);
    setErrorMsg(null);
    setCopied(false);
    try {
      const res = await fetch("/api/resume/cover-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resume: selected.structured,
          jobTitle,
          company,
          jobDescription,
          tone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      setLetter(data.letter as string);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t("generateError"));
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(letter);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can fail in some contexts — not critical, the
      // letter is still visible and selectable in the textarea.
    }
  }

  async function handleDownload() {
    const filenameBase = [jobTitle, company].filter(Boolean).join("-").replace(/\s+/g, "-") || "cover-letter";
    await downloadTextPdf(t("pdfTitle"), letter.split("\n"), `${filenameBase}.pdf`);
  }

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
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
      <p className="mt-1 text-sm text-foreground/60">{t("subtitle")}</p>

      {resumes.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-border p-4 text-sm text-foreground/50">
          {t("noResumesYet")}{" "}
          <Link href="/dashboard/resume" className="font-semibold text-emerald-700 hover:text-emerald-800">
            {t("goBuildResume")}
          </Link>
        </p>
      ) : (
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
            <span className="font-medium text-foreground/80">{t("resumeLabel")}</span>
            <select
              value={resumeId}
              onChange={(e) => setResumeId(e.target.value)}
              className="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              {resumes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground/80">{t("jobTitleLabel")}</span>
            <input
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder={t("jobTitlePlaceholder")}
              className="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground/80">{t("companyLabel")}</span>
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder={t("companyPlaceholder")}
              className="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
            <span className="font-medium text-foreground/80">{t("jobDescriptionLabel")}</span>
            <textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder={t("jobDescriptionPlaceholder")}
              rows={4}
              className="resize-y rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground/80">{t("toneLabel")}</span>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value as Tone)}
              className="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="professional">{t("toneProfessional")}</option>
              <option value="enthusiastic">{t("toneEnthusiastic")}</option>
              <option value="concise">{t("toneConcise")}</option>
            </select>
          </label>
        </div>
      )}

      {resumes.length > 0 && (
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="mt-6 flex items-center gap-1.5 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {generating ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
          {generating ? t("generating") : t("generate")}
        </button>
      )}

      {errorMsg && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertCircle className="mt-0.5 flex-none" size={16} />
          <span>{errorMsg}</span>
        </div>
      )}

      {letter && (
        <div className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Mail size={15} />
              {t("resultLabel")}
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-sand-100"
              >
                {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                {copied ? t("copied") : t("copy")}
              </button>
              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                <Download size={13} />
                {t("downloadPdf")}
              </button>
            </div>
          </div>
          <textarea
            value={letter}
            onChange={(e) => setLetter(e.target.value)}
            rows={16}
            className="w-full resize-y rounded-2xl border border-border bg-surface p-5 text-sm leading-relaxed text-foreground focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
          <p className="mt-2 text-xs text-foreground/50">{t("editableNote")}</p>
        </div>
      )}
    </div>
  );
}
