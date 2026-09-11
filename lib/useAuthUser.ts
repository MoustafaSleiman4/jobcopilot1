"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PlanBillingRow } from "@/lib/planStatus";

export type AuthUser = {
  id: string;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  plan: "free" | "pro";
  // Personal photo set from the Resume & Profile Builder (/dashboard/resume)
  // — account-level, shared across every resume version. Surfaced here too
  // so it can also stand in for the initial-letter bubble in the dashboard
  // header (see DashboardShell.tsx) once someone has set one.
  avatarUrl: string | null;
  // Whether this account also owns a row in public.companies — i.e. the
  // same login can act as both a job seeker (/dashboard) and an employer
  // (/employer/dashboard). Used to surface a "switch to employer view" link
  // in the job-seeker dashboard's account menu without showing it to every
  // job seeker who has never touched the employer side.
  hasCompany: boolean;
  // Null for free users, or anyone with no public.subscriptions row (e.g. a
  // plan flipped by hand with no matching row — see lib/planStatus.ts,
  // which treats that the same as an indefinite manual grant). Feeds the
  // "expires on" / "renews on" line in the account menu — see
  // components/DashboardShell.tsx.
  billing: PlanBillingRow | null;
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

        // Run in parallel — the company lookup is a cheap `select id` (RLS
        // allows anyone to read public.companies) and shouldn't add latency
        // on top of the profile fetch every dashboard load already does.
        // The subscriptions lookup is the same story: it's a single-row,
        // own-row-only select (RLS: auth.uid() = user_id) and simply comes
        // back empty for free users, so it's cheap to always fetch here
        // rather than conditioning it on plan === "pro" first.
        const [{ data: profile }, { data: company }, { data: subscription }] = await Promise.all([
          supabase.from("profiles").select("full_name, phone, plan, avatar_url").eq("id", authedUser.id).single(),
          supabase.from("companies").select("id").eq("owner_id", authedUser.id).maybeSingle(),
          supabase
            .from("subscriptions")
            .select("provider, status, renews_at")
            .eq("user_id", authedUser.id)
            .maybeSingle(),
        ]);
        if (cancelled) return;

        setUser({
          id: authedUser.id,
          email: authedUser.email ?? null,
          fullName: profile?.full_name ?? null,
          phone: profile?.phone ?? null,
          plan: profile?.plan === "pro" ? "pro" : "free",
          avatarUrl: profile?.avatar_url ?? null,
          hasCompany: Boolean(company),
          billing: subscription
            ? { provider: subscription.provider, status: subscription.status, renewsAt: subscription.renews_at }
            : null,
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
