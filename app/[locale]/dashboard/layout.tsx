import DashboardShell from "@/components/DashboardShell";
import { createClient } from "@/lib/supabase/server";

// The dashboard reads cookies (via the Supabase server client) to check for
// a session, so it can never be statically prerendered — force that
// explicitly rather than letting Next.js infer it at build time.
export const dynamic = "force-dynamic";

async function isSupabaseConfigured() {
  try {
    await createClient();
    return true;
  } catch {
    return false;
  }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const configured = await isSupabaseConfigured();

  // Once Supabase is configured, this is the place to check for a real
  // session and redirect unauthenticated users to /login.

  return <DashboardShell demoMode={!configured}>{children}</DashboardShell>;
}
