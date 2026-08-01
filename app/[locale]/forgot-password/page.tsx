import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import ForgotPasswordForm from "@/components/ForgotPasswordForm";

// Deliberately noindex — this is a pure password-recovery utility page with
// no unique content to rank for, and letting it sit in the index alongside
// pricing/login/signup only dilutes crawl budget and risks a "thin content"
// signal. Still gets its own title (for the browser tab / any accidental
// social share of the link) via the seo.forgotPassword namespace.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo.forgotPassword" });

  return {
    title: t("title"),
    robots: { index: false, follow: false },
  };
}

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
