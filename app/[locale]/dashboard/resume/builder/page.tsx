import { Suspense } from "react";
import ResumeBuilderForm from "@/components/ResumeBuilderForm";

export default function ResumeBuilderPage() {
  // ResumeBuilderForm reads the ?id= of the resume version being edited via
  // useSearchParams, which requires a Suspense boundary in the App Router.
  return (
    <Suspense fallback={null}>
      <ResumeBuilderForm />
    </Suspense>
  );
}
