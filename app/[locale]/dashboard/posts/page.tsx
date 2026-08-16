"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Newspaper, Loader2 } from "lucide-react";
import PostComposer from "@/components/PostComposer";
import PostCard from "@/components/PostCard";
import PostsProfileSidebar from "@/components/PostsProfileSidebar";
import PostsSuggestionsSidebar from "@/components/PostsSuggestionsSidebar";
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";
import type { PostItem } from "@/lib/social-types";

function PostsPageContent() {
  const t = useTranslations("posts");
  const searchParams = useSearchParams();
  const targetPostId = searchParams.get("postId");

  const [posts, setPosts] = useState<PostItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  // Only ever act on the ?postId= deep link once — a poll/refresh landing
  // after the viewer has already scrolled away shouldn't yank them back.
  const appliedTargetRef = useRef(false);

  async function load(cursorParam?: string | null) {
    const params = new URLSearchParams();
    if (cursorParam) params.set("cursor", cursorParam);
    const res = await fetch(`/api/posts?${params.toString()}`);
    const data = await res.json();
    return { items: (data.items ?? []) as PostItem[], nextCursor: (data.nextCursor ?? null) as string | null };
  }

  useEffect(() => {
    setLoading(true);
    load().then(({ items, nextCursor }) => {
      setPosts(items);
      setCursor(nextCursor);
      setLoading(false);
    });
  }, []);

  // Notification deep-link: a reaction/comment notification links here as
  // ?postId=X. If that post already loaded as part of the normal feed
  // page, great — just scroll to it. If it's older than the first feed
  // page (likely, since notifications can be old), fetch it individually
  // via GET /api/posts/[id] and prepend it so it's visible regardless of
  // where it'd normally sort in the cursor-paginated feed.
  useEffect(() => {
    if (!targetPostId || loading || appliedTargetRef.current) return;
    appliedTargetRef.current = true;

    async function ensureLoaded() {
      if (!posts.some((p) => p.id === targetPostId)) {
        try {
          const res = await fetch(`/api/posts/${targetPostId}`);
          if (res.ok) {
            const data = await res.json();
            if (data.post) setPosts((prev) => [data.post as PostItem, ...prev]);
          }
          // A 404 here just means the post was deleted or the viewer's
          // network changed since the notification fired — nothing to
          // show, so we silently leave the feed as-is rather than erroring.
        } catch {
          // Best effort — same reasoning as above.
        }
      }
      // Scroll after the DOM has the card, whether it was already in the
      // feed or just prepended.
      requestAnimationFrame(() => {
        document.getElementById(`post-${targetPostId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }

    ensureLoaded();
  }, [targetPostId, loading, posts]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    const { items, nextCursor } = await load(cursor);
    setPosts((prev) => [...prev, ...items]);
    setCursor(nextCursor);
    setLoadingMore(false);
  }

  function handlePosted(post: PostItem) {
    setPosts((prev) => [post, ...prev]);
  }

  function handleDeleted(postId: string) {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  }

  function handleUpdated(updated: PostItem) {
    setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }

  return (
    // LinkedIn-style 3-column feed instead of a single narrow centered
    // column: a left "this is you" mini-profile rail and a right "people
    // you may know" rail flank the feed once there's room for them,
    // matching the dashboard's actual full width instead of leaving most
    // of a wide screen empty on either side. Below `lg` (no room for either
    // rail) it collapses to the original single centered column — the grid
    // template itself is only set from `lg` up, so a narrower viewport just
    // falls back to normal block layout with the center column's own
    // `max-w-2xl mx-auto` taking over.
    <div className="mx-auto max-w-7xl lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start lg:gap-6 xl:grid-cols-[260px_minmax(0,640px)_300px]">
      <aside className="hidden lg:sticky lg:top-6 lg:block">
        <PostsProfileSidebar />
      </aside>

      <div className="mx-auto w-full max-w-2xl lg:mx-0 lg:max-w-none">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <Newspaper size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
          </div>
        </div>

        <div className="mt-6">
          <PostComposer onPosted={handlePosted} />
        </div>

        <div className="mt-6 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-foreground/50">
              <Loader2 size={16} className="animate-spin" />
              {t("loading")}
            </div>
          ) : posts.length === 0 ? (
            <EmptyState icon={Newspaper} title={t("noPosts")} description={t("noPostsHint")} />
          ) : (
            <>
              {posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  onDeleted={handleDeleted}
                  onUpdated={handleUpdated}
                  highlighted={post.id === targetPostId}
                  defaultCommentsOpen={post.id === targetPostId}
                />
              ))}
              {cursor && (
                <div className="pt-2 text-center">
                  <Button variant="secondary" loading={loadingMore} onClick={loadMore}>
                    {t("loadMore")}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <aside className="hidden xl:sticky xl:top-6 xl:block">
        <PostsSuggestionsSidebar />
      </aside>
    </div>
  );
}

export default function PostsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-foreground/40" />
        </div>
      }
    >
      <PostsPageContent />
    </Suspense>
  );
}
