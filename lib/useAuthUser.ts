"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type AuthUser = {
  id: string;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  plan: "free" | "pro";
};

/**
 * Single source of truth for "is someone logged in, and who are they" on the
 * client. Every place that previously ran its own ad-hoc
 * `supabase.auth.getUser()` effect (the marketing navbar, the dashboard
 * shell, the job search page) drifted independently, which is how the app
 * ended up with a navbar that always says "Log in" even when you are, and a
 * dashboard with no visible account/sign-out affordance at all. Centralizing
 * it here means every surface reflects the same session state.
 *
 * `loading` is true until the initial check resolves — consumers should not
 * render a "logged out" UI while loading, only after.
 * `configured` is false when Supabase env vars aren't set at all (local/demo
 * mode), as distinct from "configured but nobody is logged in".
 */
export function useAuthUser() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        const authedUser = data.user;
        if (!authedUser || cancelled) return;

        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, phone, plan")
          .eq("id", authedUser.id)
          .single();
        if (cancelled) return;

        setUser({
          id: authedUser.id,
          email: authedUser.email ?? null,
          fullName: profile?.full_name ?? null,
          phone: profile?.phone ?? null,
          plan: profile?.plan === "pro" ? "pro" : "free",
        });
      } catch {
        if (!cancelled) setConfigured(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { user, loading, configured };
}
