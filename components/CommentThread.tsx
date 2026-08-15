"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, Send, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import { useAuthUser } from "@/lib/useAuthUser";
import { formatRelativeTime } from "@/lib/socialFormat";
import type { CommentItem } from "@/lib/social-types";

const MAX_COMMENT_CHARS = 1000;

function CommentAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  return avatarUrl ? (
    <img src={avatarUrl} alt="" className="h-8 w-8 flex-none rounded-full object-cover" />
  ) : (
    <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
      {(name || "?").charAt(0).toUpperCase()}
    </span>
  );
}

/**
 * Flat top-level comments, each with its replies indented one level — matches
 * the server's one-level-only rule (`parent_comment_id` always points at a
 * top-level comment, never at another reply). Replies attach to the
 * top-level comment they're under via a single reply box per top-level
 * comment, not per reply.
 */
export default function CommentThread({
  postId,
  onCountChange,
}: {
  postId: string;
  onCountChange?: (count: number) => void;
}) {
  const t = useTranslations("posts");
  const locale = useLocale();
  const { user } = useAuthUser();

  const [comments, setComments] = useState<CommentItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyOpenFor, setReplyOpenFor] = useState<string | null>(null);
  const [postingReplyFor, setPostingReplyFor] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/posts/${postId}/comments`);
        const data = await res.json();
        // GET /api/posts/[id]/comments responds { items: [...] }, not a
        // bare array — same shape mismatch as connections/page.tsx's
        // search/suggestions fetches. Comments were silently never
        // rendering because of this, independent of whether any existed.
        if (!cancelled) setComments(Array.isArray(data?.items) ? data.items : []);
      } catch {
        if (!cancelled) setComments([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [postId]);

  const { topLevel, repliesByParent } = useMemo(() => {
    const top: CommentItem[] = [];
    const replies: Record<string, CommentItem[]> = {};
    for (const c of comments ?? []) {
      if (c.parentCommentId) {
        (replies[c.parentCommentId] ??= []).push(c);
      } else {
        top.push(c);
      }
    }
    return { topLevel: top, repliesByParent: replies };
  }, [comments]);

  function reportCount(list: CommentItem[]) {
    onCountChange?.(list.length);
  }

  async function submitComment(parentCommentId?: string) {
    const body = (parentCommentId ? replyDrafts[parentCommentId] : newComment)?.trim();
    if (!body || body.length > MAX_COMMENT_CHARS) return;

    if (parentCommentId) setPostingReplyFor(parentCommentId);
    else setPosting(true);

    try {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, parentCommentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("commentError"));
      const created: CommentItem = data.comment ?? data;

      setComments((prev) => {
        const next = [...(prev ?? []), created];
        reportCount(next);
        return next;
      });

      if (parentCommentId) {
        setReplyDrafts((prev) => ({ ...prev, [parentCommentId]: "" }));
        setReplyOpenFor(null);
      } else {
        setNewComment("");
      }
    } catch (err) {
      console.error("[posts] failed to post comment:", err);
    } finally {
      setPostingReplyFor(null);
      setPosting(false);
    }
  }

  async function deleteComment(id: string) {
    if (deletingId) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/comments/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      setComments((prev) => {
        const next = (prev ?? []).filter((c) => c.id !== id && c.parentCommentId !== id);
        reportCount(next);
        return next;
      });
    } catch (err) {
      console.error("[posts] failed to delete comment:", err);
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-foreground/50">
        <Loader2 size={14} className="animate-spin" />
        {t("loadingComments")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {topLevel.length === 0 && <p className="text-sm text-foreground/50">{t("noComments")}</p>}

      {topLevel.map((comment) => {
        const replies = repliesByParent[comment.id] ?? [];
        return (
          <div key={comment.id} className="space-y-2">
            <div className="flex items-start gap-2.5">
              <CommentAvatar name={comment.author.fullName} avatarUrl={comment.author.avatarUrl} />
              <div className="min-w-0 flex-1 text-start">
                <div className="rounded-xl bg-sand-100 px-3 py-2">
                  <p className="text-xs font-semibold text-foreground">{comment.author.fullName}</p>
                  <p className="whitespace-pre-wrap text-sm text-foreground/90">{comment.body}</p>
                </div>
                <div className="mt-1 flex items-center gap-3 ps-1 text-xs text-foreground/40">
                  <span>{formatRelativeTime(comment.createdAt, locale)}</span>
                  <button
                    type="button"
                    onClick={() => setReplyOpenFor((v) => (v === comment.id ? null : comment.id))}
                    className="font-medium text-foreground/60 hover:text-foreground"
                  >
                    {t("reply")}
                  </button>
                  {user?.id === comment.author.id && (
                    <button
                      type="button"
                      onClick={() => deleteComment(comment.id)}
                      disabled={deletingId === comment.id}
                      className="font-medium text-red-500 hover:text-red-600"
                    >
                      {deletingId === comment.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {replies.length > 0 && (
              <div className="ms-10 space-y-2">
                {replies.map((reply) => (
                  <div key={reply.id} className="flex items-start gap-2.5">
                    <CommentAvatar name={reply.author.fullName} avatarUrl={reply.author.avatarUrl} />
                    <div className="min-w-0 flex-1 text-start">
                      <div className="rounded-xl bg-sand-100 px-3 py-2">
                        <p className="text-xs font-semibold text-foreground">{reply.author.fullName}</p>
                        <p className="whitespace-pre-wrap text-sm text-foreground/90">{reply.body}</p>
                      </div>
                      <div className="mt-1 flex items-center gap-3 ps-1 text-xs text-foreground/40">
                        <span>{formatRelativeTime(reply.createdAt, locale)}</span>
                        {user?.id === reply.author.id && (
                          <button
                            type="button"
                            onClick={() => deleteComment(reply.id)}
                            disabled={deletingId === reply.id}
                            className="font-medium text-red-500 hover:text-red-600"
                          >
                            {deletingId === reply.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {replyOpenFor === comment.id && (
              <div className="ms-10 flex items-center gap-2">
                <input
                  type="text"
                  value={replyDrafts[comment.id] ?? ""}
                  onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [comment.id]: e.target.value }))}
                  placeholder={t("replyPlaceholder")}
                  maxLength={MAX_COMMENT_CHARS}
                  className="flex-1 rounded-full border border-border bg-background px-3.5 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitComment(comment.id);
                  }}
                />
                <Button
                  variant="primary"
                  loading={postingReplyFor === comment.id}
                  disabled={!(replyDrafts[comment.id] ?? "").trim()}
                  onClick={() => submitComment(comment.id)}
                >
                  <Send size={13} />
                </Button>
              </div>
            )}
          </div>
        );
      })}

      <div className="flex items-center gap-2 border-t border-border pt-3">
        <input
          type="text"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder={t("commentPlaceholder")}
          maxLength={MAX_COMMENT_CHARS}
          className="flex-1 rounded-full border border-border bg-background px-3.5 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          onKeyDown={(e) => {
            if (e.key === "Enter") submitComment();
          }}
        />
        <Button variant="primary" loading={posting} disabled={!newComment.trim()} onClick={() => submitComment()}>
          <Send size={13} />
        </Button>
      </div>
    </div>
  );
}
