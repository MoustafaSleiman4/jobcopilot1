"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { downloadResumePdf } from "@/lib/resume-pdf";
import {
  emptyStructuredResume,
  RESUME_FORMATS,
  DEFAULT_RESUME_STYLE,
  type CustomSection,
  type StructuredResume,
} from "@/lib/resume-types";
import ResumePreview from "@/components/ResumePreview";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Sparkles,
  Loader2,
  Save,
  Download,
  Lock,
  Copy,
  Star,
  Eye,
  PenSquare,
  X,
  AlertCircle,
  Table2,
  List,
  Columns,
  Upload,
  FileCheck2,
  User,
} from "lucide-react";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB, matches the /dashboard/resume upload flow

function newSectionId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `section-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type ResumeContent = {
  original?: string | null;
  structured?: StructuredResume;
  aiEnhanceCount?: number;
};

const ACCENTS: { key: "emerald" | "gold" | "slate"; swatch: string }[] = [
  { key: "emerald", swatch: "bg-emerald-600" },
  { key: "gold", swatch: "bg-gold-500" },
  { key: "slate", swatch: "bg-slate-600" },
];

// Only jsPDF's built-in standard fonts (no embedding needed) are offered —
// see the comment in lib/resume-pdf.ts — so whichever one is picked here
// renders identically in the downloaded PDF, not just in this preview.
const FONT_FAMILIES: { key: "sans" | "serif" | "mono"; labelKey: string; previewClass: string }[] = [
  { key: "sans", labelKey: "fontSans", previewClass: "font-sans" },
  { key: "serif", labelKey: "fontSerif", previewClass: "font-serif" },
  { key: "mono", labelKey: "fontMono", previewClass: "font-mono" },
];

const FONT_SIZES: { key: "compact" | "standard" | "large"; labelKey: string }[] = [
  { key: "compact", labelKey: "sizeCompact" },
  { key: "standard", labelKey: "sizeStandard" },
  { key: "large", labelKey: "sizeLarge" },
];

// Preset language options, led by the three most relevant to this app's
// Gulf/Levant/MEA job market (Arabic, English, French) plus the other
// languages most commonly seen on resumes in the region (South Asian and
// Southeast Asian languages given the size of that expat workforce in the
// Gulf, plus a handful of other major world languages). These are stored
// verbatim as the resume's actual printed content (same as every other
// resume field), not translated per dashboard UI language — a resume
// written in English should say "French", not whatever Arabic-UI label was
// active when it was picked. "Other" reveals a free-text field below so a
// language outside this list is never a dead end.
const LANGUAGE_NAME_PRESETS = [
  "Arabic",
  "English",
  "French",
  "Hindi",
  "Urdu",
  "Tagalog",
  "Spanish",
  "German",
  "Turkish",
  "Russian",
  "Mandarin Chinese",
];

// Kept to exactly 3 tiers, matching the standard "how well do you speak
// this" resume convention.
const LANGUAGE_LEVEL_PRESETS = ["Basic", "Intermediate", "Fluent"];

export default function ResumeBuilderForm() {
  const t = useTranslations("dashboard.resumeBuilder");
  const searchParams = useSearchParams();
  const router = useRouter();
  const idParam = searchParams.get("id");

  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [plan, setPlan] = useState<"free" | "pro">("free");
  const [resumeId, setResumeId] = useState<string | null>(idParam);
  const [versionTitle, setVersionTitle] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [structured, setStructured] = useState<StructuredResume>(emptyStructuredResume());
  const [aiUsed, setAiUsed] = useState(0);
  const resumeStyle = structured.style ?? DEFAULT_RESUME_STYLE;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [dirty, setDirty] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showAiLimit, setShowAiLimit] = useState(false);
  const [improvingField, setImprovingField] = useState<string | null>(null);
  const [improveError, setImproveError] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<"edit" | "preview">("edit");
  const [skillInput, setSkillInput] = useState("");
  const [uploadState, setUploadState] = useState<"idle" | "parsing" | "enhancing" | "success" | "error">("idle");
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadErrorMsg, setUploadErrorMsg] = useState<string | null>(null);

  // A personal photo is account-level (public.profiles.avatar_url), managed
  // from /dashboard/resume, not edited per resume version here — this
  // builder just reads it, so the same photo shows up in the preview and
  // the downloaded PDF for every resume version.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        const uid = data.user?.id ?? null;
        if (cancelled) return;
        setUserId(uid);
        if (!uid) {
          setLoading(false);
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("plan, avatar_url")
          .eq("id", uid)
          .single();
        if (!cancelled && profile?.plan === "pro") setPlan("pro");
        if (!cancelled) setAvatarUrl(profile?.avatar_url ?? null);

        if (idParam) {
          const { data: row, error } = await supabase
            .from("resumes")
            .select("id, title, content, is_primary")
            .eq("id", idParam)
            .eq("user_id", uid)
            .maybeSingle();
          if (error) throw error;
          if (!row) {
            if (!cancelled) setLoadError(t("notFound"));
          } else if (!cancelled) {
            const content = (row.content ?? {}) as ResumeContent;
            setResumeId(row.id);
            setVersionTitle(row.title || "");
            setIsPrimary(!!row.is_primary);
            setStructured({ ...emptyStructuredResume(), ...(content.structured ?? {}) });
            setAiUsed(content.aiEnhanceCount ?? 0);
          }
        }
      } catch (err) {
        console.error("[resume-builder] failed to load:", err);
        if (!cancelled) setLoadError(t("loadError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idParam]);

  // Returns the new full object (not just void) so callers that need the
  // up-to-date value synchronously — namely the AI-improve flow below,
  // which persists to Supabase right after applying a result — don't read
  // a stale value out of the `structured` state closure before React has
  // committed the update.
  function update<K extends keyof StructuredResume>(key: K, value: StructuredResume[K]): StructuredResume {
    const next = { ...structured, [key]: value };
    setStructured(next);
    setDirty(true);
    return next;
  }

  // Saved directly on the resume (structured.style) rather than as separate
  // component state — this is the single source of truth both the preview
  // and the downloaded PDF read, so a choice made here can never drift out
  // of sync with what actually gets exported (previously the accent-color
  // picker below only ever affected the on-screen preview; downloadResumePdf
  // was never told about it at all, which is the exact "download changes
  // font and color" bug this fixes).
  function updateStyle(patch: Partial<NonNullable<StructuredResume["style"]>>) {
    update("style", { ...DEFAULT_RESUME_STYLE, ...structured.style, ...patch });
  }

  // --- Skills ---
  function addSkill() {
    const v = skillInput.trim();
    if (!v || structured.skills.includes(v)) {
      setSkillInput("");
      return;
    }
    update("skills", [...structured.skills, v]);
    setSkillInput("");
  }
  function removeSkill(skill: string) {
    update(
      "skills",
      structured.skills.filter((s) => s !== skill)
    );
  }

  // --- Experience ---
  function addExperience() {
    update("experience", [...structured.experience, { role: "", company: "", location: "", period: "", bullets: [] }]);
  }
  function updateExperience(i: number, patch: Partial<StructuredResume["experience"][number]>): StructuredResume {
    return update(
      "experience",
      structured.experience.map((e, idx) => (idx === i ? { ...e, ...patch } : e))
    );
  }
  function removeExperience(i: number) {
    update(
      "experience",
      structured.experience.filter((_, idx) => idx !== i)
    );
  }
  function addBullet(i: number) {
    updateExperience(i, { bullets: [...structured.experience[i].bullets, ""] });
  }
  function updateBullet(i: number, bi: number, value: string): StructuredResume {
    return updateExperience(i, {
      bullets: structured.experience[i].bullets.map((b, idx) => (idx === bi ? value : b)),
    });
  }
  function removeBullet(i: number, bi: number) {
    updateExperience(i, { bullets: structured.experience[i].bullets.filter((_, idx) => idx !== bi) });
  }

  // --- Education ---
  function addEducation() {
    update("education", [...structured.education, { degree: "", school: "", period: "" }]);
  }
  function updateEducation(i: number, patch: Partial<StructuredResume["education"][number]>) {
    update(
      "education",
      structured.education.map((e, idx) => (idx === i ? { ...e, ...patch } : e))
    );
  }
  function removeEducation(i: number) {
    update(
      "education",
      structured.education.filter((_, idx) => idx !== i)
    );
  }

  // --- Certifications ---
  const certifications = structured.certifications ?? [];
  function addCertification() {
    update("certifications", [...certifications, { name: "", issuer: "", year: "" }]);
  }
  function updateCertification(i: number, patch: Partial<{ name: string; issuer: string; year: string }>) {
    update(
      "certifications",
      certifications.map((c, idx) => (idx === i ? { ...c, ...patch } : c))
    );
  }
  function removeCertification(i: number) {
    update(
      "certifications",
      certifications.filter((_, idx) => idx !== i)
    );
  }

  // --- Languages ---
  const languages = structured.languages ?? [];
  function addLanguage() {
    update("languages", [...languages, { name: "", level: "" }]);
  }
  function updateLanguage(i: number, patch: Partial<{ name: string; level: string }>) {
    update(
      "languages",
      languages.map((l, idx) => (idx === i ? { ...l, ...patch } : l))
    );
  }
  function removeLanguage(i: number) {
    update(
      "languages",
      languages.filter((_, idx) => idx !== i)
    );
  }

  // --- Custom sections (tables + lists) ---
  const customSections = structured.customSections ?? [];
  function addCustomSection(type: "table" | "list") {
    const section: CustomSection =
      type === "table"
        ? { id: newSectionId(), title: "", type: "table", columns: [t("column"), t("column")], rows: [["", ""]] }
        : { id: newSectionId(), title: "", type: "list", columns: [], rows: [[""]] };
    update("customSections", [...customSections, section]);
  }
  function updateCustomSection(id: string, patch: Partial<CustomSection>) {
    update(
      "customSections",
      customSections.map((cs) => (cs.id === id ? { ...cs, ...patch } : cs))
    );
  }
  function removeCustomSection(id: string) {
    update(
      "customSections",
      customSections.filter((cs) => cs.id !== id)
    );
  }
  function addCustomColumn(id: string) {
    const cs = customSections.find((c) => c.id === id);
    if (!cs) return;
    updateCustomSection(id, {
      columns: [...cs.columns, t("column")],
      rows: cs.rows.map((row) => [...row, ""]),
    });
  }
  function removeCustomColumn(id: string, colIndex: number) {
    const cs = customSections.find((c) => c.id === id);
    if (!cs || cs.columns.length <= 1) return;
    updateCustomSection(id, {
      columns: cs.columns.filter((_, i) => i !== colIndex),
      rows: cs.rows.map((row) => row.filter((_, i) => i !== colIndex)),
    });
  }
  function updateCustomColumnHeader(id: string, colIndex: number, value: string) {
    const cs = customSections.find((c) => c.id === id);
    if (!cs) return;
    updateCustomSection(id, { columns: cs.columns.map((c, i) => (i === colIndex ? value : c)) });
  }
  function addCustomRow(id: string) {
    const cs = customSections.find((c) => c.id === id);
    if (!cs) return;
    const width = cs.type === "table" ? Math.max(cs.columns.length, 1) : 1;
    updateCustomSection(id, { rows: [...cs.rows, Array(width).fill("")] });
  }
  function updateCustomCell(id: string, rowIndex: number, colIndex: number, value: string) {
    const cs = customSections.find((c) => c.id === id);
    if (!cs) return;
    updateCustomSection(id, {
      rows: cs.rows.map((row, ri) => (ri === rowIndex ? row.map((cell, ci) => (ci === colIndex ? value : cell)) : row)),
    });
  }
  function removeCustomRow(id: string, rowIndex: number) {
    const cs = customSections.find((c) => c.id === id);
    if (!cs) return;
    updateCustomSection(id, { rows: cs.rows.filter((_, ri) => ri !== rowIndex) });
  }

  // --- AI assist (shares the same 1-free-action quota as the full AI
  // enhance on the upload flow, so a free-plan user can't get unlimited AI
  // rewrites just by using the manual builder instead). ---
  async function improve(
    fieldKey: string,
    kind: "summary" | "bullet",
    text: string,
    context: string | undefined,
    apply: (improved: string) => StructuredResume
  ) {
    if (!text.trim()) return;
    if (plan !== "pro" && aiUsed >= 1) {
      setShowAiLimit(true);
      return;
    }
    setImprovingField(fieldKey);
    setImproveError(null);
    try {
      const res = await fetch("/api/resume/improve-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, kind, context }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "AI rewrite failed");
      // apply() both updates local state and returns the resulting object —
      // using that return value (rather than reading `structured` again
      // here) avoids persisting a stale pre-update snapshot, since
      // setStructured hasn't committed yet at this point in the same tick.
      const next = apply(data.text);
      const nextCount = aiUsed + 1;
      setAiUsed(nextCount);
      setDirty(true);
      if (resumeId) {
        await persistAiCount(nextCount, next);
      }
    } catch (err) {
      console.error("[resume-builder] AI improve failed:", err);
      setImproveError(err instanceof Error ? err.message : t("aiError"));
    } finally {
      setImprovingField(null);
    }
  }

  async function persistAiCount(nextCount: number, structuredToSave: StructuredResume) {
    if (!resumeId) return;
    try {
      const supabase = createClient();
      const { data: row } = await supabase.from("resumes").select("content").eq("id", resumeId).single();
      const content = (row?.content ?? {}) as ResumeContent;
      await supabase
        .from("resumes")
        .update({
          content: { ...content, structured: structuredToSave, aiEnhanceCount: nextCount },
          updated_at: new Date().toISOString(),
        })
        .eq("id", resumeId);
    } catch (err) {
      console.error("[resume-builder] failed to persist AI usage:", err);
    }
  }

  // --- Upload-to-autofill: lets a user drop in an existing CV file right
  // here in the manual builder (rather than only via the separate
  // /dashboard/resume upload screen) and have the core fields filled in
  // automatically, instead of starting from a blank form. Reuses the same
  // parse -> AI-structure pipeline as that other screen, and shares its
  // 1-free-AI-action quota (aiUsed) so this can't be used to bypass the
  // free-plan limit. Only overwrites the fields the AI pipeline actually
  // returns (name/title/summary/skills/experience/education) — contact
  // details, format, custom sections, certifications, and languages the
  // user already filled in are always left untouched, matching this app's
  // non-destructive editing philosophy elsewhere (format switching, etc).
  async function handleUploadFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;

    if (!userId) {
      router.push("/login");
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadState("error");
      setUploadErrorMsg(t("uploadTooBig"));
      return;
    }

    if (plan !== "pro" && aiUsed >= 1) {
      setShowAiLimit(true);
      return;
    }

    const hasExistingContent = Boolean(
      structured.fullName.trim() ||
        structured.summary.trim() ||
        structured.experience.length > 0 ||
        structured.education.length > 0
    );
    if (hasExistingContent && !window.confirm(t("uploadConfirmReplace"))) {
      return;
    }

    setUploadedFileName(file.name);
    setUploadErrorMsg(null);
    setUploadState("parsing");

    try {
      const formData = new FormData();
      formData.append("file", file);
      const parseRes = await fetch("/api/resume/parse", { method: "POST", body: formData });
      const parseData = await parseRes.json();
      if (!parseRes.ok) throw new Error(parseData.error ?? t("uploadError"));

      setUploadState("enhancing");
      const enhanceRes = await fetch("/api/resume/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: parseData.text }),
      });
      const enhanceData = await enhanceRes.json();
      if (!enhanceRes.ok) throw new Error(enhanceData.error ?? t("uploadError"));

      const result = enhanceData.structured as StructuredResume;
      // Built as one merged object (not sequential update() calls) since
      // update() reads `structured` from the render closure — several calls
      // in a row would each start from the same stale snapshot and only the
      // last one would stick.
      const merged: StructuredResume = {
        ...structured,
        fullName: result.fullName || structured.fullName,
        title: result.title || structured.title,
        summary: result.summary || structured.summary,
        skills: result.skills.length > 0 ? result.skills : structured.skills,
        experience: result.experience.length > 0 ? result.experience : structured.experience,
        education: result.education.length > 0 ? result.education : structured.education,
        // Previously left out entirely (the enhance API didn't extract
        // these yet either — see that route's changelog), which is exactly
        // why a resume that clearly said "PMP certified" still showed an
        // empty certifications box after upload. Same non-destructive rule
        // as every other field here: only fill in from the upload when the
        // user hasn't already entered their own.
        certifications:
          (result.certifications?.length ?? 0) > 0 ? result.certifications : structured.certifications,
        languages: (result.languages?.length ?? 0) > 0 ? result.languages : structured.languages,
        // Same story again for the Contact Details fields: the enhance API
        // now extracts email/phone/location/links from the resume's header
        // block (previously it didn't ask for them at all, so an uploaded
        // CV with a real email/phone at the top still left these boxes
        // blank). Non-destructive like everything else above.
        email: result.email || structured.email,
        phone: result.phone || structured.phone,
        location: result.location || structured.location,
        links: result.links || structured.links,
      };
      setStructured(merged);
      setDirty(true);

      const nextCount = aiUsed + 1;
      setAiUsed(nextCount);
      if (resumeId) {
        await persistAiCount(nextCount, merged);
      }

      setUploadState("success");
    } catch (err) {
      console.error("[resume-builder] upload/parse/enhance failed:", err);
      setUploadState("error");
      setUploadErrorMsg(err instanceof Error ? err.message : t("uploadError"));
    }
  }

  async function handleSave() {
    if (!userId) {
      router.push("/login");
      return;
    }
    setSaveState("saving");
    try {
      const supabase = createClient();
      const content: ResumeContent = { structured, aiEnhanceCount: aiUsed };
      const title = versionTitle.trim() || t("untitledResume");

      if (resumeId) {
        const { error } = await supabase
          .from("resumes")
          .update({ title, content, is_primary: isPrimary, updated_at: new Date().toISOString() })
          .eq("id", resumeId);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await supabase
          .from("resumes")
          .insert({ user_id: userId, title, content, is_primary: isPrimary })
          .select("id")
          .single();
        if (error) throw error;
        setResumeId(inserted?.id ?? null);
        router.replace(`/dashboard/resume/builder?id=${inserted?.id}`);
      }
      setVersionTitle(title);
      setSaveState("success");
      setDirty(false);
    } catch (err) {
      console.error("[resume-builder] save failed:", err);
      setSaveState("error");
    }
  }

  async function handleDownload() {
    if (plan !== "pro") {
      setShowPaywall(true);
      return;
    }
    await downloadResumePdf(
      structured,
      `${(versionTitle || structured.fullName || "resume").replace(/\s+/g, "-")}.pdf`,
      avatarUrl
    );
  }

  async function handleDuplicate() {
    if (!userId || !resumeId) return;
    try {
      const supabase = createClient();
      const content: ResumeContent = { structured, aiEnhanceCount: aiUsed };
      const { data: inserted, error } = await supabase
        .from("resumes")
        .insert({ user_id: userId, title: t("copyOf", { title: versionTitle || t("untitledResume") }), content, is_primary: false })
        .select("id")
        .single();
      if (error) throw error;
      router.push(`/dashboard/resume/builder?id=${inserted?.id}`);
    } catch (err) {
      console.error("[resume-builder] duplicate failed:", err);
    }
  }

  async function handleDelete() {
    if (!userId || !resumeId) return;
    if (!window.confirm(t("confirmDelete"))) return;
    try {
      const supabase = createClient();
      const { error } = await supabase.from("resumes").delete().eq("id", resumeId);
      if (error) throw error;
      router.push("/dashboard/resume");
    } catch (err) {
      console.error("[resume-builder] delete failed:", err);
    }
  }

  if (loading) {
    return <p className="text-sm text-foreground/50">{t("loading")}</p>;
  }

  if (loadError) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <AlertCircle className="mt-0.5 flex-none" size={16} />
        <span>{loadError}</span>
      </div>
    );
  }

  const previewLabels = {
    summary: t("summarySection"),
    skills: t("skillsSection"),
    experience: t("experienceSection"),
    education: t("educationSection"),
    certifications: t("certificationsSection"),
    languages: t("languagesSection"),
  };

  const editPane = (
    <div className="space-y-8">
      <section className="rounded-2xl border border-border bg-surface p-5">
        <h3 className="text-xs font-bold uppercase tracking-wide text-gold-600">{t("uploadSection")}</h3>
        <p className="mt-1 text-xs text-foreground/50">{t("uploadSectionHelp")}</p>
        <label
          className={`mt-3 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
            uploadState === "error"
              ? "border-red-300 bg-red-50"
              : "border-border bg-background hover:border-emerald-400"
          }`}
        >
          {uploadState === "parsing" || uploadState === "enhancing" ? (
            <>
              <Loader2 className="animate-spin text-emerald-600" size={22} />
              <span className="text-sm font-medium text-foreground">
                {uploadState === "parsing" ? t("uploadParsing") : t("uploadEnhancing")}
              </span>
            </>
          ) : uploadState === "error" ? (
            <>
              <AlertCircle className="text-red-500" size={22} />
              <span className="text-sm font-medium text-red-600">{uploadErrorMsg}</span>
            </>
          ) : uploadState === "success" ? (
            <>
              <FileCheck2 className="text-emerald-600" size={22} />
              <span className="text-sm font-medium text-foreground">
                {t("uploadSuccess", { filename: uploadedFileName ?? "" })}
              </span>
            </>
          ) : (
            <>
              <Upload className="text-emerald-600" size={22} />
              <span className="text-sm font-medium text-foreground">{t("uploadCta")}</span>
            </>
          )}
          <input
            type="file"
            // See the matching input in dashboard/resume/page.tsx for why
            // MIME types are listed alongside extensions here.
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            disabled={uploadState === "parsing" || uploadState === "enhancing"}
            onChange={handleUploadFile}
          />
        </label>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <label className="text-xs font-bold uppercase tracking-wide text-gold-600">{t("versionName")}</label>
        <input
          value={versionTitle}
          onChange={(e) => {
            setVersionTitle(e.target.value);
            setDirty(true);
          }}
          placeholder={t("untitledResume")}
          className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h3 className="text-xs font-bold uppercase tracking-wide text-gold-600">{t("resumeFormatSection")}</h3>
        <p className="mt-1 text-xs text-foreground/50">{t("resumeFormatHelp")}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {RESUME_FORMATS.map((format) => {
            const active = (structured.format ?? "reverse-chronological") === format;
            return (
              <button
                key={format}
                type="button"
                onClick={() => update("format", format)}
                className={`rounded-xl border p-3 text-start transition-colors ${
                  active
                    ? "border-emerald-500 bg-emerald-50"
                    : "border-border bg-background hover:border-emerald-300"
                }`}
              >
                <p className={`text-sm font-semibold ${active ? "text-emerald-700" : "text-foreground"}`}>
                  {t(`formats.${format}.label`)}
                </p>
                <p className="mt-0.5 text-xs text-foreground/50">{t(`formats.${format}.description`)}</p>
              </button>
            );
          })}
        </div>
      </section>

      {/* The personal photo itself is edited on /dashboard/resume (it's
          account-level, shared across every resume version — see
          avatarUrl above) — this is just a visible pointer to it so someone
          editing a resume here isn't left wondering why there's no photo
          field in a "photo" section. */}
      <section className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-5">
        <div className="flex h-14 w-14 flex-none items-center justify-center overflow-hidden rounded-full border border-border bg-sand-100">
          {avatarUrl ? (
            // Remote, user-uploaded photo — not a good fit for next/image's fixed domain allowlist.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <User className="text-foreground/30" size={20} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-gold-600">{t("photoSection")}</p>
          <p className="mt-1 text-xs text-foreground/50">{t("photoSectionHelp")}</p>
        </div>
        <Link
          href="/dashboard/resume"
          className="flex-none rounded-full border border-border bg-background px-3.5 py-1.5 text-xs font-semibold text-foreground/80 hover:border-emerald-300"
        >
          {avatarUrl ? t("photoChange") : t("photoUpload")}
        </Link>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h3 className="text-xs font-bold uppercase tracking-wide text-gold-600">{t("contactSection")}</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input
            value={structured.fullName}
            onChange={(e) => update("fullName", e.target.value)}
            placeholder={t("fullName")}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
          <input
            value={structured.title}
            onChange={(e) => update("title", e.target.value)}
            placeholder={t("jobTitle")}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
          <input
            value={structured.email ?? ""}
            onChange={(e) => update("email", e.target.value)}
            placeholder={t("email")}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
          <input
            value={structured.phone ?? ""}
            onChange={(e) => update("phone", e.target.value)}
            placeholder={t("phone")}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
          <input
            value={structured.location ?? ""}
            onChange={(e) => update("location", e.target.value)}
            placeholder={t("location")}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
          <input
            value={structured.links ?? ""}
            onChange={(e) => update("links", e.target.value)}
            placeholder={t("links")}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
          <input
            value={structured.currentCompany ?? ""}
            onChange={(e) => update("currentCompany", e.target.value)}
            placeholder={t("currentCompany")}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wide text-gold-600">{t("summarySection")}</h3>
          <button
            type="button"
            onClick={() =>
              improve("summary", "summary", structured.summary, structured.title, (improved) => update("summary", improved))
            }
            disabled={!structured.summary.trim() || improvingField === "summary"}
            className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
          >
            {improvingField === "summary" ? <Loader2 className="animate-spin" size={12} /> : <Sparkles size={12} />}
            {t("improveWithAi")}
          </button>
        </div>
        <textarea
          value={structured.summary}
          onChange={(e) => update("summary", e.target.value)}
          rows={4}
          placeholder={t("summaryPlaceholder")}
          className="mt-3 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h3 className="text-xs font-bold uppercase tracking-wide text-gold-600">{t("skillsSection")}</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {structured.skills.map((skill) => (
            <span
              key={skill}
              className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
            >
              {skill}
              <button type="button" onClick={() => removeSkill(skill)} aria-label={t("removeSkill")}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={skillInput}
            onChange={(e) => setSkillInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addSkill();
              }
            }}
            placeholder={t("addSkillPlaceholder")}
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
          <button
            type="button"
            onClick={addSkill}
            className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-sand-100"
          >
            {t("add")}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wide text-gold-600">{t("experienceSection")}</h3>
          <button
            type="button"
            onClick={addExperience}
            className="flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-semibold text-foreground hover:bg-sand-100"
          >
            <Plus size={12} />
            {t("addExperience")}
          </button>
        </div>
        <div className="mt-4 space-y-5">
          {structured.experience.map((job, i) => (
            <div key={i} className="rounded-xl border border-border p-4">
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  value={job.role}
                  onChange={(e) => updateExperience(i, { role: e.target.value })}
                  placeholder={t("role")}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
                <input
                  value={job.company}
                  onChange={(e) => updateExperience(i, { company: e.target.value })}
                  placeholder={t("company")}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
                <input
                  value={job.location}
                  onChange={(e) => updateExperience(i, { location: e.target.value })}
                  placeholder={t("location")}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
                <input
                  value={job.period}
                  onChange={(e) => updateExperience(i, { period: e.target.value })}
                  placeholder={t("periodPlaceholder")}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div className="mt-3 space-y-2">
                {job.bullets.map((bullet, bi) => {
                  const fieldKey = `exp-${i}-bullet-${bi}`;
                  return (
                    <div key={bi} className="flex items-start gap-2">
                      <textarea
                        value={bullet}
                        onChange={(e) => updateBullet(i, bi, e.target.value)}
                        rows={1}
                        placeholder={t("bulletPlaceholder")}
                        className="flex-1 resize-y rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          improve(fieldKey, "bullet", bullet, job.role, (improved) => updateBullet(i, bi, improved))
                        }
                        disabled={!bullet.trim() || improvingField === fieldKey}
                        title={t("improveWithAi")}
                        className="flex flex-none items-center justify-center rounded-lg bg-emerald-50 p-1.5 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                      >
                        {improvingField === fieldKey ? (
                          <Loader2 className="animate-spin" size={14} />
                        ) : (
                          <Sparkles size={14} />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeBullet(i, bi)}
                        aria-label={t("removeBullet")}
                        className="flex flex-none items-center justify-center rounded-lg p-1.5 text-foreground/40 hover:text-red-500"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={() => addBullet(i)}
                  className="flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                >
                  <Plus size={12} />
                  {t("addBullet")}
                </button>
              </div>

              <button
                type="button"
                onClick={() => removeExperience(i)}
                className="mt-3 flex items-center gap-1 text-xs font-semibold text-red-500 hover:text-red-600"
              >
                <Trash2 size={12} />
                {t("removeExperience")}
              </button>
            </div>
          ))}
          {structured.experience.length === 0 && (
            <p className="text-sm text-foreground/50">{t("noExperienceYet")}</p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wide text-gold-600">{t("educationSection")}</h3>
          <button
            type="button"
            onClick={addEducation}
            className="flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-semibold text-foreground hover:bg-sand-100"
          >
            <Plus size={12} />
            {t("addEducation")}
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {structured.education.map((ed, i) => (
            <div key={i} className="grid gap-2 rounded-xl border border-border p-4 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <input
                value={ed.degree}
                onChange={(e) => updateEducation(i, { degree: e.target.value })}
                placeholder={t("degree")}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
              <input
                value={ed.school}
                onChange={(e) => updateEducation(i, { school: e.target.value })}
                placeholder={t("school")}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
              <input
                value={ed.period}
                onChange={(e) => updateEducation(i, { period: e.target.value })}
                placeholder={t("periodPlaceholder")}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
              <button
                type="button"
                onClick={() => removeEducation(i)}
                aria-label={t("removeEducation")}
                className="flex items-center justify-center rounded-lg p-2 text-foreground/40 hover:text-red-500"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {structured.education.length === 0 && <p className="text-sm text-foreground/50">{t("noEducationYet")}</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wide text-gold-600">{t("certificationsSection")}</h3>
          <button
            type="button"
            onClick={addCertification}
            className="flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-semibold text-foreground hover:bg-sand-100"
          >
            <Plus size={12} />
            {t("addCertification")}
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {certifications.map((c, i) => (
            <div key={i} className="grid gap-2 rounded-xl border border-border p-4 sm:grid-cols-[1fr_1fr_100px_auto]">
              <input
                value={c.name}
                onChange={(e) => updateCertification(i, { name: e.target.value })}
                placeholder={t("certName")}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
              <input
                value={c.issuer}
                onChange={(e) => updateCertification(i, { issuer: e.target.value })}
                placeholder={t("issuer")}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
              <input
                value={c.year}
                onChange={(e) => updateCertification(i, { year: e.target.value })}
                placeholder={t("year")}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
              <button
                type="button"
                onClick={() => removeCertification(i)}
                aria-label={t("removeCertification")}
                className="flex items-center justify-center rounded-lg p-2 text-foreground/40 hover:text-red-500"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wide text-gold-600">{t("languagesSection")}</h3>
          <button
            type="button"
            onClick={addLanguage}
            className="flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-semibold text-foreground hover:bg-sand-100"
          >
            <Plus size={12} />
            {t("addLanguage")}
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {languages.map((l, i) => {
            // A saved language whose name isn't one of the presets (typed
            // before this became a dropdown, or picked as "Other") stays
            // editable as free text rather than silently disappearing.
            const nameIsCustom = Boolean(l.name) && !LANGUAGE_NAME_PRESETS.includes(l.name);
            return (
              <div key={i} className="grid gap-2 rounded-xl border border-border p-4 sm:grid-cols-[1fr_1fr_auto]">
                <div className="space-y-2">
                  <select
                    value={nameIsCustom ? "__other__" : l.name}
                    onChange={(e) =>
                      updateLanguage(i, { name: e.target.value === "__other__" ? "" : e.target.value })
                    }
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  >
                    <option value="" disabled>
                      {t("languageName")}
                    </option>
                    {LANGUAGE_NAME_PRESETS.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                    <option value="__other__">{t("languageOther")}</option>
                  </select>
                  {nameIsCustom && (
                    <input
                      value={l.name}
                      onChange={(e) => updateLanguage(i, { name: e.target.value })}
                      placeholder={t("languageOtherPlaceholder")}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  )}
                </div>
                <select
                  value={l.level}
                  onChange={(e) => updateLanguage(i, { level: e.target.value })}
                  className="h-fit rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                >
                  <option value="" disabled>
                    {t("level")}
                  </option>
                  {LANGUAGE_LEVEL_PRESETS.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => removeLanguage(i)}
                  aria-label={t("removeLanguage")}
                  className="flex h-fit items-center justify-center rounded-lg p-2 text-foreground/40 hover:text-red-500"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-gold-600">{t("customSectionsSection")}</h3>
            <p className="mt-1 text-xs text-foreground/50">{t("customSectionsHelp")}</p>
          </div>
          <div className="flex flex-none gap-2">
            <button
              type="button"
              onClick={() => addCustomSection("table")}
              className="flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-semibold text-foreground hover:bg-sand-100"
            >
              <Table2 size={12} />
              {t("addTable")}
            </button>
            <button
              type="button"
              onClick={() => addCustomSection("list")}
              className="flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-semibold text-foreground hover:bg-sand-100"
            >
              <List size={12} />
              {t("addList")}
            </button>
          </div>
        </div>

        <div className="mt-4 space-y-5">
          {customSections.map((cs) => (
            <div key={cs.id} className="rounded-xl border border-border p-4">
              <div className="flex items-start gap-2">
                <input
                  value={cs.title}
                  onChange={(e) => updateCustomSection(cs.id, { title: e.target.value })}
                  placeholder={t("customSectionTitlePlaceholder")}
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
                <button
                  type="button"
                  onClick={() => removeCustomSection(cs.id)}
                  aria-label={t("removeSection")}
                  className="flex flex-none items-center justify-center rounded-lg p-2 text-foreground/40 hover:text-red-500"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {cs.type === "table" ? (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[420px] text-sm">
                    <thead>
                      <tr>
                        {cs.columns.map((col, ci) => (
                          <th key={ci} className="p-1">
                            <div className="flex items-center gap-1">
                              <input
                                value={col}
                                onChange={(e) => updateCustomColumnHeader(cs.id, ci, e.target.value)}
                                placeholder={t("column")}
                                className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-bold focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                              />
                              {cs.columns.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeCustomColumn(cs.id, ci)}
                                  aria-label={t("removeColumn")}
                                  className="flex-none text-foreground/30 hover:text-red-500"
                                >
                                  <X size={12} />
                                </button>
                              )}
                            </div>
                          </th>
                        ))}
                        <th className="w-8 p-1">
                          <button
                            type="button"
                            onClick={() => addCustomColumn(cs.id)}
                            title={t("addColumn")}
                            className="flex items-center justify-center rounded-lg p-1.5 text-foreground/40 hover:bg-sand-100 hover:text-emerald-700"
                          >
                            <Columns size={14} />
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {cs.rows.map((row, ri) => (
                        <tr key={ri}>
                          {row.map((cell, ci) => (
                            <td key={ci} className="p-1">
                              <input
                                value={cell}
                                onChange={(e) => updateCustomCell(cs.id, ri, ci, e.target.value)}
                                className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                              />
                            </td>
                          ))}
                          <td className="w-8 p-1">
                            <button
                              type="button"
                              onClick={() => removeCustomRow(cs.id, ri)}
                              aria-label={t("removeRow")}
                              className="flex items-center justify-center rounded-lg p-1.5 text-foreground/40 hover:text-red-500"
                            >
                              <X size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button
                    type="button"
                    onClick={() => addCustomRow(cs.id)}
                    className="mt-2 flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                  >
                    <Plus size={12} />
                    {t("addRow")}
                  </button>
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  {cs.rows.map((row, ri) => (
                    <div key={ri} className="flex items-center gap-2">
                      <input
                        value={row[0] ?? ""}
                        onChange={(e) => updateCustomCell(cs.id, ri, 0, e.target.value)}
                        placeholder={t("listItemPlaceholder")}
                        className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      />
                      <button
                        type="button"
                        onClick={() => removeCustomRow(cs.id, ri)}
                        aria-label={t("removeRow")}
                        className="flex flex-none items-center justify-center rounded-lg p-1.5 text-foreground/40 hover:text-red-500"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addCustomRow(cs.id)}
                    className="flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                  >
                    <Plus size={12} />
                    {t("addListItem")}
                  </button>
                </div>
              )}
            </div>
          ))}
          {customSections.length === 0 && (
            <p className="text-sm text-foreground/50">{t("noCustomSectionsYet")}</p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h3 className="text-xs font-bold uppercase tracking-wide text-gold-600">{t("themeSection")}</h3>
        <p className="mt-1 text-xs text-foreground/50">{t("themeSectionNote")}</p>

        <p className="mt-4 text-xs font-semibold text-foreground/70">{t("accentColor")}</p>
        <div className="mt-2 flex gap-3">
          {ACCENTS.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => updateStyle({ accentColor: a.key })}
              aria-label={a.key}
              className={`h-8 w-8 rounded-full ${a.swatch} ${
                resumeStyle.accentColor === a.key ? "ring-2 ring-offset-2 ring-foreground/40" : ""
              }`}
            />
          ))}
        </div>

        <p className="mt-4 text-xs font-semibold text-foreground/70">{t("fontFamily")}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {FONT_FAMILIES.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => updateStyle({ fontFamily: f.key })}
              className={`rounded-full border px-3.5 py-1.5 text-sm ${f.previewClass} ${
                resumeStyle.fontFamily === f.key
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-border text-foreground/70 hover:bg-sand-100"
              }`}
            >
              {t(f.labelKey)}
            </button>
          ))}
        </div>

        <p className="mt-4 text-xs font-semibold text-foreground/70">{t("fontSize")}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {FONT_SIZES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => updateStyle({ fontSize: s.key })}
              className={`rounded-full border px-3.5 py-1.5 text-sm ${
                resumeStyle.fontSize === s.key
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-border text-foreground/70 hover:bg-sand-100"
              }`}
            >
              {t(s.labelKey)}
            </button>
          ))}
        </div>
      </section>
    </div>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/dashboard/resume"
          className="flex items-center gap-1.5 text-sm font-semibold text-foreground/60 hover:text-foreground"
        >
          <ArrowLeft size={15} />
          {t("backToResumes")}
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          {resumeId && !isPrimary && (
            <button
              type="button"
              onClick={() => setIsPrimary(true)}
              className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-sand-100"
            >
              <Star size={12} />
              {t("setPrimary")}
            </button>
          )}
          {isPrimary && (
            <span className="flex items-center gap-1 rounded-full bg-gold-100 px-3 py-1.5 text-xs font-semibold text-gold-700">
              <Star size={12} fill="currentColor" />
              {t("primary")}
            </span>
          )}
          {resumeId && (
            <button
              type="button"
              onClick={handleDuplicate}
              className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-sand-100"
            >
              <Copy size={12} />
              {t("duplicate")}
            </button>
          )}
          {resumeId && (
            <button
              type="button"
              onClick={handleDelete}
              className="flex items-center gap-1.5 rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-50"
            >
              <Trash2 size={12} />
              {t("delete")}
            </button>
          )}
        </div>
      </div>

      <h1 className="mt-4 text-2xl font-bold text-foreground">{t("title")}</h1>
      <p className="mt-1 text-sm text-foreground/60">{t("subtitle")}</p>

      {improveError && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertCircle className="mt-0.5 flex-none" size={16} />
          <span>{improveError}</span>
        </div>
      )}

      {showAiLimit && (
        <div className="mt-4 flex flex-col items-start gap-3 rounded-xl border border-gold-400/40 bg-gold-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <Lock className="mt-0.5 text-gold-600" size={16} />
            <p className="text-sm text-foreground/80">{t("aiLimitReached")}</p>
          </div>
          <Link
            href="/pricing"
            className="flex-none rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            {t("upgradeCta")}
          </Link>
        </div>
      )}

      {/* Phone-width screens: tabbed edit/preview since side-by-side doesn't
          fit there; from tablet width up, show both at once, split evenly
          (resume viewer half the width, form fields the other half), with
          the preview sticky alongside the form. Previously this split only
          kicked in at the `lg` breakpoint (1024px), so anything narrower —
          including many laptop windows and tablets — fell back to the
          single-column tabbed view with no visible half/half split at all. */}
      <div className="mt-6 flex gap-2 md:hidden">
        <button
          type="button"
          onClick={() => setMobileTab("edit")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-sm font-semibold ${
            mobileTab === "edit" ? "bg-emerald-600 text-white" : "border border-border text-foreground/60"
          }`}
        >
          <PenSquare size={14} />
          {t("editTab")}
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("preview")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-sm font-semibold ${
            mobileTab === "preview" ? "bg-emerald-600 text-white" : "border border-border text-foreground/60"
          }`}
        >
          <Eye size={14} />
          {t("previewTab")}
        </button>
      </div>

      <div className="mt-6 grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className={`min-w-0 ${mobileTab === "edit" ? "block" : "hidden md:block"}`}>{editPane}</div>
        <div className={`min-w-0 ${mobileTab === "preview" ? "block" : "hidden md:block"}`}>
          <div className="md:sticky md:top-6">
            <ResumePreview resume={structured} photoUrl={avatarUrl} labels={previewLabels} />
          </div>
        </div>
      </div>

      <div className="sticky bottom-4 mt-8 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface/95 p-4 backdrop-blur">
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
          className="flex items-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-sand-100"
        >
          {plan === "pro" ? <Download size={15} /> : <Lock size={14} className="text-gold-500" />}
          {t("download")}
        </button>
        {saveState === "success" && !dirty && (
          <span className="text-sm font-medium text-emerald-600">{t("saved")}</span>
        )}
        {saveState === "error" && <span className="text-sm font-medium text-red-600">{t("saveError")}</span>}
        {dirty && saveState !== "saving" && (
          <span className="text-xs font-medium text-gold-600">{t("unsavedChanges")}</span>
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
  );
}
