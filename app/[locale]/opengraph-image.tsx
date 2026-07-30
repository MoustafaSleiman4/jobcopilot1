import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Satori (which ImageResponse renders through) has no built-in Arabic glyph
// support, so without an explicit Arabic-capable font the Arabic OG image
// renders as blank tofu boxes. Two gotchas discovered getting this right:
// 1) once you pass ANY custom `fonts` array to ImageResponse, satori stops
//    falling back to its own built-in font for text in a family it wasn't
//    given — every family/weight actually used in the tree must be loaded.
// 2) @fontsource ships Arabic and Latin glyphs of the same font as SEPARATE
//    per-script files (meant for CSS unicode-range switching in a browser).
//    Registering both under one shared family name didn't work here — only
//    one seemed to "win" — so each script gets its own distinct font-family
//    name instead, applied to exactly the nodes that need it.
async function loadTajawal(script: "arabic" | "latin") {
  const filePath = path.join(
    process.cwd(),
    "node_modules/@fontsource/tajawal/files",
    `tajawal-${script}-700-normal.woff`
  );
  return readFile(filePath);
}

// Generated at request time (cached by Vercel after first hit) so the OG
// card shown when a gulfjobcopilot.com link is shared on WhatsApp/LinkedIn/
// X/Slack matches the page's own locale instead of a single static image.
export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "home" });
  const isAr = locale === "ar";

  const fonts = isAr
    ? [
        { name: "TajawalAr", data: await loadTajawal("arabic"), weight: 700 as const, style: "normal" as const },
        { name: "TajawalLatin", data: await loadTajawal("latin"), weight: 700 as const, style: "normal" as const },
      ]
    : undefined;

  const latinFamily = isAr ? "TajawalLatin" : "sans-serif";
  const bodyFamily = isAr ? "TajawalAr" : "sans-serif";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #064e3b 0%, #065f46 55%, #047857 100%)",
          color: "white",
          direction: isAr ? "rtl" : "ltr",
          textAlign: isAr ? "right" : "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              background: "#d4a94b",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* Burj Khalifa silhouette — same mark as the site logo (Logo.tsx),
                redrawn here since the OG image is rendered through
                satori/ImageResponse rather than sharing that component. */}
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none">
              <path
                d="M7 22L7 17L8.8 17L8.8 13L10.2 13L10.2 9L11.4 9L11.4 5L12 2L12.6 5L12.6 9L13.8 9L13.8 13L15.2 13L15.2 17L17 17L17 22Z"
                fill="#064e3b"
              />
            </svg>
          </div>
          <div
            style={{
              fontSize: 40,
              fontWeight: 700,
              display: "flex",
              direction: "ltr",
              fontFamily: latinFamily,
            }}
          >
            <span>Gulf</span>
            <span style={{ color: "#d4a94b" }}>JobCopilot</span>
          </div>
        </div>
        {/* Deliberately kept to a single line (no maxWidth, a smaller size
            for the longer Arabic string) — satori auto-justifies any text
            that wraps across multiple lines inside a flex box, which reads
            as broken, unevenly-spaced text. Not applying an unwanted
            justify is more reliable than fighting that behavior. */}
        <div
          style={{
            fontSize: isAr ? 40 : 52,
            fontWeight: 700,
            marginTop: 56,
            display: "flex",
            whiteSpace: "nowrap",
            fontFamily: bodyFamily,
          }}
        >
          {t("title")}
        </div>
      </div>
    ),
    { ...size, fonts }
  );
}
