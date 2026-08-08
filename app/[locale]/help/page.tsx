import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import HelpCenter from "@/components/HelpCenter";

// Same per-page metadata pattern as pricing/login/signup — without this the
// page would silently inherit the homepage's title/description/canonical
// (see the comment on pricing/page.tsx's generateMetadata for the full
// "duplicate content, wrong canonical" story this avoids).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo.help" });
  const path = `/${locale}/help`;

  return {
    title: t("title"),
    description: t("description"),
    alternates: {
      canonical: path,
      languages: { en: "/en/help", ar: "/ar/help", "x-default": "/en/help" },
    },
    openGraph: { url: path },
  };
}

export default function HelpPage() {
  const t = useTranslations("help");

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1 py-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-700">
            {t("eyebrow")}
          </span>
          <h1 className="mt-4 text-4xl font-extrabold text-foreground">{t("title")}</h1>
          <p className="mt-3 text-foreground/60">{t("subtitle")}</p>
        </div>
        <div className="mx-auto mt-12 max-w-4xl px-6">
          <HelpCenter />
        </div>
      </main>
      <Footer />
    </div>
  );
}
