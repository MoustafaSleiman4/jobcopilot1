"use client";

import dynamic from "next/dynamic";

// `ssr: false` is only allowed inside a Client Component boundary — the
// homepage itself (app/[locale]/page.tsx) is a Server Component, so this
// tiny wrapper exists purely to hold that boundary. Hero3D (the actual
// three.js scene) is pulled in as its own chunk and only downloaded/mounted
// once the browser reaches it, never during server rendering or the
// initial hydration pass.
const Hero3D = dynamic(() => import("./Hero3D"), { ssr: false });

// Passed straight through to Hero3D — omit for the combined two-tower
// scene, or pass "faisaliah"/"burj" for a single-tower widget. See Hero3D's
// own doc comment for why the homepage now uses two single-tower instances
// flanking the headline instead of one wide combined scene.
export default function Hero3DLoader({ tower }: { tower?: "faisaliah" | "burj" } = {}) {
  return <Hero3D tower={tower} />;
}
