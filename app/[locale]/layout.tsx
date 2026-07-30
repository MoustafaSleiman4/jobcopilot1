import type { Metadata } from "next";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages } from "next-intl/server";
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

export const metadata: Metadata = {
  title: "JobCopilot — Your AI copilot for the Gulf job market",
  description:
    "Build your resume, get matched to real jobs across the Gulf and beyond, and apply in one click — in Arabic or English.",
};

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
