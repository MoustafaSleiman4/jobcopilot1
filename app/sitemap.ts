import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";

const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://gulfjobcopilot.com").replace(/\/$/, "");

// Only public, indexable routes — the dashboard is auth-gated and has
// nothing for a crawler to index, so it's deliberately left out (also
// excluded via robots.ts).
const PUBLIC_PATHS = ["", "/pricing", "/login", "/signup"];

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.flatMap((path) =>
    routing.locales.map((locale) => ({
      url: `${SITE_URL}/${locale}${path}`,
      lastModified: new Date(),
      changeFrequency: path === "" ? ("weekly" as const) : ("monthly" as const),
      priority: path === "" ? 1 : 0.7,
      alternates: {
        languages: Object.fromEntries(
          routing.locales.map((l) => [l, `${SITE_URL}/${l}${path}`])
        ),
      },
    }))
  );
}
