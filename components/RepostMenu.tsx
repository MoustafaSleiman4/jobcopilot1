"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Repeat2, Send } from "lucide-react";
import Button from "@/components/ui/Button";

/**
 * The Repost control — a small menu offering a plain, instant reshare or
 * "repost with your thoughts" (opens an inline textarea, same shape as
 * PostCard's own edit-mode textarea). Once the viewer has already reposted
 * this post, the button switches to an "undo repost" toggle instead of
 * reopening the menu — matching LinkedIn's own one-click-to-undo repost
 * behavior, since re-prompting for commentary on an un-repost makes no
 * sense.
 */
export default function RepostMenu({
  repostCount,
  viewerHasReposted,
  busy,
  onRepost,
  onUndoRepost,
}: {
  repostCount: number;
  viewerHasReposted: boolean;
  busy: boolean;
  onRepost: (comment: string) => void | Promise<void>;
  onUndoRepost: () => void | Promise<void>;
}) {
  const t = useTranslations("posts");
  const [menuOpen, setMenuOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  const [comment, setComment] = useState("");

  if (viewerHasReposted) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => onUndoRepost()}
        className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 transition-colors disabled:opacity-60"
      >
        <Repeat2 size={16} />
        {t("reposted")}
        {repostCount > 0 && <span className="text-xs text-foreground/40">{repostCount}</span>}
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        disabled={busy}
        onClick={() => setMenuOpen((v) => !v)}
        className="flex items-center gap-1.5 text-sm font-medium text-foreground/60 transition-colors hover:text-foreground disabled:opacity-60"
      >
        <Repeat2 size={16} />
        {t("repost")}
        {repostCount > 0 && <span className="text-xs text-foreground/40">{repostCount}</span>}
      </button>

      {menuOpen && !composing && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
          <div className="absolute bottom-full start-0 z-20 mb-2 w-52 overflow-hidden rounded-xl border border-border bg-surface p-1.5 shadow-lg">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onRepost("");
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm font-medium text-foreground/80 hover:bg-sand-100"
            >
              <Repeat2 size={14} />
              {t("repostPlain")}
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setComposing(true);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm font-medium text-foreground/80 hover:bg-sand-100"
            >
              <Send size={14} />
              {t("repostWithThoughts")}
            </button>
          </div>
        </>
      )}

      {composing && (
        <>
          <div className="fixed inset-0 z-30 bg-foreground/40 backdrop-blur-[2px]" onClick={() => setComposing(false)} />
          <div
            className="fixed inset-x-4 top-1/2 z-40 mx-auto max-w-md -translate-y-1/2 rounded-2xl border border-border bg-surface p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-semibold text-foreground">{t("repostWithThoughts")}</p>
            <textarea
              autoFocus
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder={t("repostPlaceholder")}
              className="mt-2 w-full resize-y rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-start focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setComposing(false)} disabled={busy}>
                {t("cancel")}
              </Button>
              <Button
                variant="primary"
                loading={busy}
                onClick={() => {
                  onRepost(comment.trim());
                  setComposing(false);
                  setComment("");
                }}
              >
                {t("repost")}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
