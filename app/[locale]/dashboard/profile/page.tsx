"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { useAuthUser } from "@/lib/useAuthUser";

/**
 * "/dashboard/profile" with no id — the nav item (DashboardShell) and
 * PostCard's "View analytics" menu entry both link here rather than
 * needing to know the viewer's own id ahead of time. Immediately redirects
 * to the real route, /dashboard/profile/[id], passing through any ?tab=
 * query (analytics) so that deep link still lands on the right tab.
 */
function ProfileSelfRedirectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useAuthUser();

  useEffect(() => {
    if (loading || !user) return;
    const tab = searchParams.get("tab");
    router.replace(tab ? `/dashboard/profile/${user.id}?tab=${tab}` : `/dashboard/profile/${user.id}`);
  }, [loading, user, searchParams, router]);

  return (
    <div className="flex justify-center py-20">
      <Loader2 className="h-6 w-6 animate-spin text-foreground/40" />
    </div>
  );
}

export default function ProfileSelfRedirectPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-foreground/40" />
        </div>
      }
    >
      <ProfileSelfRedirectContent />
    </Suspense>
  );
}
