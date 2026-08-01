import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import SignupForm from "@/components/SignupForm";

// See pricing/page.tsx's generateMetadata comment — same fix, applied here
// so the signup page (a page worth ranking for "GulfJobCopilot sign up" /
// "create account" searches) gets its own title/description/canonical
// instead of inheriting the homepage's.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo.signup" });
  const path = `/${locale}/signup`;

  return {
    title: t("title"),
    description: t("description"),
    alternates: {
      canonical: path,
      languages: { en: "/en/signup", ar: "/ar/signup", "x-default": "/en/signup" },
    },
    openGraph: { url: path },
  };
}

export default function SignupPage() {
  // SignupForm reads the optional ?plan= param (set when arriving from the
  // pricing page's Pro CTA) via useSearchParams, which requires a Suspense
  // boundary in the App Router.
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}
