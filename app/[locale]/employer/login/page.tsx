import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import EmployerLoginForm from "@/components/EmployerLoginForm";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo.employerLogin" });
  const path = `/${locale}/employer/login`;

  return {
    title: t("title"),
    description: t("description"),
    alternates: {
      canonical: path,
      languages: {
        en: "/en/employer/login",
        ar: "/ar/employer/login",
        "x-default": "/en/employer/login",
      },
    },
    openGraph: { url: path },
  };
}

export default function EmployerLoginPage() {
  return <EmployerLoginForm />;
}
