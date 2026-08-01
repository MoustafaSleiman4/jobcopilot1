import type { Metadata } from "next";
import { useLocale, useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PricingCards from "@/components/PricingCards";

// Without this, the page silently inherited the root layout's homepage
// title/description/canonical unchanged — every public page showed the same
// "Your AI copilot for landing the next job" title in search results, and
// worse, the layout's canonical (hardcoded to `/${locale}`, the homepage)
// told Google this page's canonical URL was the homepage, not itself. That's
// a textbook "duplicate content, Google chose a different canonical" signal
// that can keep a page out of the index entirely — fixed here and on every
// other public page (login/signup/forgot-password/reset-password) by giving
// each one its own title, description, canonical and OG url.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo.pricing" });
  const path = `/${locale}/pricing`;

  return {
    title: t("title"),
    description: t("description"),
    alternates: {
      canonical: path,
      languages: { en: "/en/pricing", ar: "/ar/pricing", "x-default": "/en/pricing" },
    },
    openGraph: { url: path },
  };
}

const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://gulfjobcopilot.com").replace(/\/$/, "");

export default function PricingPage() {
  const t = useTranslations("pricing");
  const locale = useLocale();

  // Offer-level structured data (separate from the homepage's
  // SoftwareApplication card) so a pricing-intent search ("gulfjobcopilot
  // price", "gulfjobcopilot cost") has a chance at a rich result showing the
  // actual $0/$9.99/$99.90 tiers instead of just a plain link.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "GulfJobCopilot",
    url: `${SITE_URL}/${locale}/pricing`,
    description: t("subtitle"),
    brand: { "@type": "Brand", name: "GulfJobCopilot" },
    offers: [
      { "@type": "Offer", name: t("free.name"), price: "0", priceCurrency: "USD" },
      { "@type": "Offer", name: `${t("pro.name")} monthly`, price: "9.99", priceCurrency: "USD" },
      { "@type": "Offer", name: `${t("pro.name")} yearly`, price: "99.90", priceCurrency: "USD" },
    ],
  };

  return (
    <div className="flex min-h-screen flex-col">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Navbar />
      <main className="flex-1 py-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h1 className="text-4xl font-extrabold text-foreground">{t("title")}</h1>
          <p className="mt-3 text-foreground/60">{t("subtitle")}</p>
        </div>
        <div className="mt-14 px-6">
          <PricingCards />
        </div>
      </main>
      <Footer />
    </div>
  );
}
