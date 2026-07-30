import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client. Safe to call from Client Components.
 * Requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
 * to be set (see .env.example). Until real values are configured this
 * will throw at call time, not at import time, so the app can still
 * render without a Supabase project connected yet.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured yet. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local (see .env.example)."
    );
  }

  return createBrowserClient(url, anonKey);
}
