import type { MetadataRoute } from "next";

const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://gulfjobcopilot.com").replace(/\/$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // The dashboard is behind auth and shows nothing useful to a crawler
      // (or to a logged-out visitor); API routes aren't pages at all.
      disallow: ["/en/dashboard", "/ar/dashboard", "/api/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
