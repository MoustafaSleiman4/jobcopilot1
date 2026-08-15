"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Image as ImageIcon, Video, X, Send } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { useAuthUser } from "@/lib/useAuthUser";
import type { PostItem, PostMedia } from "@/lib/social-types";
import {
  IMAGE_MIME_TYPES,
  MAX_IMAGES_PER_POST,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  VIDEO_MIME_TYPES,
  isImageFile,
  isVideoFile,
} from "@/lib/postMedia";

const MAX_BODY_CHARS = 3000;

type Attachment = { file: File; previewUrl: string };

/**
 * Post creation box: text + optional media, one video OR up to 6 images per
 * post (never mixed — attaching one kind clears the other). Orchestrates
 * upload-then-persist the same way the existing photo upload does
 * (app/[locale]/dashboard/resume/page.tsx): each file goes straight to
 * Supabase Storage from the client first, then `POST /api/posts` is called
 * with the resulting storage paths so the API route never needs to touch
 * file bytes.
 */
export default function PostComposer({ onPosted }: { onPosted: (post: PostItem) => void }) {
  const t = useTranslations("posts");
  const { user } = useAuthUser();

  const [body, setBody] = useState("");
  const [images, setImages] = useState<Attachment[]>([]);
  const [video, setVideo] = useState<Attachment | null>(null);
  const [posting, setPosting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const overLimit = body.length > MAX_BODY_CHARS;
  const empty = body.trim().length === 0 && images.length === 0 && !video;

  function clearAttachments() {
    images.forEach((a) => URL.revokeObjectURL(a.previewUrl));
    if (video) URL.revokeObjectURL(video.previewUrl);
    setImages([]);
    setVideo(null);
  }

  function handleImagesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setErrorMsg(null);

    const invalid = files.find((f) => !isImageFile(f) || f.size > MAX_IMAGE_BYTES);
    if (invalid) {
      setErrorMsg(t("imageInvalid"));
      return;
    }

    // Attaching an image clears any selected video — one video OR up to 6
    // images per post, never mixed.
    if (video) {
      URL.revokeObjectURL(video.previewUrl);
      setVideo(null);
    }

    setImages((prev) => {
      const next = [...prev, ...files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))];
      if (next.length > MAX_IMAGES_PER_POST) {
        setErrorMsg(t("tooManyImages"));
        return next.slice(0, MAX_IMAGES_PER_POST);
      }
      return next;
    });
  }

  function handleVideoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErrorMsg(null);

    if (!isVideoFile(file) || file.size > MAX_VIDEO_BYTES) {
      setErrorMsg(t("videoInvalid"));
      return;
    }

    // Attaching a video clears any selected images.
    images.forEach((a) => URL.revokeObjectURL(a.previewUrl));
    setImages([]);
    setVideo({ file, previewUrl: URL.createObjectURL(file) });
  }

  function removeImage(index: number) {
    setImages((prev) => {
      const target = prev[index];
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  function removeVideo() {
    if (video) URL.revokeObjectURL(video.previewUrl);
    setVideo(null);
  }

  async function handlePost() {
    if (!user || empty || overLimit || posting) return;
    setPosting(true);
    setErrorMsg(null);

    try {
      const supabase = createClient();
      const media: PostMedia[] = [];

      if (images.length > 0 || video) {
        const postId = crypto.randomUUID();
        const attachments = video ? [{ ...video, mediaType: "video" as const }] : images.map((a) => ({ ...a, mediaType: "image" as const }));

        for (let i = 0; i < attachments.length; i++) {
          const { file, mediaType } = attachments[i];
          const ext = file.name.split(".").pop()?.toLowerCase() || (mediaType === "video" ? "mp4" : "jpg");
          const path = `${user.id}/${postId}/${i}-${Date.now()}.${ext}`;
          const { error: uploadError } = await supabase.storage.from("post-media").upload(path, file, { upsert: false });
          if (uploadError) throw uploadError;
          media.push({ mediaType, storagePath: path, orderIndex: i });
        }
      }

      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim(), media: media.length > 0 ? media : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("postError"));

      const created: PostItem = data.post ?? data;
      onPosted(created);
      setBody("");
      clearAttachments();
    } catch (err) {
      console.error("[posts] failed to create post:", err);
      setErrorMsg(err instanceof Error ? err.message : t("postError"));
    } finally {
      setPosting(false);
    }
  }

  return (
    <Card>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t("composerPlaceholder")}
        rows={3}
        className="w-full resize-y rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-start focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
      />

      <div className="mt-1.5 flex justify-end">
        <span className={`text-xs ${overLimit ? "text-red-600" : "text-foreground/40"}`}>
          {body.length}/{MAX_BODY_CHARS}
        </span>
      </div>

      {images.length > 0 && (
        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {images.map((att, i) => (
            <div key={att.previewUrl} className="relative aspect-square overflow-hidden rounded-lg border border-border">
              <img src={att.previewUrl} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removeImage(i)}
                className="absolute end-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
                aria-label={t("removeAttachment")}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {video && (
        <div className="relative mt-2 overflow-hidden rounded-lg border border-border">
          <video src={video.previewUrl} className="max-h-64 w-full" controls />
          <button
            type="button"
            onClick={removeVideo}
            className="absolute end-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
            aria-label={t("removeAttachment")}
          >
            <X size={12} />
          </button>
        </div>
      )}

      {errorMsg && <p className="mt-2 text-xs text-red-600">{errorMsg}</p>}

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <input
            ref={imageInputRef}
            type="file"
            accept={IMAGE_MIME_TYPES.join(",")}
            multiple
            className="hidden"
            onChange={handleImagesSelected}
          />
          <input
            ref={videoInputRef}
            type="file"
            accept={VIDEO_MIME_TYPES.join(",")}
            className="hidden"
            onChange={handleVideoSelected}
          />
          <Button
            variant="ghost"
            disabled={posting || Boolean(video) || images.length >= MAX_IMAGES_PER_POST}
            onClick={() => imageInputRef.current?.click()}
          >
            <ImageIcon size={16} />
            {t("addPhoto")}
          </Button>
          <Button variant="ghost" disabled={posting || images.length > 0 || Boolean(video)} onClick={() => videoInputRef.current?.click()}>
            <Video size={16} />
            {t("addVideo")}
          </Button>
        </div>

        <Button variant="primary" disabled={empty || overLimit} loading={posting} onClick={handlePost}>
          {!posting && <Send size={14} />}
          {t("postButton")}
        </Button>
      </div>
    </Card>
  );
}
