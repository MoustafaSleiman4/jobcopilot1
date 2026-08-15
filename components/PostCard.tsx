"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Heart, MessageCircle, MoreHorizontal, Pencil, Trash2, Flag, Loader2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/client";
import { useAuthUser } from "@/lib/useAuthUser";
import { linkifyText, formatRelativeTime } from "@/lib/socialFormat";
import { postMediaPublicUrl } from "@/lib/postMedia";
import type { PostItem } from "@/lib/social-types";
import CommentThread from "@/components/CommentThread";

export default function PostCard({
  post,
  onDeleted,
  onUpdated,
  highlighted = false,
  defaultCommentsOpen = false,
}: {
  post: PostItem;
  onDeleted?: (postId: string) => void;
  onUpdated?: (post: PostItem) => void;
  // Set when this card is the target of a notification deep-link
  // (?postId=... on /dashboard/posts) — a brief ring so it's obvious which
  // post the click was about, since it can land anywhere in a long feed.
  highlighted?: boolean;
  // Same deep-link case: a reaction/comment notification should land with
  // the comment thread already expanded, not require a second click.
  defaultCommentsOpen?: boolean;
}) {
  const t = useTranslations("posts");
  const locale = useLocale();
  const { user } = useAuthUser();
  const isAuthor = Boolean(user && user.id === post.author.id);

  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(post.body);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reportState, setReportState] = useState<"idle" | "submitting" | "done">("idle");

  const [liked, setLiked] = useState(post.viewerHasReacted);
  const [reactionCount, setReactionCount] = useState(post.reactionCount);
  const [likeBusy, setLikeBusy] = useState(false);

  const [commentsOpen, setCommentsOpen] = useState(defaultCommentsOpen);
  const [commentCount, setCommentCount] = useState(post.commentCount);

  const supabase = useMemo(() => createClient(), []);
  const mediaUrls = useMemo(
    () => post.media.map((m) => ({ ...m, url: postMediaPublicUrl(supabase.storage, m.storagePath) })),
    [post.media, supabase]
  );

  async function toggleLike() {
    if (likeBusy) return;
    const nextLiked = !liked;
    setLiked(nextLiked);
    setReactionCount((c) => c + (nextLiked ? 1 : -1));
    setLikeBusy(true);
    try {
      const res = await fetch(`/api/posts/${post.id}/react`, { method: nextLiked ? "POST" : "DELETE" });
      if (!res.ok) throw new Error("react failed");
    } catch {
      // Roll back the optimistic update on failure.
      setLiked(!nextLiked);
      setReactionCount((c) => c + (nextLiked ? -1 : 1));
    } finally {
      setLikeBusy(false);
    }
  }

  async function saveEdit() {
    if (saving || editBody.trim().length === 0) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: editBody.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("postError"));
      const updated: PostItem = { ...post, body: editBody.trim(), editedAt: new Date().toISOString(), ...(data.post ?? {}) };
      onUpdated?.(updated);
      setEditing(false);
    } catch (err) {
      console.error("[posts] failed to edit post:", err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (deleting) return;
    if (!window.confirm(t("deleteConfirm"))) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/posts/${post.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      onDeleted?.(post.id);
    } catch (err) {
      console.error("[posts] failed to delete post:", err);
      setDeleting(false);
    }
  }

  async function handleReport() {
    if (reportState !== "idle") return;
    setReportState("submitting");
    try {
      const res = await fetch(`/api/posts/${post.id}/report`, { method: "POST" });
      if (!res.ok) throw new Error("report failed");
      setReportState("done");
    } catch (err) {
      console.error("[posts] failed to report post:", err);
      setReportState("idle");
    }
  }

  const headline = [post.author.jobTitle, post.author.currentCompany].filter(Boolean).join(" @ ");

  return (
    <Card
      id={`post-${post.id}`}
      className={highlighted ? "ring-2 ring-emerald-400 ring-offset-2 ring-offset-sand-100" : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {post.author.avatarUrl ? (
            <img src={post.author.avatarUrl} alt="" className="h-11 w-11 flex-none rounded-full object-cover" />
          ) : (
            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
              {(post.author.fullName || "?").charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 text-start">
            <p className="truncate text-sm font-semibold text-foreground">{post.author.fullName}</p>
            {headline && <p className="truncate text-xs text-foreground/50">{headline}</p>}
            <p className="text-xs text-foreground/40">
              {formatRelativeTime(post.createdAt, locale)}
              {post.editedAt && ` · ${t("edited")}`}
            </p>
          </div>
        </div>

        <div className="relative flex-none">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-foreground/50 hover:bg-sand-100"
            aria-label={t("moreActions")}
          >
            <MoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute end-0 z-20 mt-2 w-44 overflow-hidden rounded-xl border border-border bg-surface p-1.5 shadow-lg">
                {isAuthor && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(true);
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm font-medium text-foreground/80 hover:bg-sand-100"
                  >
                    <Pencil size={14} />
                    {t("edit")}
                  </button>
                )}
                {isAuthor && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      handleDelete();
                    }}
                    disabled={deleting}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    {t("delete")}
                  </button>
                )}
                {!isAuthor && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      handleReport();
                    }}
                    disabled={reportState !== "idle"}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm font-medium text-foreground/80 hover:bg-sand-100"
                  >
                    <Flag size={14} />
                    {reportState === "done" ? t("reported") : t("report")}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <div className="mt-3">
          <textarea
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            rows={3}
            className="w-full resize-y rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-start focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(false)} disabled={saving}>
              {t("cancel")}
            </Button>
            <Button variant="primary" onClick={saveEdit} loading={saving}>
              {t("save")}
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-3 whitespace-pre-wrap text-start text-sm text-foreground/90">{linkifyText(post.body)}</p>
      )}

      {mediaUrls.length > 0 && (
        <div className={`mt-3 overflow-hidden rounded-xl ${mediaUrls.length > 1 ? "grid grid-cols-2 gap-1" : ""}`}>
          {mediaUrls.map((m) =>
            m.mediaType === "video" ? (
              <video key={m.storagePath} src={m.url} controls className="max-h-[28rem] w-full bg-black" />
            ) : (
              <img
                key={m.storagePath}
                src={m.url}
                alt=""
                className={`w-full object-cover ${mediaUrls.length === 1 ? "max-h-[28rem]" : "aspect-square"}`}
              />
            )
          )}
        </div>
      )}

      <div className="mt-4 flex items-center gap-4 border-t border-border pt-3">
        <button
          type="button"
          onClick={toggleLike}
          className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${
            liked ? "text-emerald-700" : "text-foreground/60 hover:text-foreground"
          }`}
        >
          <Heart size={16} className={liked ? "fill-emerald-600 text-emerald-600" : undefined} />
          {t("like")}
          {reactionCount > 0 && <span className="text-xs text-foreground/40">{reactionCount}</span>}
        </button>
        <button
          type="button"
          onClick={() => setCommentsOpen((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-medium text-foreground/60 hover:text-foreground"
        >
          <MessageCircle size={16} />
          {t("comment")}
          {commentCount > 0 && <span className="text-xs text-foreground/40">{commentCount}</span>}
        </button>
      </div>

      {commentsOpen && (
        <div className="mt-3 border-t border-border pt-3">
          <CommentThread postId={post.id} onCountChange={setCommentCount} />
        </div>
      )}
    </Card>
  );
}
