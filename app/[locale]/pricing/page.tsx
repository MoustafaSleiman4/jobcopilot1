import { useTranslations } from "next-intl";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PricingCards from "@/components/PricingCards";

export default function PricingPage() {
  const t = useTranslations("pricing");

  return (
    <div className="flex min-h-screen flex-col">
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
