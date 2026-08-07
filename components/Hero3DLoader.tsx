"use client";

import dynamic from "next/dynamic";

// `ssr: false` is only allowed inside a Client Component boundary — the
// homepage itself (app/[locale]/page.tsx) is a Server Component, so this
// tiny wrapper exists purely to hold that boundary. Hero3D (the actual
// three.js scene) is pulled in as its own chunk and only downloaded/mounted
// once the browser reaches it, never during server rendering or the
// initial hydration pass.
const Hero3D = dynamic(() => import("./Hero3D"), { ssr: false });

export default function Hero3DLoader() {
  return <Hero3D />;
}
