import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AuthAwareCta from "@/components/AuthAwareCta";
import HideIfPro from "@/components/HideIfPro";
import ScrollReveal from "@/components/ScrollReveal";
import JobsShowcase from "@/components/JobsShowcase";
import SocialActivityStrip from "@/components/SocialActivityStrip";
import { SOCIAL_LINKS } from "@/components/SocialLinks";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import {
  FileText,
  Search,
  MousePointerClick,
  KanbanSquare,
  MessageCircleMore,
  Languages,
  Quote,
  Mail,
  Award,
  BarChart3,
} from "lucide-react";

const featureIcons = {
  resume: FileText,
  search: Search,
  apply: MousePointerClick,
  coverLetter: Mail,
  tracker: KanbanSquare,
  reports: BarChart3,
  certifications: Award,
  chatbot: MessageCircleMore,
  bilingual: Languages,
} as const;

// Features that only unlock on the Pro plan (each dashboard page itself
// enforces this — see the `plan !== "pro"` check in app/[locale]/dashboard/
// {jobs,cover-letter,reports,certifications}/page.tsx, which all render a
// locked/upgrade view, and the same check inside handleApply/handleBulkApply
// on the jobs page for one-click/bulk apply specifically). Surfacing that on
// the landing page is honest (nobody clicks through expecting these free)
// and doubles as a preview of what upgrading actually gets you, right next
// to the pricing link above.
//
// Keep this in sync with the actual `plan !== "pro"` gates in code, not with
// what the pricing page's copy happens to list — those two have drifted
// before (Reports/Certifications were built and gated but never appeared in
// pricing copy; conversely "Application tracker" is listed as Pro on
// pricing but isn't actually gated in code, so it's deliberately left out of
// this set — see the open decision logged in the project status doc).
const PRO_FEATURE_KEYS = new Set<keyof typeof featureIcons>([
  "search",
  "apply",
  "coverLetter",
  "reports",
  "certifications",
]);

// Reuses the same icons as the features grid below — each step in "How it
// works" maps to the feature it's demonstrating, so the two sections read
// as one consistent story rather than introducing a second icon set.
const stepIcons = {
  resume: FileText,
  match: Search,
  apply: MousePointerClick,
  track: KanbanSquare,
} as const;

// Rotates through the existing brand colors so avatar initials aren't all
// identical — purely presentational, no meaning tied to a specific color.
const AVATAR_COLORS = [
  "bg-emerald-100 text-emerald-700",
  "bg-gold-100 text-gold-700",
  "bg-sand-200 text-foreground/70",
];

const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://gulfjobcopilot.com").replace(/\/$/, "");

// Reads cookies (via the Supabase server client) to check for a session, so
// this page can never be statically prerendered for everyone at once — same
// reasoning as app/[locale]/dashboard/layout.tsx.
export const dynamic = "force-dynamic";

