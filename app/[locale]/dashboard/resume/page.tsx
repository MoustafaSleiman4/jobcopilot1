"use client";

import { useState, useRef, useEffect, ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
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
  FilePlus2,
  Copy,
  Trash2,
  Star,
  PenSquare,
  ImagePlus,
  User,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import ResumePreview from "@/components/ResumePreview";
import type { StructuredResume } from "@/lib/resume-types";
import { emptyStructuredResume } from "@/lib/resume-types";
import { downloadResumePdf } from "@/lib/resume-pdf";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5MB — matches the resume-photos bucket's file_size_limit
const PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"]; // matches the bucket's allowed_mime_types

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

type ResumeVersion = {
  id: string;
  title: string;
  updatedAt: string;
  isPrimary: boolean;
  fullName: string;
  jobTitle: string;
};

export default function ResumeBuilderPage() {
  const t = useTranslations("dashboard.resume");
  const router = useRouter();

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

  // Personal photo — account-level (public.profiles.avatar_url), shared
  // across every resume version rather than saved inside any one resume's
  // content. Set here, before someone has necessarily created a resume at
  // all, since it belongs to the profile, not to a resume.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoErrorMsg, setPhotoErrorMsg] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [versions, setVersions] = useState<ResumeVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionActionError, setVersionActionError] = useState<string | null>(null);

  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "success" | "error">(
    "idle"
  );
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadErrorMsg, setUploadErrorMsg] = useState<string | null>(null);

  const [saveState, setSaveState] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadVersions(supabase: ReturnType<typeof createClient>, uid: string) {
    setVersionsLoading(true);
    try {
      const { data, error } = await supabase
        .from("resumes")
        .select("id, title, updated_at, is_primary, content")
        .eq("user_id", uid)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      setVersions(
        (data ?? []).map((row) => {
          const content = (row.content ?? {}) as ResumeContent;
          return {
            id: row.id,
            title: row.title || t("untitledResume"),
            updatedAt: row.updated_at,
            isPrimary: !!row.is_primary,
            fullName: content.structured?.fullName ?? "",
            jobTitle: content.structured?.title ?? "",
          };
        })
      );
    } catch (err) {
      console.error("[resume] failed to load resume versions:", err);
    } finally {
      setVersionsLoading(false);
    }
  }

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
            .select("plan, avatar_url")
            .eq("id", uid)
            .single();
          if (!cancelled && profile?.plan === "pro") setPlan("pro");
          if (!cancelled) setAvatarUrl(profile?.avatar_url ?? null);

          await loadExistingResume(supabase, uid);
          if (!cancelled) await loadVersions(supabase, uid);
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

  // --- Profile photo ---
  // Uploaded to the "resume-photos" bucket (public-read, owner-scoped write
  // — see supabase/storage-setup.sql) at "<user_id>/photo-<timestamp>.<ext>",
  // same folder-per-user convention as the "resumes" bucket. Saved onto
  // public.profiles.avatar_url — account-level, not per-resume — so it's
  // set once here, before someone necessarily has a resume yet, and then
  // shows up automatically across every resume version's preview/PDF (see
  // ResumeBuilderForm.tsx and the ResumePreview/downloadResumePdf calls
  // below, all of which read this same profile field). The bucket's own
  // file_size_limit/allowed_mime_types are the real enforcement; the checks
  // here just give a fast, friendly error before spending an upload
  // round-trip on a file that would be rejected anyway.
  async function handlePhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file again later
    if (!file) return;
    setPhotoErrorMsg(null);

    if (!userId) return;
    if (!PHOTO_MIME_TYPES.includes(file.type)) {
      setPhotoErrorMsg(t("photoInvalidType"));
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoErrorMsg(t("photoTooBig"));
      return;
    }

    setPhotoUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${userId}/photo-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("resume-photos").upload(path, file, { upsert: false });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("resume-photos").getPublicUrl(path);

      // upsert, not update: an UPDATE against a profiles row that doesn't
      // exist matches 0 rows and succeeds without error — which is exactly
      // what silently discarded photo uploads for any account whose
      // profiles row hadn't been created yet (see the on_auth_user_created
      // trigger in supabase/profile-trigger.sql, now applied). Upserting
      // here means a photo save can never again look successful in the UI
      // while quietly not persisting.
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert({ id: userId, avatar_url: data.publicUrl }, { onConflict: "id" });
      if (profileError) throw profileError;

      setAvatarUrl(data.publicUrl);
    } catch (err) {
      console.error("[resume] photo upload failed:", err);
      setPhotoErrorMsg(t("photoUploadError"));
    } finally {
      setPhotoUploading(false);
    }
  }

  async function removePhoto() {
    setPhotoErrorMsg(null);
    if (!userId) return;
    const previousAvatarUrl = avatarUrl;
    setAvatarUrl(null); // optimistic — this is a plain preference toggle, not data loss
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .upsert({ id: userId, avatar_url: null }, { onConflict: "id" });
      if (error) throw error;
    } catch (err) {
      console.error("[resume] failed to remove photo:", err);
      setAvatarUrl(previousAvatarUrl);
      setPhotoErrorMsg(t("photoUploadError"));
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
      if (userId) {
        const supabase = createClient();
        await loadVersions(supabase, userId);
      }
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
      await loadVersions(supabase, userId);
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
    await downloadResumePdf(structured, "resume.pdf", avatarUrl);
  }

  // --- Version management (My resumes) ---

  async function handleCreateBlank() {
    if (!userId) {
      router.push("/login");
      return;
    }
    setVersionActionError(null);
    try {
      const supabase = createClient();
      const { data: inserted, error } = await supabase
        .from("resumes")
        .insert({
          user_id: userId,
          title: t("untitledResume"),
          content: { structured: emptyStructuredResume() },
          is_primary: versions.length === 0,
        })
        .select("id")
        .single();
      if (error) throw error;
      router.push(`/dashboard/resume/builder?id=${inserted.id}`);
    } catch (err) {
      console.error("[resume] failed to create a new version:", err);
      setVersionActionError(t("versionActionError"));
    }
  }

  async function handleDuplicateVersion(id: string, title: string) {
    if (!userId) return;
    setVersionActionError(null);
    try {
      const supabase = createClient();
      const { data: existing, error: fetchError } = await supabase
        .from("resumes")
        .select("content")
        .eq("id", id)
        .single();
      if (fetchError) throw fetchError;

      const { error: insertError } = await supabase.from("resumes").insert({
        user_id: userId,
        title: t("copyOf", { title }),
        content: existing?.content ?? {},
        is_primary: false,
      });
      if (insertError) throw insertError;
      await loadVersions(supabase, userId);
    } catch (err) {
      console.error("[resume] failed to duplicate version:", err);
      setVersionActionError(t("versionActionError"));
    }
  }

  async function handleDeleteVersion(id: string) {
    if (!userId) return;
    if (!window.confirm(t("confirmDelete"))) return;
    setVersionActionError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("resumes").delete().eq("id", id);
      if (error) throw error;
      await loadVersions(supabase, userId);
      if (id === resumeId) {
        setResumeId(null);
        setStructured(DEMO_STRUCTURED);
        setOriginalText(null);
        setIsDemoContent(true);
        setEnhanceCount(0);
      }
    } catch (err) {
      console.error("[resume] failed to delete version:", err);
      setVersionActionError(t("versionActionError"));
    }
  }

  async function handleSetPrimary(id: string) {
    if (!userId) return;
    setVersionActionError(null);
    try {
      const supabase = createClient();
      await supabase.from("resumes").update({ is_primary: false }).eq("user_id", userId);
      const { error } = await supabase.from("resumes").update({ is_primary: true }).eq("id", id);
      if (error) throw error;
      await loadVersions(supabase, userId);
    } catch (err) {
      console.error("[resume] failed to set primary version:", err);
      setVersionActionError(t("versionActionError"));
    }
  }

  const busy = parsing || enhancing;
  const enhanceBlockedByPlan = !!originalText && enhanceLimitBlocks();

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

      {/* Profile photo — set once here, account-level (public.profiles.
          avatar_url), before someone has necessarily created any resume at
          all. Shown first, above "My resumes", precisely so it's available
          to set before creating a resume, and every version created after
          (or already existing) picks it up automatically since
          ResumeBuilderForm.tsx and the preview/PDF below all read this same
          profile field rather than anything saved per resume. */}
      {userId && (
        <div className="mt-6 flex items-center gap-4 rounded-2xl border border-border bg-surface p-5">
          <div className="flex h-16 w-16 flex-none items-center justify-center overflow-hidden rounded-full border border-border bg-sand-100">
            {avatarUrl ? (
              // Remote, user-uploaded photo — not a good fit for next/image's fixed domain allowlist.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <User className="text-foreground/30" size={24} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">{t("photoSection")}</p>
            <p className="mt-0.5 text-xs text-foreground/50">{t("photoSectionHelp")}</p>
            <p className="mt-0.5 text-[11px] text-foreground/40">{t("photoHint")}</p>
            {photoErrorMsg && <p className="mt-1 text-xs text-red-600">{photoErrorMsg}</p>}
          </div>
          <div className="flex flex-none items-center gap-2">
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              disabled={photoUploading}
              className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-1.5 text-xs font-semibold text-foreground/80 hover:border-emerald-300 disabled:opacity-60"
            >
              {photoUploading ? <Loader2 className="animate-spin" size={13} /> : <ImagePlus size={13} />}
              {photoUploading ? t("photoUploading") : avatarUrl ? t("photoChange") : t("photoUpload")}
            </button>
            {avatarUrl && (
              <button
                type="button"
                onClick={removePhoto}
                className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-1.5 text-xs font-semibold text-red-600 hover:border-red-300"
              >
                <Trash2 size={13} />
                {t("photoRemove")}
              </button>
            )}
          </div>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handlePhotoChange}
            className="hidden"
          />
        </div>
      )}

      {/* My resumes — every saved version, with the powerful manual builder
          (a separate screen) as the entry point for creating or editing
          one from scratch. Kept above the upload flow since returning users
          most often want to jump straight to an existing version. */}
      {userId && (
        <div className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">{t("myResumes")}</h2>
            <button
              onClick={handleCreateBlank}
              className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              <FilePlus2 size={14} />
              {t("newResume")}
            </button>
          </div>

          {versionActionError && (
            <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <AlertCircle className="mt-0.5 flex-none" size={16} />
              <span>{versionActionError}</span>
            </div>
          )}

          {versionsLoading && <p className="text-sm text-foreground/50">{t("loadingVersions")}</p>}

          {!versionsLoading && versions.length === 0 && (
            <p className="rounded-xl border border-dashed border-border p-4 text-sm text-foreground/50">
              {t("noVersionsYet")}
            </p>
          )}

          {!versionsLoading && versions.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {versions.map((v) => (
                <div key={v.id} className="rounded-xl border border-border bg-surface p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{v.title}</p>
                      {(v.fullName || v.jobTitle) && (
                        <p className="truncate text-xs text-foreground/60">
                          {[v.fullName, v.jobTitle].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      <p className="mt-0.5 text-[11px] text-foreground/40">
                        {new Date(v.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                    {v.isPrimary && (
                      <span className="flex flex-none items-center gap-1 rounded-full bg-gold-100 px-2 py-0.5 text-[11px] font-semibold text-gold-700">
                        <Star size={10} fill="currentColor" />
                        {t("primary")}
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-semibold">
                    <Link
                      href={`/dashboard/resume/builder?id=${v.id}`}
                      className="flex items-center gap-1 text-emerald-700 hover:text-emerald-800"
                    >
                      <PenSquare size={12} />
                      {t("open")}
                    </Link>
                    <button
                      onClick={() => handleDuplicateVersion(v.id, v.title)}
                      className="flex items-center gap-1 text-foreground/60 hover:text-foreground"
                    >
                      <Copy size={12} />
                      {t("duplicate")}
                    </button>
                    {!v.isPrimary && (
                      <button
                        onClick={() => handleSetPrimary(v.id)}
                        className="flex items-center gap-1 text-foreground/60 hover:text-foreground"
                      >
                        <Star size={12} />
                        {t("setPrimary")}
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteVersion(v.id)}
                      className="ms-auto flex items-center gap-1 text-red-500 hover:text-red-600"
                    >
                      <Trash2 size={12} />
                      {t("delete")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
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
        <button
          onClick={handleCreateBlank}
          className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-surface p-8 text-center transition-colors hover:border-emerald-400"
        >
          <PenSquare className="text-emerald-600" size={28} />
          <span className="text-sm font-medium text-foreground">{t("orBuild")}</span>
        </button>
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
          <div className="flex items-center gap-2">
            {resumeId && (
              <Link
                href={`/dashboard/resume/builder?id=${resumeId}`}
                className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-sand-100"
              >
                <PenSquare size={12} />
                {t("editManually")}
              </Link>
            )}
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
        </div>
        <p className="mb-3 text-xs text-foreground/50">
          {isDemoContent ? t("noResumeYet") : t("aiImprovedNote")}
        </p>

        <ResumePreview
          resume={structured}
          photoUrl={avatarUrl}
          labels={{
            summary: t("sectionSummary"),
            skills: t("sectionSkills"),
            experience: t("sectionExperience"),
            education: t("sectionEducation"),
            certifications: t("sectionCertifications"),
            languages: t("sectionLanguages"),
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
