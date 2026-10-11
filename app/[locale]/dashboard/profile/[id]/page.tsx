"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Newspaper } from "lucide-react";
import { useAuthUser } from "@/lib/useAuthUser";
import ProfileHeader from "@/components/profile/ProfileHeader";
import EditProfileModal from "@/components/profile/EditProfileModal";
import AboutSection from "@/components/profile/AboutSection";
import ExperienceSection from "@/components/profile/ExperienceSection";
import EducationSection from "@/components/profile/EducationSection";
import SkillsSection from "@/components/profile/SkillsSection";
import FeaturedSection from "@/components/profile/FeaturedSection";
import AnalyticsPanel from "@/components/profile/AnalyticsPanel";
import PostCard from "@/components/PostCard";
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";
import type { PostItem, ProfileDetail } from "@/lib/social-types";

type Tab = "posts" | "analytics";

/**
 * The rich profile page — GET /api/profile/[id]'s full payload rendered as
 * a LinkedIn-style stack of sections (header, about, experience, education,
 * skills, featured) plus that person's own posts, with a self-only
 * Analytics tab. Wrapped in Suspense below for the same reason
 * connections/page.tsx and posts/page.tsx are: useSearchParams() (reading
 * ?tab=analytics, the deep-link PostCard's "View analytics" menu entry
 * points at) requires it.
 */
function ProfilePageContent() {
  const t = useTranslations("connections");
  const params = useParams<{ id: string }>();
  const profileId = params.id;
  const searchParams = useSearchParams();
  const { user } = useAuthUser();
  const isSelf = Boolean(user && user.id === profileId);

  const [profile, setProfile] = useState<ProfileDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [tab, setTab] = useState<Tab>(searchParams.get("tab") === "analytics" ? "analytics" : "posts");

  const loadProfile = useCallback(() => {
    setLoading(true);
    setNotFound(false);
    fetch(`/api/profile/${profileId}`)
      .then(async (res) => {
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (!res.ok) throw new Error("failed to load profile");
        const data = (await res.json()) as ProfileDetail;
        setProfile(data);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [profileId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Re-sync the tab from the URL when it changes on an already-mounted
  // page — same fix as ConnectionsPageContent's matching effect, needed so
  // a "View analytics" click from a post menu lands on that tab even when
  // this page is already open (client-side nav doesn't remount).
  useEffect(() => {
    const paramTab = searchParams.get("tab") === "analytics" ? "analytics" : "posts";
    setTab((current) => (current === paramTab ? current : paramTab));
  }, [searchParams]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-foreground/40" />
      </div>
    );
  }

  if (notFound || !profile) {
    return <EmptyState icon={Newspaper} title={t("detail.notFound")} />;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <ProfileHeader profile={profile} isSelf={isSelf} onChanged={loadProfile} onEditClick={() => setEditOpen(true)} />

      <AboutSection about={profile.about} isSelf={isSelf} onSaved={(about) => setProfile((p) => (p ? { ...p, about } : p))} />

      <ExperienceSection
        items={profile.experience}
        isSelf={isSelf}
        onChange={(experience) => setProfile((p) => (p ? { ...p, experience } : p))}
      />

      <EducationSection
        items={profile.education}
        isSelf={isSelf}
        onChange={(education) => setProfile((p) => (p ? { ...p, education } : p))}
      />

      <SkillsSection items={profile.skills} isSelf={isSelf} onChange={(skills) => setProfile((p) => (p ? { ...p, skills } : p))} />

      <FeaturedSection items={profile.featured} isSelf={isSelf} onChange={(featured) => setProfile((p) => (p ? { ...p, featured } : p))} />

      {isSelf && (
        <div className="flex gap-1 border-b border-border">
          {(["posts", "analytics"] as Tab[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex-none whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                tab === key ? "border-emerald-600 text-emerald-700" : "border-transparent text-foreground/50 hover:text-foreground"
              }`}
            >
              {t(`detail.profileTabs.${key}`)}
            </button>
          ))}
        </div>
      )}

      {tab === "analytics" && isSelf ? <AnalyticsPanel /> : <ProfilePosts authorId={profileId} />}

      {editOpen && (
        <EditProfileModal
          profile={profile}
          onClose={() => setEditOpen(false)}
          onSaved={(patch) => setProfile((p) => (p ? { ...p, ...patch } : p))}
        />
      )}
    </div>
  );
}

/** That person's own posts (including their reposts) — GET /api/posts?authorId=. */
function ProfilePosts({ authorId }: { authorId: string }) {
  const t = useTranslations("posts");
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(
    async (cursorParam?: string | null) => {
      const qp = new URLSearchParams({ authorId });
      if (cursorParam) qp.set("cursor", cursorParam);
      const res = await fetch(`/api/posts?${qp.toString()}`);
      const data = await res.json();
      return { items: (data.items ?? []) as PostItem[], nextCursor: (data.nextCursor ?? null) as string | null };
    },
    [authorId]
  );

  useEffect(() => {
    setLoading(true);
    load().then(({ items, nextCursor }) => {
      setPosts(items);
      setCursor(nextCursor);
      setLoading(false);
    });
  }, [load]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    const { items, nextCursor } = await load(cursor);
    setPosts((prev) => [...prev, ...items]);
    setCursor(nextCursor);
    setLoadingMore(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-foreground/50">
        <Loader2 size={16} className="animate-spin" />
        {t("loading")}
      </div>
    );
  }

  if (posts.length === 0) {
    return <EmptyState icon={Newspaper} title={t("noPosts")} description={t("noPostsHint")} />;
  }

  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          onDeleted={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))}
          onUpdated={(updated) => setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))}
        />
      ))}
      {cursor && (
        <div className="pt-2 text-center">
          <Button variant="secondary" loading={loadingMore} onClick={loadMore}>
            {t("loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-foreground/40" />
        </div>
      }
    >
      <ProfilePageContent />
    </Suspense>
  );
}