async function getSignedInUser() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  } catch {
    // Supabase not configured (e.g. local dev without env vars) — same
    // "treat as logged out" fallback the dashboard layouts use.
    return null;
  }
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // A signed-in visitor landing here (bookmark, shared link, typing the
  // bare domain) previously saw the full marketing page with a "Go to
  // dashboard" button (AuthAwareCta) — one extra click to get where they
  // actually wanted. Redirect straight to the dashboard instead, same as
  // /login and /signup already do for a signed-in visitor (see
  // LoginForm.tsx / SignupForm.tsx).
  const user = await getSignedInUser();
  if (user) {
    redirect(`/${locale}/dashboard`);
  }

  const t = await getTranslations({ locale, namespace: "home" });

  const featureKeys = Object.keys(featureIcons) as (keyof typeof featureIcons)[];
  const stepKeys = Object.keys(stepIcons) as (keyof typeof stepIcons)[];
  const regions = t.raw("regions") as string[];
  const testimonials = t.raw("testimonials.items") as { quote: string; role: string; location: string }[];

  // Organization + SoftwareApplication structured data so search engines can
  // show a richer result (name, description, pricing) instead of just a
  // plain blue link — see https://developers.google.com/search/docs/appearance/structured-data.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "GulfJobCopilot",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: `${SITE_URL}/${locale}`,
    inLanguage: locale,
    description: t("subtitle"),
    offers: [
      { "@type": "Offer", price: "0", priceCurrency: "USD", name: "Free" },
      { "@type": "Offer", price: "9.99", priceCurrency: "USD", name: "Pro monthly" },
    ],
    provider: {
      "@type": "Organization",
      name: "GulfJobCopilot",
      url: SITE_URL,
      // Square (512x512) render of the same Burj Khalifa mark used in
      // Logo.tsx, generated via Playwright straight from the site's own
      // brand gradient (globals.css --emerald-500/--emerald-700) and gold
      // accent — Google's Organization/Knowledge Panel logo guidance wants
      // a roughly square image, which the site's actual wordmark logo
      // (wide aspect) isn't, so this is a separate square-cropped asset
      // rather than reusing the wordmark.
      logo: `${SITE_URL}/logo-mark.png`,
    },
  };

  return (
    <div className="flex min-h-screen flex-col">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Navbar />

      <main className="flex-1">
        {/* Jobs showcase — a fully 3D, continuously turning drum of real job
            listings pulled live from public.retrieved_jobs (see
            app/api/jobs/showcase and components/JobsShowcase.tsx), meant to
            visually sell the site's actual scale ("thousands of real jobs")
            to a first-time visitor rather than just asserting it in copy.
            Placed as the very first thing on the page — above the hero's
            headline — so it's the first thing a visitor sees, not something
            that requires scrolling past the hero to find. */}
        <section className="bg-background py-6 sm:py-8">
          <div className="mx-auto max-w-6xl px-6">
            <ScrollReveal>
              <p className="text-center text-xs font-bold uppercase tracking-wide text-gold-600 sm:text-sm">
                {t("jobsShowcase.eyebrow")}
              </p>
              <h2 className="mt-1 text-center text-xl font-bold text-foreground sm:text-2xl">
                {t("jobsShowcase.title")}
              </h2>
              <p className="mx-auto mt-1 max-w-2xl text-center text-xs leading-relaxed text-foreground/60 sm:text-sm">
                {t("jobsShowcase.subtitle")}
              </p>
            </ScrollReveal>
          </div>
          {/* Full page width, deliberately outside the max-w-6xl/px-6
              container above (the heading stays centered/contained; the
              animation itself doesn't) — the cards should visibly travel
              edge-to-edge, not be boxed into the same reading column as the
              text. */}
          <ScrollReveal delay={150} className="mt-3">
            <JobsShowcase />
          </ScrollReveal>
        </section>

        {/* Hero — flat, neutral surface (no gradient/pattern/orbs/confetti/
            skyline). The product's own substance (real job counts above,
            the feature list and social stats below) carries the page now,
            not decorative motion. */}
        <section className="border-y border-border bg-surface">
          <div className="mx-auto max-w-4xl px-6 py-14 text-center sm:py-20">
            <ScrollReveal direction="none">
              <Badge tone="gold">{t("badge")}</Badge>
            </ScrollReveal>
            <ScrollReveal delay={150}>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-5xl">
                {t("title")}
              </h1>
            </ScrollReveal>
            <ScrollReveal delay={300}>
              <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-foreground/70 sm:text-base">
                {t("subtitle")}
              </p>
            </ScrollReveal>
            <ScrollReveal delay={450}>
              <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <AuthAwareCta
                  loggedOutHref="/signup"
                  loggedOutLabel={t("ctaPrimary")}
                  loggedInLabel={t("goToDashboard")}
                  className="w-full rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 sm:w-auto sm:px-8 sm:py-3 sm:text-base"
                />
                <HideIfPro>
                  <Link
                    href="/pricing"
                    className="w-full rounded-full border border-border bg-background px-6 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-emerald-300 hover:bg-emerald-50 sm:w-auto sm:px-8 sm:py-3 sm:text-base"
                  >
                    {t("ctaSecondary")}
                  </Link>
                </HideIfPro>
              </div>
            </ScrollReveal>
            <ScrollReveal delay={600}>
              <p className="mt-4 text-xs text-foreground/50 sm:text-sm">{t("trustedBy")}</p>
            </ScrollReveal>

            <ScrollReveal delay={750}>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <span className="text-xs font-medium text-foreground/40">{t("regionsLabel")}</span>
                {regions.map((region) => (
                  <Badge key={region} tone="neutral">
                    {region}
                  </Badge>
                ))}
              </div>
            </ScrollReveal>
          </div>
        </section>

        {/* How it works */}
        <section className="bg-surface py-20">
          <div className="mx-auto max-w-6xl px-6">
            <ScrollReveal>
              <h2 className="text-center text-3xl font-bold text-foreground sm:text-4xl">
                {t("howItWorks.title")}
              </h2>
            </ScrollReveal>
            <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {stepKeys.map((key, i) => {
                const Icon = stepIcons[key];
                return (
                  <ScrollReveal key={key} delay={i * 120} className="text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                      <Icon size={24} />
                    </div>
                    <span className="mt-4 block text-xs font-bold uppercase tracking-wide text-gold-600">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h3 className="mt-1 text-lg font-semibold text-foreground">
                      {t(`howItWorks.steps.${key}.title`)}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-foreground/60">
                      {t(`howItWorks.steps.${key}.desc`)}
                    </p>
                  </ScrollReveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="border-t border-border bg-surface py-20">
          <div className="mx-auto max-w-6xl px-6">
            <ScrollReveal>
              <h2 className="text-center text-3xl font-bold text-foreground sm:text-4xl">
                {t("features.title")}
              </h2>
            </ScrollReveal>
            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {featureKeys.map((key, i) => {
                const Icon = featureIcons[key];
                const isPro = PRO_FEATURE_KEYS.has(key);
                return (
                  <ScrollReveal key={key} delay={(i % 3) * 120}>
                    <Card className="h-full">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                          <Icon size={20} />
                        </div>
                        {isPro && <Badge tone="gold">{t("features.proBadge")}</Badge>}
                      </div>
                      <h3 className="mt-4 text-lg font-semibold text-foreground">
                        {t(`features.${key}.title`)}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-foreground/60">
                        {t(`features.${key}.desc`)}
                      </p>
                    </Card>
                  </ScrollReveal>
                );
              })}
            </div>
            <HideIfPro>
              <p className="mt-8 text-center text-sm text-foreground/50">
                {t.rich("features.proNote", {
                  badge: (chunks) => (
                    <span className="rounded-full bg-gold-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gold-700">
                      {chunks}
                    </span>
                  ),
                  link: (chunks) => (
                    <Link href="/pricing" className="font-semibold text-emerald-600 hover:underline">
                      {chunks}
                    </Link>
                  ),
                })}
              </p>
            </HideIfPro>
          </div>
        </section>

        {/* Social / community — the same "show real scale, don't just claim
            it" idea as the jobs showcase above, applied to the built-in
            professional network (Connections/Posts) instead of job
            listings. Placed after Features (which already mentions the
            AI-assistant/bilingual features) and before Testimonials, as
            another concrete proof point rather than pure marketing copy. */}
        <section className="border-t border-border bg-background py-20">
          <div className="mx-auto max-w-6xl px-6">
            <ScrollReveal>
              <p className="text-center text-xs font-bold uppercase tracking-wide text-gold-600">
                {t("social.eyebrow")}
              </p>
              <h2 className="mt-2 text-center text-3xl font-bold text-foreground sm:text-4xl">
                {t("social.title")}
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-foreground/60">
                {t("social.subtitle")}
              </p>
            </ScrollReveal>

            <ScrollReveal delay={150}>
              <SocialActivityStrip />
            </ScrollReveal>

            <ScrollReveal delay={300}>
              <div className="mx-auto mt-10 max-w-2xl">
                <p className="text-center text-xs font-bold uppercase tracking-wide text-gold-600">
                  {t("social.followTitle")}
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {SOCIAL_LINKS.map(({ key, href, path }) => (
                    <a
                      key={key}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-emerald-300"
                    >
                      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                        <svg viewBox="0 0 24 24" fill="none" className="h-4.5 w-4.5">
                          <path d={path} fill="currentColor" />
                        </svg>
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-foreground">
                          {t(`social.platforms.${key}`)}
                        </span>
                        <span className="block text-xs text-foreground/50">{t("social.followCta")}</span>
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            </ScrollReveal>
          </div>
        </section>

        {/* Testimonials */}
        <section className="border-t border-border bg-surface py-20">
          <div className="mx-auto max-w-6xl px-6">
            <ScrollReveal>
              <h2 className="text-center text-3xl font-bold text-foreground sm:text-4xl">
                {t("testimonials.title")}
              </h2>
            </ScrollReveal>
            <ScrollReveal delay={80}>
              <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-foreground/60">
                {t("testimonials.subtitle")}
              </p>
            </ScrollReveal>
            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {testimonials.map((item, i) => (
                <ScrollReveal key={i} delay={(i % 3) * 120}>
                  <Card className="flex h-full flex-col">
                    <Quote className="text-gold-400" size={22} />
                    <p className="mt-3 flex-1 text-sm leading-relaxed text-foreground/80">
                      &ldquo;{item.quote}&rdquo;
                    </p>
                    <div className="mt-5 flex items-center gap-3">
                      <div
                        className={`flex h-9 w-9 flex-none items-center justify-center rounded-full text-xs font-bold ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}
                      >
                        {item.role.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{item.role}</p>
                        <p className="truncate text-xs text-foreground/50">{item.location}</p>
                      </div>
                    </div>
                  </Card>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA — a flat solid banner, no gradient/orbs/skyline. */}
        <section className="bg-emerald-600 py-16 text-center text-white sm:py-20">
          <div className="mx-auto max-w-2xl px-6">
            <ScrollReveal direction="none">
              <h2 className="text-3xl font-bold sm:text-4xl">{t("finalCta.title")}</h2>
            </ScrollReveal>
            <ScrollReveal delay={150}>
              <p className="mt-4 text-emerald-50/90">{t("finalCta.subtitle")}</p>
            </ScrollReveal>
            <ScrollReveal delay={300}>
              <AuthAwareCta
                loggedOutHref="/signup"
                loggedOutLabel={t("finalCta.button")}
                loggedInLabel={t("goToDashboard")}
                className="mt-8 inline-block rounded-full bg-white px-8 py-3 text-base font-semibold text-emerald-700 transition-colors hover:bg-emerald-50"
              />
            </ScrollReveal>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
