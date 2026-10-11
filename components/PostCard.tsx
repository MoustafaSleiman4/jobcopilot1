"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { MessageCircle, MoreHorizontal, Pencil, Trash2, Flag, Loader2, Bookmark, BarChart2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import DegreeBadge from "@/components/ui/DegreeBadge";
import PostReactionButton from "@/components/PostReactionButton";
import ReactionSummary from "@/components/ReactionSummary";
import RepostMenu from "@/components/RepostMenu";
import { createClient } from "@/lib/supabase/client";
import { useAuthUser } from "@/lib/useAuthUser";
import { linkifyText, formatRelativeTime } from "@/lib/socialFormat";
import { postMediaPublicUrl } from "@/lib/postMedia";
import type { PostItem, ReactionType } from "@/lib/social-types";
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
  // The feed is visible to everyone, but commenting is gated to the post's
  // author or a direct connection of theirs (see
  // supabase/posts-open-feed-gated-comments.sql) — passed down so
  // CommentThread can show a "connect to comment" prompt instead of a bare
  // input box that would just fail on submit.
  const canComment = isAuthor || post.author.connectionStatus === "connected";

  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(post.body);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reportState, setReportState] = useState<"idle" | "submitting" | "done">("idle");

  const [reactionType, setReactionType] = useState<ReactionType | null>(post.viewerReactionType);
  const [reactionBreakdown, setReactionBreakdown] = useState(post.reactionBreakdown);
  const [reactionCount, setReactionCount] = useState(post.reactionCount);
  const [reactBusy, setReactBusy] = useState(false);

  const [repostBusy, setRepostBusy] = useState(false);
  const [viewerHasReposted, setViewerHasReposted] = useState(post.viewerHasReposted);
  const [repostCount, setRepostCount] = useState(post.repostCount);

  const [saved, setSaved] = useState(post.viewerHasSaved);
  const [saveBusy, setSaveBusy] = useState(false);

  const [commentsOpen, setCommentsOpen] = useState(defaultCommentsOpen);
  const [commentCount, setCommentCount] = useState(post.commentCount);

  const supabase = useMemo(() => createClient(), []);
  const mediaUrls = useMemo(
    () => post.media.map((m) => ({ ...m, url: postMediaPublicUrl(supabase.storage, m.storagePath) })),
    [post.media, supabase]
  );
  const repostOfMediaUrls = useMemo(
    () => (post.repostOf?.media ?? []).map((m) => ({ ...m, url: postMediaPublicUrl(supabase.storage, m.storagePath) })),
    [post.repostOf, supabase]
  );

  // Impression tracking: fires once per card per page load, the moment it's
  // actually scrolled into view (not merely rendered — a long feed renders
  // many cards below the fold at once) — see POST /api/posts/[id]/impression.
  const cardRef = useRef<HTMLDivElement>(null);
  const reportedRef = useRef(false);
  useEffect(() => {
    if (reportedRef.current || !cardRef.current) return;
    const el = cardRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !reportedRef.current) {
          reportedRef.current = true;
          fetch(`/api/posts/${post.id}/impression`, { method: "POST" }).catch(() => {});
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [post.id]);

  async function applyReaction(type: ReactionType | null) {
    if (reactBusy) return;
    const prevType = reactionType;
    const prevBreakdown = reactionBreakdown;
    const prevCount = reactionCount;

    // Optimistic update: remove the old type's tally (if any), add the new one.
    const nextBreakdown = { ...prevBreakdown };
    if (prevType) nextBreakdown[prevType] = Math.max(0, (nextBreakdown[prevType] ?? 1) - 1);
    if (type) nextBreakdown[type] = (nextBreakdown[type] ?? 0) + 1;
    setReactionType(type);
    setReactionBreakdown(nextBreakdown);
    setReactionCount(prevCount + (type ? 1 : 0) - (prevType ? 1 : 0));
    setReactBusy(true);
    try {
      const res = type
        ? await fetch(`/api/posts/${post.id}/react`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type }),
          })
        : await fetch(`/api/posts/${post.id}/react`, { method: "DELETE" });
      if (!res.ok) throw new Error("react failed");
    } catch {
      setReactionType(prevType);
      setReactionBreakdown(prevBreakdown);
      setReactionCount(prevCount);
    } finally {
      setReactBusy(false);
    }
  }

  async function handleRepost(comment: string) {
    if (repostBusy) return;
    setRepostBusy(true);
    try {
      const res = await fetch(`/api/posts/${post.id}/repost`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment }),
      });
      if (!res.ok) throw new Error("repost failed");
      setViewerHasReposted(true);
      setRepostCount((c) => c + 1);
    } catch (err) {
      console.error("[posts] failed to repost:", err);
    } finally {
      setRepostBusy(false);
    }
  }

  async function handleUndoRepost() {
    if (repostBusy) return;
    setRepostBusy(true);
    try {
      const res = await fetch(`/api/posts/${post.id}/repost`, { method: "DELETE" });
      if (!res.ok) throw new Error("undo repost failed");
      setViewerHasReposted(false);
      setRepostCount((c) => Math.max(0, c - 1));
    } catch (err) {
      console.error("[posts] failed to undo repost:", err);
    } finally {
      setRepostBusy(false);
    }
  }

  async function toggleSave() {
    if (saveBusy) return;
    const next = !saved;
    setSaved(next);
    setSaveBusy(true);
    try {
      const res = await fetch(`/api/posts/${post.id}/save`, { method: next ? "POST" : "DELETE" });
      if (!res.ok) throw new Error("save failed");
    } catch {
      setSaved(!next);
    } finally {
      setSaveBusy(false);
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

  function renderAuthorRow(author: PostItem["author"], createdAt: string, compact = false) {
    return (
      <div className="flex min-w-0 items-center gap-3">
        {author.avatarUrl ? (
          <img src={author.avatarUrl} alt="" className={`${compact ? "h-9 w-9" : "h-11 w-11"} flex-none rounded-full object-cover`} />
        ) : (
          <span
            className={`flex ${compact ? "h-9 w-9" : "h-11 w-11"} flex-none items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700`}
          >
            {(author.fullName || "?").charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 text-start">
          <Link
            href={`/dashboard/profile/${author.id}`}
            className="flex items-center gap-1.5 truncate text-sm font-semibold text-foreground hover:underline"
          >
            <span className="truncate">{author.fullName}</span>
            <DegreeBadge degree={author.connectionDegree} />
          </Link>
          {headline && !compact && <p className="truncate text-xs text-foreground/50">{headline}</p>}
          <p className="text-xs text-foreground/40">
            {formatRelativeTime(createdAt, locale)}
            {post.editedAt && !compact && ` · ${t("edited")}`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <Card
      id={`post-${post.id}`}
      ref={cardRef}
      className={highlighted ? "ring-2 ring-emerald-400 ring-offset-2 ring-offset-sand-100" : undefined}
    >
      {post.repostOf && (
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-foreground/50">
          {t("repostedLabel", { name: post.author.fullName })}
        </p>
      )}

      <div className="flex items-start justify-between gap-3">
        {renderAuthorRow(post.author, post.createdAt)}

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
              <div className="absolute end-0 z-20 mt-2 w-48 overflow-hidden rounded-xl border border-border bg-surface p-1.5 shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    toggleSave();
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm font-medium text-foreground/80 hover:bg-sand-100"
                >
                  <Bookmark size={14} className={saved ? "fill-emerald-600 text-emerald-600" : undefined} />
                  {saved ? t("unsave") : t("save")}
                </button>
                {isAuthor && (
                  <Link
                    href={{ pathname: "/dashboard/profile", query: { tab: "analytics" } }}
                    onClick={() => setMenuOpen(false)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm font-medium text-foreground/80 hover:bg-sand-100"
                  >
                    <BarChart2 size={14} />
                    {t("viewAnalytics")}
                  </Link>
                )}
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
        post.body && <p className="mt-3 whitespace-pre-wrap text-start text-sm text-foreground/90">{linkifyText(post.body)}</p>
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

      {post.repostOf && (
        <div className="mt-3 rounded-xl border border-border p-3">
          {post.repostOf.deleted ? (
            <p className="text-sm text-foreground/50">{t("originalUnavailable")}</p>
          ) : (
            <>
              {renderAuthorRow(post.repostOf.author, post.repostOf.createdAt, true)}
              {post.repostOf.body && <p className="mt-2 whitespace-pre-wrap text-start text-sm text-foreground/80">{linkifyText(post.repostOf.body)}</p>}
              {repostOfMediaUrls.length > 0 && (
                <div className={`mt-2 overflow-hidden rounded-lg ${repostOfMediaUrls.length > 1 ? "grid grid-cols-2 gap-1" : ""}`}>
                  {repostOfMediaUrls.map((m) =>
                    m.mediaType === "video" ? (
                      <video key={m.storagePath} src={m.url} controls className="max-h-64 w-full bg-black" />
                    ) : (
                      <img key={m.storagePath} src={m.url} alt="" className={`w-full object-cover ${repostOfMediaUrls.length === 1 ? "max-h-64" : "aspect-square"}`} />
                    )
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {reactionCount > 0 && (
        <div className="mt-3 flex justify-end">
          <ReactionSummary breakdown={reactionBreakdown} total={reactionCount} />
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-3">
        <PostReactionButton current={reactionType} onPick={applyReaction} onClear={() => applyReaction(null)} />
        <button
          type="button"
          onClick={() => setCommentsOpen((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-medium text-foreground/60 hover:text-foreground"
        >
          <MessageCircle size={16} />
          {t("comment")}
          {commentCount > 0 && <span className="text-xs text-foreground/40">{commentCount}</span>}
        </button>
        <RepostMenu repostCount={repostCount} viewerHasReposted={viewerHasReposted} busy={repostBusy} onRepost={handleRepost} onUndoRepost={handleUndoRepost} />
      </div>

      {commentsOpen && (
        <div className="mt-3 border-t border-border pt-3">
          <CommentThread
            postId={post.id}
            postAuthorId={post.author.id}
            postAuthorName={post.author.fullName}
            canComment={canComment}
            onCountChange={setCommentCount}
          />
        </div>
      )}
    </Card>
  );
}
