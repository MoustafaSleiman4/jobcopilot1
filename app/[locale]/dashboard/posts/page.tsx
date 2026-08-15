"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Newspaper, Loader2 } from "lucide-react";
import PostComposer from "@/components/PostComposer";
import PostCard from "@/components/PostCard";
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";
import type { PostItem } from "@/lib/social-types";

export default function PostsPage() {
  const t = useTranslations("posts");
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

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
    <div className="mx-auto max-w-2xl">
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
              <PostCard key={post.id} post={post} onDeleted={handleDeleted} onUpdated={handleUpdated} />
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
  );
}
