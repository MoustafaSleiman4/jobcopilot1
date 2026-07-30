import { createServerClient } from "@supabase/ssr";
import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { routing } from "./i18n/routing";

const handleI18nRouting = createMiddleware(routing);

/**
 * This project's proxy.ts is Next 16's replacement for middleware.ts — it
 * previously only handled next-intl locale routing. That was the real cause
 * of users getting silently logged out while clicking around the app:
 * Supabase's session access token is short-lived and needs to be refreshed
 * on every request via the SSR client's cookie handlers, which normally
 * happens in middleware. Without that refresh here, the token would expire
 * mid-session and dashboard/layout.tsx's `getUser()` check would start
 * returning null, bouncing the user to /login even though they never
 * explicitly signed out. This now refreshes the Supabase session (re-issuing
 * cookies onto the response) in the same pass as the i18n routing.
 */
export async function proxy(request: NextRequest) {
  const response = handleI18nRouting(request);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (url && anonKey) {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });

    // Touching auth here is what actually refreshes an expiring session and
    // re-sets the cookies onto `response` — do not remove even though the
    // returned user isn't used directly.
    await supabase.auth.getUser();
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|trpc|_next|_vercel|.*\\..*).*)"],
};
