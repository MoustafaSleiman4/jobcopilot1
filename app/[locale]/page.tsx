import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import DuneDivider from "@/components/decorative/DuneDivider";
import SkylineSilhouette from "@/components/decorative/SkylineSilhouette";
import {
  FileText,
  Search,
  MousePointerClick,
  KanbanSquare,
  MessageCircleMore,
  Languages,
} from "lucide-react";

const featureIcons = {
  resume: FileText,
  search: Search,
  apply: MousePointerClick,
  tracker: KanbanSquare,
  chatbot: MessageCircleMore,
  bilingual: Languages,
} as const;

export default function HomePage() {
  const t = useTranslations("home");

  const featureKeys = Object.keys(featureIcons) as (keyof typeof featureIcons)[];
  const regions = t.raw("regions") as string[];

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1">
        {/* Hero */}
        <section className="desert-gradient relative overflow-hidden">
          <div className="pattern-motif pointer-events-none absolute inset-0" />
          <SkylineSilhouette className="pointer-events-none absolute inset-x-0 bottom-4 h-40 w-full text-emerald-800 sm:h-56" />
          <div className="relative mx-auto max-w-4xl px-6 pb-52 pt-20 text-center sm:pb-64 sm:pt-28">
            <span className="inline-block rounded-full border border-gold-400/40 bg-gold-50 px-4 py-1.5 text-xs font-semibold text-gold-600">
              {t("badge")}
            </span>
            <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-foreground sm:text-6xl">
              {t("title")}
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-foreground/70">
              {t("subtitle")}
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/signup"
                className="w-full rounded-full bg-emerald-600 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-emerald-600/20 transition-colors hover:bg-emerald-700 sm:w-auto"
              >
                {t("ctaPrimary")}
              </Link>
              <Link
                href="/pricing"
                className="w-full rounded-full border border-border bg-surface px-8 py-3.5 text-base font-semibold text-foreground transition-colors hover:bg-sand-100 sm:w-auto"
              >
                {t("ctaSecondary")}
              </Link>
            </div>
            <p className="mt-8 text-sm text-foreground/50">{t("trustedBy")}</p>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <span className="text-xs font-medium text-foreground/40">{t("regionsLabel")}</span>
              {regions.map((region) => (
                <span
                  key={region}
                  className="rounded-full border border-gold-400/30 bg-surface/70 px-3 py-1 text-xs font-medium text-foreground/70"
                >
                  {region}
                </span>
              ))}
            </div>
          </div>
          <DuneDivider className="relative" backFill="text-gold-200/60" frontFill="text-surface" />
        </section>

        {/* Features */}
        <section className="bg-surface py-20">
          <div className="mx-auto max-w-6xl px-6">
            <h2 className="text-center text-3xl font-bold text-foreground sm:text-4xl">
              {t("features.title")}
            </h2>
            <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {featureKeys.map((key) => {
                const Icon = featureIcons[key];
                return (
                  <div
                    key={key}
                    className="rounded-2xl border border-border bg-background p-7 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                      <Icon className="h-5.5 w-5.5" size={22} />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">
                      {t(`features.${key}.title`)}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-foreground/60">
                      {t(`features.${key}.desc`)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="relative overflow-hidden bg-gradient-to-br from-emerald-600 to-emerald-800 pb-48 pt-20 text-center text-white sm:pb-64">
          <SkylineSilhouette className="pointer-events-none absolute inset-x-0 bottom-4 h-36 w-full text-white sm:h-52" />
          <div className="relative mx-auto max-w-2xl px-6">
            <h2 className="text-3xl font-bold sm:text-4xl">{t("finalCta.title")}</h2>
            <p className="mt-4 text-emerald-50/90">{t("finalCta.subtitle")}</p>
            <Link
              href="/signup"
              className="mt-8 inline-block rounded-full bg-gold-400 px-8 py-3.5 text-base font-semibold text-emerald-900 shadow-lg transition-colors hover:bg-gold-500"
            >
              {t("finalCta.button")}
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
