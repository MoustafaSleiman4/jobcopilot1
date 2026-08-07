import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import EmployerSignupForm from "@/components/EmployerSignupForm";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo.employerSignup" });
  const path = `/${locale}/employer/signup`;

  return {
    title: t("title"),
    description: t("description"),
    alternates: {
      canonical: path,
      languages: {
        en: "/en/employer/signup",
        ar: "/ar/employer/signup",
        "x-default": "/en/employer/signup",
      },
    },
    openGraph: { url: path },
  };
}

export default function EmployerSignupPage() {
  return <EmployerSignupForm />;
}
