import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Elevated-privilege Supabase client for trusted server contexts ONLY
 * (currently: the billing webhook). Uses the service_role key, which
 * bypasses Row Level Security — never import this into anything that runs
 * in the browser, and never expose SUPABASE_SERVICE_ROLE_KEY with a
 * NEXT_PUBLIC_ prefix.
 *
 * Get this key from Supabase → Project Settings → API → service_role
 * (the "secret" one, not the publishable/anon key already in use elsewhere).
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase admin client is not configured. Set SUPABASE_SERVICE_ROLE_KEY in .env.local (server-only, never NEXT_PUBLIC_)."
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
