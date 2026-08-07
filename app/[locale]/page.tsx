import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AuthAwareCta from "@/components/AuthAwareCta";
import ScrollReveal from "@/components/ScrollReveal";
import DuneDivider from "@/components/decorative/DuneDivider";
import SkylineSilhouette from "@/components/decorative/SkylineSilhouette";
import {
  FileText,
  Search,
  MousePointerClick,
  KanbanSquare,
  MessageCircleMore,
  Languages,
  Star,
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

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "home" });

  const featureKeys = Object.keys(featureIcons) as (keyof typeof featureIcons)[];
  const stepKeys = Object.keys(stepIcons) as (keyof typeof stepIcons)[];
  const regions = t.raw("regions") as string[];
  const testimonials = t.raw("testimonials.items") as { quote: string; role: string; location: string }[];

  // The badge string ("🏆 #1 Trusted...") comes from i18n as one opaque
  // string — split off the leading trophy emoji so it can get its own
  // gentle wiggle animation (see .trust-badge-trophy in globals.css)
  // independent of the text next to it. Falls back to rendering the whole
  // string plain if a locale ever ships this copy without the emoji.
  const badgeRaw = t("badge");
  const badgeTrophyIdx = badgeRaw.indexOf("🏆");
  const badgeBefore = badgeTrophyIdx === -1 ? badgeRaw : badgeRaw.slice(0, badgeTrophyIdx);
  const badgeTrophy = badgeTrophyIdx === -1 ? null : "🏆";
  const badgeAfter = badgeTrophyIdx === -1 ? "" : badgeRaw.slice(badgeTrophyIdx + 2);

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
        {/* Hero */}
        <section className="desert-gradient relative overflow-hidden">
          <div className="hero-drift pattern-motif pointer-events-none absolute inset-0" />
          <SkylineSilhouette className="pointer-events-none absolute inset-x-0 bottom-4 h-40 w-full text-emerald-800 sm:h-56" />
          <div className="relative mx-auto max-w-4xl px-6 pb-52 pt-20 text-center sm:pb-64 sm:pt-28">
            <ScrollReveal direction="none">
              <span className="trust-badge trust-badge-shine relative inline-flex items-center overflow-hidden rounded-full border-2 border-gold-400/60 bg-gold-50 px-6 py-2.5 text-base font-bold text-gold-700 shadow-sm sm:px-8 sm:py-3.5 sm:text-xl">
                <span className="relative">
                  {badgeBefore}
                  {badgeTrophy && (
                    <span className="trust-badge-trophy inline-block">{badgeTrophy}</span>
                  )}
                  {badgeAfter}
                </span>
              </span>
            </ScrollReveal>
            <ScrollReveal delay={100}>
              <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-foreground sm:text-6xl">
                {t("title")}
              </h1>
            </ScrollReveal>
            <ScrollReveal delay={200}>
              <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-foreground/70">
                {t("subtitle")}
              </p>
            </ScrollReveal>
            <ScrollReveal delay={300}>
              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <AuthAwareCta
                  loggedOutHref="/signup"
                  loggedOutLabel={t("ctaPrimary")}
                  loggedInLabel={t("goToDashboard")}
                  className="w-full rounded-full bg-emerald-600 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-emerald-600/20 transition-all duration-200 hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-xl hover:shadow-emerald-600/30 active:translate-y-0 active:scale-95 sm:w-auto"
                />
                <Link
                  href="/pricing"
                  className="w-full rounded-full border border-border bg-surface px-8 py-3.5 text-base font-semibold text-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-sand-100 hover:shadow-md active:translate-y-0 active:scale-95 sm:w-auto"
                >
                  {t("ctaSecondary")}
                </Link>
              </div>
            </ScrollReveal>
            <ScrollReveal delay={400}>
              <p className="mt-8 text-sm text-foreground/50">{t("trustedBy")}</p>
            </ScrollReveal>

            <ScrollReveal delay={500}>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                <span className="text-xs font-medium text-foreground/40">{t("regionsLabel")}</span>
                {regions.map((region) => (
                  <span
                    key={region}
                    className="rounded-full border border-gold-400/30 bg-surface/70 px-3 py-1 text-xs font-medium text-foreground/70 transition-colors duration-200 hover:border-gold-400/60 hover:bg-gold-50"
                  >
                    {region}
                  </span>
                ))}
              </div>
            </ScrollReveal>
          </div>
          <DuneDivider className="relative" backFill="text-gold-200/60" frontFill="text-surface" />
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
                  <ScrollReveal key={key} delay={i * 120} className="group relative text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3">
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
        <section className="bg-surface py-20">
          <div className="mx-auto max-w-6xl px-6">
            <ScrollReveal>
              <h2 className="text-center text-3xl font-bold text-foreground sm:text-4xl">
                {t("features.title")}
              </h2>
            </ScrollReveal>
            <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {featureKeys.map((key, i) => {
                const Icon = featureIcons[key];
                const isPro = PRO_FEATURE_KEYS.has(key);
                return (
                  <ScrollReveal
                    key={key}
                    delay={(i % 3) * 100}
                    className="group rounded-2xl border border-border bg-background p-7 shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-emerald-200 hover:shadow-xl hover:shadow-emerald-600/5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 transition-transform duration-300 group-hover:scale-110">
                        <Icon className="h-5.5 w-5.5" size={22} />
                      </div>
                      {isPro && (
                        <span className="rounded-full bg-gold-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-gold-700">
                          {t("features.proBadge")}
                        </span>
                      )}
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-foreground">
                      {t(`features.${key}.title`)}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-foreground/60">
                      {t(`features.${key}.desc`)}
                    </p>
                  </ScrollReveal>
                );
              })}
            </div>
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
          </div>
        </section>

        {/* Testimonials */}
        <section className="bg-background py-20">
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
                <ScrollReveal
                  key={i}
                  delay={(i % 3) * 100}
                  className="flex flex-col rounded-2xl border border-border bg-surface p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
                >
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
                    <div className="ms-auto flex flex-none gap-0.5 text-gold-400">
                      {Array.from({ length: 5 }).map((_, si) => (
                        <Star key={si} size={12} fill="currentColor" />
                      ))}
                    </div>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="relative overflow-hidden bg-gradient-to-br from-emerald-600 to-emerald-800 pb-48 pt-20 text-center text-white sm:pb-64">
          <SkylineSilhouette className="pointer-events-none absolute inset-x-0 bottom-4 h-36 w-full text-white sm:h-52" />
          <div className="relative mx-auto max-w-2xl px-6">
            <ScrollReveal>
              <h2 className="text-3xl font-bold sm:text-4xl">{t("finalCta.title")}</h2>
            </ScrollReveal>
            <ScrollReveal delay={100}>
              <p className="mt-4 text-emerald-50/90">{t("finalCta.subtitle")}</p>
            </ScrollReveal>
            <ScrollReveal delay={200}>
              <AuthAwareCta
                loggedOutHref="/signup"
                loggedOutLabel={t("finalCta.button")}
                loggedInLabel={t("goToDashboard")}
                className="mt-8 inline-block rounded-full bg-gold-400 px-8 py-3.5 text-base font-semibold text-emerald-900 shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:bg-gold-500 hover:shadow-xl active:translate-y-0 active:scale-95"
              />
            </ScrollReveal>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
