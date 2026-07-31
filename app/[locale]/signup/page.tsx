import { Suspense } from "react";
import SignupForm from "@/components/SignupForm";

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
