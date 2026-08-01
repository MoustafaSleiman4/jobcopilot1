import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import ResetPasswordForm from "@/components/ResetPasswordForm";

// Deliberately noindex — see forgot-password/page.tsx's comment. This page
// is also only ever reached via a one-time emailed recovery link (?code=),
// so it has zero standalone search value.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo.resetPassword" });

  return {
    title: t("title"),
    robots: { index: false, follow: false },
  };
}

export default function ResetPasswordPage() {
  // ResetPasswordForm reads the recovery link's ?code= via useSearchParams,
  // which requires a Suspense boundary in the App Router.
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
