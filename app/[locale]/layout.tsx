import type { Metadata } from "next";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
// Self-hosted fonts (no runtime fetch to Google Fonts required).
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";
import "@fontsource/tajawal/400.css";
import "@fontsource/tajawal/500.css";
import "@fontsource/tajawal/700.css";
import "@fontsource/tajawal/800.css";
import "../globals.css";

const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://gulfjobcopilot.com").replace(/\/$/, "");

// Locale-aware metadata (title/description are localized, and each locale
// gets a canonical URL plus hreflang alternates pointing at the other one)
// instead of one static object shared by both /en and /ar — search engines
// otherwise have no way to know the Arabic and English pages are the same
// content in two languages, and Arabic search results would show English
// titles/descriptions.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "home" });

  const title = `GulfJobCopilot — ${t("title")}`;
  const description = t("subtitle");
  const path = `/${locale}`;

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: title,
      template: `%s | GulfJobCopilot`,
    },
    description,
    applicationName: "GulfJobCopilot",
    keywords: [
      "jobs in Saudi Arabia",
      "jobs in UAE",
      "jobs in Dubai",
      "jobs in Lebanon",
      "Gulf jobs",
      "Middle East job search",
      "AI resume builder",
      "resume enhancer",
      "job search Beirut",
      "وظائف الخليج",
      "وظائف لبنان",
      "السيرة الذاتية",
    ],
    alternates: {
      canonical: path,
      languages: {
        en: "/en",
        ar: "/ar",
        "x-default": "/en",
      },
    },
    openGraph: {
      title,
      description,
      url: path,
      siteName: "GulfJobCopilot",
      locale: locale === "ar" ? "ar_AR" : "en_US",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true },
    },
    icons: {
      icon: "/favicon.ico",
    },
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// Render every route dynamically rather than attempting static prerendering.
// (Turbopack's static-generation pass for this Next.js/next-intl combo has a
// build-time bug resolving the next-intl request config on some routes —
// forcing dynamic rendering here sidesteps it. Fine for an MVP; revisit once
// the upstream issue is fixed if static rendering/ISR is wanted for the
// marketing pages.)
export const dynamic = "force-dynamic";

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const messages = await getMessages();
  const dir = locale === "ar" ? "rtl" : "ltr";

  return (
    <html lang={locale} dir={dir}>
      <body className="antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
