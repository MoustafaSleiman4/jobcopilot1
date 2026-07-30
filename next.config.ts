import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  // pdf-parse (used by /api/resume/parse) bundles pdfjs-dist, which loads a
  // separate pdf.worker.mjs file at runtime. Left to Next's bundler, that
  // worker file doesn't get copied into the server output and resume
  // uploads fail with "Setting up fake worker failed". Marking it (and its
  // native canvas dependency) external makes Next require it straight from
  // node_modules at runtime instead of bundling it.
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas"],
};

export default withNextIntl(nextConfig);
