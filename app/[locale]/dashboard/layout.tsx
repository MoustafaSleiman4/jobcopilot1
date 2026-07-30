import { redirect } from "next/navigation";
import DashboardShell from "@/components/DashboardShell";
import { createClient } from "@/lib/supabase/server";

// The dashboard reads cookies (via the Supabase server client) to check for
// a session, so it can never be statically prerendered — force that
// explicitly rather than letting Next.js infer it at build time.
export const dynamic = "force-dynamic";

async function getSupabaseSession() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return { configured: true as const, user };
  } catch {
    return { configured: false as const, user: null };
  }
}

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const { configured, user } = await getSupabaseSession();

  // Once Supabase is configured, a real login is required to see the
  // dashboard — without this, uploads/saves would silently fail Row Level
  // Security checks instead of prompting the user to log in.
  if (configured && !user) {
    redirect(`/${locale}/login`);
  }

  return <DashboardShell demoMode={!configured}>{children}</DashboardShell>;
}
