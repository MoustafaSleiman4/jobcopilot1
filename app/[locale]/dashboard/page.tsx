import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { FileText, Send, CalendarCheck, Users, ArrowUpRight } from "lucide-react";

type RecentApplication = {
  id: string;
  title: string;
  company: string;
  status: string;
};

async function loadDashboardData() {
  // Server-rendered so the numbers are correct on first paint (no
  // client-side flash of hardcoded placeholders) and so a logged-out /
  // unconfigured visit degrades cleanly instead of throwing.
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        configured: true as const,
        plan: "free" as const,
        resumes: 0,
        applications: 0,
        interviews: 0,
        connections: 0,
        recent: [] as RecentApplication[],
      };
    }

    const [
      { data: profile },
      { count: resumeCount },
      { count: applicationCount },
      { count: interviewCount },
      { data: connectionsCount },
      { data: recentRows },
    ] = await Promise.all([
      supabase.from("profiles").select("plan, full_name").eq("id", user.id).single(),
      supabase.from("resumes").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("applications").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase
        .from("applications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "interview"),
      // Same security-definer RPC PersonDetailModal/PostsProfileSidebar use
      // for a person's connection count (accepted connections either side
      // of the pair) — reusing it here keeps this number consistent with
      // what shows up everywhere else in the app, rather than re-deriving
      // it with a second, possibly-drifting query against `connections`.
      supabase.rpc("connection_count", { target_id: user.id }),
      supabase
        .from("applications")
        .select("id, title, company, status")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(4),
    ]);

    return {
      configured: true as const,
      plan: (profile?.plan === "pro" ? "pro" : "free") as "free" | "pro",
      fullName: profile?.full_name as string | null | undefined,
      resumes: resumeCount ?? 0,
      applications: applicationCount ?? 0,
      interviews: interviewCount ?? 0,
      connections: (connectionsCount as number | null) ?? 0,
      recent: (recentRows ?? []) as RecentApplication[],
    };
  } catch {
    // Supabase isn't configured in this environment — demo mode.
    return {
      configured: false as const,
      plan: "free" as const,
      resumes: 0,
      applications: 0,
      interviews: 0,
      connections: 0,
      recent: [] as RecentApplication[],
    };
  }
}

export default async function DashboardOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ upgraded?: string }>;
}) {
  const t = await getTranslations("dashboard.overview");
  const tApps = await getTranslations("dashboard.applications");
  const data = await loadDashboardData();
  const { upgraded } = await searchParams;

  const stats = [
    { key: "statResumes", value: data.resumes, icon: FileText },
    { key: "statApplications", value: data.applications, icon: Send },
    { key: "statInterviews", value: data.interviews, icon: CalendarCheck },
    { key: "statConnections", value: data.connections, icon: Users },
  ] as const;

  return (
    <div>
      {upgraded === "1" && (
        <div
          className={`mb-6 rounded-xl border px-4 py-3 text-sm font-medium ${
            data.plan === "pro"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-gold-400/40 bg-gold-50 text-gold-700"
          }`}
        >
          {data.plan === "pro" ? t("upgradedSuccess") : t("upgradedPending")}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
          <p className="mt-1 text-sm text-foreground/60">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-2.5">
          <span className="text-sm font-medium text-foreground/70">
            {data.plan === "pro" ? t("planPro") : t("planFree")}
          </span>
          {data.plan !== "pro" && (
            <Link
              href="/pricing"
              className="rounded-full bg-gold-400 px-4 py-1.5 text-xs font-bold text-emerald-900 hover:bg-gold-500"
            >
              {t("upgrade")}
            </Link>
          )}
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-5 sm:grid-cols-4">
        {stats.map(({ key, value, icon: Icon }) => (
          <div key={key} className="rounded-2xl border border-border bg-surface p-6">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Icon size={20} />
            </div>
            <p className="text-3xl font-extrabold text-foreground">{value}</p>
            <p className="mt-1 text-sm text-foreground/60">{t(key)}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-border bg-surface p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground">{t("recentActivity")}</h2>
          <Link
            href="/dashboard/applications"
            className="flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
          >
            {t("viewAll")}
            <ArrowUpRight size={13} />
          </Link>
        </div>

        {data.recent.length === 0 ? (
          <p className="mt-3 text-sm text-foreground/50">{t("noActivity")}</p>
        ) : (
          <div className="mt-4 divide-y divide-border">
            {data.recent.map((app) => (
              <div key={app.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{app.title}</p>
                  <p className="truncate text-xs text-foreground/60">{app.company}</p>
                </div>
                <span className="flex-none rounded-full bg-sand-100 px-2.5 py-1 text-xs font-medium text-foreground/70">
                  {tApps(app.status)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
