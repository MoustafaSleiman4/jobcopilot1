import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import LoginForm from "@/components/LoginForm";

// See pricing/page.tsx's generateMetadata comment for why this is needed on
// every public page: without it, this page inherited the homepage's title
// and canonical unchanged.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo.login" });
  const path = `/${locale}/login`;

  return {
    title: t("title"),
    description: t("description"),
    alternates: {
      canonical: path,
      languages: { en: "/en/login", ar: "/ar/login", "x-default": "/en/login" },
    },
    openGraph: { url: path },
  };
}

export default function LoginPage() {
  return <LoginForm />;
}
