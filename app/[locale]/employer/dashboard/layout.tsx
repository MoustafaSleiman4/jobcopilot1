import { redirect } from "next/navigation";
import EmployerDashboardShell from "@/components/EmployerDashboardShell";
import { createClient } from "@/lib/supabase/server";

// Reads cookies (session) and the database (company row) on every request —
// can never be statically prerendered. Same reasoning as
// app/[locale]/dashboard/layout.tsx.
export const dynamic = "force-dynamic";

export default async function EmployerDashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  let configured = true;
  let companyName = "";

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect(`/${locale}/employer/login`);
    }

    // This session's company row is what actually distinguishes an employer
    // account from a job-seeker one — there's no flag on public.profiles
    // for it (see EmployerSignupForm's comment). No row means either the
    // signup insert failed, or a job-seeker session ended up here directly;
    // either way, onboarding is the unblock, not an error page.
    const { data: company } = await supabase
      .from("companies")
      .select("name")
      .eq("owner_id", user.id)
      .maybeSingle();

    if (!company) {
      redirect(`/${locale}/employer/onboarding`);
    }

    companyName = company.name;
  } catch (err) {
    // A `redirect()` call above works by throwing internally — let that
    // specific throw continue propagating instead of being swallowed here
    // as "Supabase not configured".
    if (err && typeof err === "object" && "digest" in err) throw err;
    configured = false;
  }

  return (
    <EmployerDashboardShell companyName={companyName || "Demo Company"} demoMode={!configured}>
      {children}
    </EmployerDashboardShell>
  );
}
