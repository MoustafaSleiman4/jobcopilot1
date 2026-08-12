import type { StructuredResume } from "@/lib/resume-types";
import { getFormatConfig, type SectionKey } from "@/lib/resume-formats";

/**
 * Renders a StructuredResume to a downloadable PDF via jsPDF, client-side
 * (jsPDF works fine in the browser and this avoids needing a server-side
 * PDF renderer). Shared by the resume page and the CV builder so both stay
 * visually consistent and a layout fix only needs to happen once.
 *
 * Section order/styling mirrors ResumePreview.tsx's format-driven logic (see
 * lib/resume-formats.ts) so the PDF a Pro user downloads always matches what
 * they saw in the live preview.
 *
 * Font/size/color: previously this file always hardcoded Helvetica and a
 * fixed accent color no matter what `resume.style` said or what the on-screen
 * preview actually showed — the single biggest reported bug with downloads
 * ("download is changing font and color"). Every choice below is now read
 * from `resume.style` (the same object ResumePreview.tsx reads), and the
 * section-heading color always matches the preview's hardcoded gold-600,
 * which is NOT tied to `accentColor` there either — see the comment on
 * `HEADING_GOLD` below.
 *
 * `photoUrl` (a public Supabase Storage URL, or null/undefined) is passed in
 * separately rather than read off `structured` — a personal photo lives on
 * public.profiles (account-level, shared across every resume version), not
 * inside any one resume's saved content. Callers fetch the profile's
 * avatar_url once and pass it through here and to ResumePreview.tsx, so
 * whichever resume version someone is viewing/downloading always shows the
 * same photo.
 */
// Fetches `photoUrl` and converts it to a data: URL jsPDF's addImage() can
// embed directly. Best-effort: any failure (network, CORS, an
// unreachable/deleted file) just means the PDF renders without a photo
// rather than failing the whole download — a resume download is the one
// flow that must never come back empty-handed.
async function loadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function downloadResumePdf(
  structured: StructuredResume,
  filename = "resume.pdf",
  photoUrl?: string | null
) {
  const { jsPDF } = await import("jspdf");

  // Kicked off before any synchronous jsPDF work below so the network round
  // trip overlaps with it instead of adding to it.
  const photoDataUrlPromise = photoUrl ? loadImageAsDataUrl(photoUrl) : Promise.resolve(null);

  const config = getFormatConfig(structured.format);
  const plain = config.plain;

  const fontFamily = structured.style?.fontFamily ?? (plain ? "serif" : "sans");
  const fontSizeSetting = structured.style?.fontSize ?? "standard";
  const accentSetting = structured.style?.accentColor ?? "emerald";

  // jsPDF's 14 standard PDF fonts don't need embedding and render
  // identically across every PDF viewer — mapped from the preview's
  // font-sans/font-serif/font-mono choice so "same font" is actually true,
  // not just visually similar.
  const fontName = fontFamily === "serif" ? "times" : fontFamily === "mono" ? "courier" : "helvetica";

  // Relative to the preview's 14px "standard" base (see FONT_SIZE_PX in
  // ResumePreview.tsx) — kept as a multiplier applied to every font size and
  // every vertical spacing constant below, so "Large" doesn't just make text
  // bigger while leaving line-spacing untouched (which would make lines
  // overlap) or vice versa.
  const scale = fontSizeSetting === "compact" ? 13 / 14 : fontSizeSetting === "large" ? 16 / 14 : 1;
  const FS = (pt: number) => pt * scale;

  // Section headings in ResumePreview.tsx are always `text-gold-600`
  // (#a97a1e), completely independent of the `accentColor` prop — only the
  // top name/title banner and the skill/language pills vary with
  // accentColor there. Matching that exactly (rather than switching to
  // black for "plain"/ATS formats, which the old version did) is what
  // keeps headings visually identical between preview and PDF.
  const HEADING_GOLD: [number, number, number] = [169, 122, 30];
  const ACCENT_RGB: Record<"emerald" | "gold" | "slate", [number, number, number]> = {
    emerald: [11, 119, 84],
    gold: [169, 122, 30],
    slate: [51, 65, 85],
  };
  const accentColor = ACCENT_RGB[accentSetting];

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const marginX = 56;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = 64;

  function ensureRoom(next: number) {
    if (y + next > pageHeight - 48) {
      doc.addPage();
      y = 56;
    }
  }

  // Top-right headshot, mirroring where ResumePreview.tsx places it relative
  // to the name/title block. Drawn before the header text below so it never
  // ends up on top of anything; the header text itself stays within
  // pageWidth - marginX * 2 - PHOTO_RESERVED, so long names/links wrap
  // before reaching under the photo instead of running behind it.
  const photoDataUrl = await photoDataUrlPromise;
  const PHOTO_SIZE = 64;
  const PHOTO_RESERVED = photoDataUrl ? PHOTO_SIZE + 16 : 0;
  if (photoDataUrl) {
    const match = /^data:image\/(\w+);base64,/.exec(photoDataUrl);
    const imageFormat = (match?.[1] ?? "jpeg").toUpperCase();
    try {
      doc.addImage(photoDataUrl, imageFormat, pageWidth - marginX - PHOTO_SIZE, 40, PHOTO_SIZE, PHOTO_SIZE, undefined, "FAST");
    } catch {
      // Malformed/unsupported image data — skip it, the rest of the PDF
      // still renders fine without a photo.
    }
  }

  doc.setFont(fontName, "bold");
  doc.setFontSize(FS(20));
  doc.text(structured.fullName || "Resume", marginX, y);
  y += FS(22);

  if (structured.title) {
    doc.setFont(fontName, "normal");
    doc.setFontSize(FS(12));
    doc.setTextColor(80);
    doc.text(structured.title, marginX, y);
    doc.setTextColor(0);
    y += FS(18);
  }

  const contactLine = [structured.email, structured.phone, structured.location]
    .filter((v): v is string => Boolean(v && v.trim()))
    .join("   •   ");
  if (contactLine) {
    doc.setFont(fontName, "normal");
    doc.setFontSize(FS(9.5));
    doc.setTextColor(100);
    doc.text(contactLine, marginX, y);
    doc.setTextColor(0);
    y += FS(14);
  }
  if (structured.links) {
    doc.setFont(fontName, "normal");
    doc.setFontSize(FS(9.5));
    const linkColor: [number, number, number] = plain ? [60, 60, 60] : accentColor;
    doc.setTextColor(...linkColor);
    // Reserve room for the photo on lines that could still fall within its
    // vertical band (it ends at y=104) — links normally come after the name/
    // title/contact lines already push y past that, but a resume with no
    // title and no contact details would otherwise wrap links text straight
    // under the photo.
    const linksWidth = pageWidth - marginX * 2 - (y < 104 ? PHOTO_RESERVED : 0);
    const wrapped = doc.splitTextToSize(structured.links, linksWidth);
    for (const l of wrapped) {
      ensureRoom(FS(12));
      doc.text(l, marginX, y);
      y += FS(12);
    }
    doc.setTextColor(0);
  }
  y += FS(6);

  // If the photo extends below wherever the header text ended (a short
  // name/title/contact block next to a 64pt-tall photo), make sure the
  // header rule and first section heading start below it too — otherwise a
  // short header would draw the divider line, and the first section, right
  // through the bottom of the photo.
  if (photoDataUrl) {
    y = Math.max(y, 40 + PHOTO_SIZE + FS(10));
  }

  // A thin rule under the header block echoes the preview's colored top
  // banner in a print-friendly way (a full gradient-filled rect would fight
  // with light/dark printers and plain-format's "print-safe" intent) — in
  // the accent color for normal formats, or plain black for ATS-friendly,
  // matching the preview's border-b-2 border-foreground/80 treatment there.
  const headerRuleColor: [number, number, number] = plain ? [20, 20, 20] : accentColor;
  doc.setDrawColor(...headerRuleColor);
  doc.setLineWidth(plain ? 1.2 : 1.5);
  doc.line(marginX, y, pageWidth - marginX, y);
  doc.setLineWidth(1);
  y += FS(14);

  function sectionHeading(label: string) {
    ensureRoom(FS(24));
    doc.setFont(fontName, "bold");
    doc.setFontSize(FS(11));
    doc.setTextColor(...HEADING_GOLD);
    doc.text(label.toUpperCase(), marginX, y);
    doc.setTextColor(0);
    y += FS(16);
    if (plain) {
      // A plain divider line instead of color does the same "this is a
      // section heading" job without relying on color an ATS parser (or a
      // black-and-white printout) might not render distinctly.
      doc.setDrawColor(180);
      doc.line(marginX, y - FS(12), pageWidth - marginX, y - FS(12));
    }
  }

  function renderSummary() {
    if (!structured.summary) return;
    sectionHeading("Summary");
    doc.setFont(fontName, "normal");
    doc.setFontSize(FS(10.5));
    const lines = doc.splitTextToSize(structured.summary, pageWidth - marginX * 2);
    for (const line of lines) {
      ensureRoom(FS(14));
      doc.text(line, marginX, y);
      y += FS(14);
    }
    y += FS(8);
  }

  function renderSkills() {
    if (structured.skills.length === 0) return;
    sectionHeading("Skills");
    doc.setFont(fontName, "normal");
    doc.setFontSize(FS(10.5));
    const line = structured.skills.join("   •   ");
    const wrapped = doc.splitTextToSize(line, pageWidth - marginX * 2);
    for (const l of wrapped) {
      ensureRoom(FS(14));
      doc.text(l, marginX, y);
      y += FS(14);
    }
    y += FS(8);
  }

  function renderExperience() {
    if (structured.experience.length === 0) return;
    sectionHeading("Experience");
    for (const job of structured.experience) {
      ensureRoom(FS(16));
      doc.setFont(fontName, "bold");
      doc.setFontSize(FS(10.5));
      const heading = [job.role, job.company].filter(Boolean).join(" · ");
      doc.text(heading, marginX, y);
      if (job.period) {
        doc.setFont(fontName, "normal");
        doc.setFontSize(FS(9));
        doc.text(job.period, pageWidth - marginX, y, { align: "right" });
      }
      y += FS(13);
      if (job.location) {
        doc.setFont(fontName, "normal");
        doc.setFontSize(FS(9));
        doc.setTextColor(100);
        doc.text(job.location, marginX, y);
        doc.setTextColor(0);
        y += FS(12);
      }
      doc.setFont(fontName, "normal");
      doc.setFontSize(FS(10));
      for (const bullet of job.bullets) {
        const wrapped = doc.splitTextToSize(`•  ${bullet}`, pageWidth - marginX * 2 - 8);
        for (const l of wrapped) {
          ensureRoom(FS(13));
          doc.text(l, marginX + 8, y);
          y += FS(13);
        }
      }
      y += FS(6);
    }
  }

  function renderEducation() {
    if (structured.education.length === 0) return;
    sectionHeading("Education");
    doc.setFont(fontName, "normal");
    doc.setFontSize(FS(10.5));
    for (const ed of structured.education) {
      ensureRoom(FS(14));
      const line = [ed.degree, ed.school].filter(Boolean).join(" · ");
      doc.text(line, marginX, y);
      if (ed.period) {
        doc.setFontSize(FS(9));
        doc.text(ed.period, pageWidth - marginX, y, { align: "right" });
        doc.setFontSize(FS(10.5));
      }
      y += FS(14);
    }
    y += FS(8);
  }

  function renderCertifications() {
    if (!structured.certifications || structured.certifications.length === 0) return;
    sectionHeading("Certifications");
    doc.setFont(fontName, "normal");
    doc.setFontSize(FS(10.5));
    for (const c of structured.certifications) {
      ensureRoom(FS(14));
      const line = [c.name, c.issuer].filter(Boolean).join(" · ");
      doc.text(line, marginX, y);
      if (c.year) {
        doc.setFontSize(FS(9));
        doc.text(c.year, pageWidth - marginX, y, { align: "right" });
        doc.setFontSize(FS(10.5));
      }
      y += FS(14);
    }
    y += FS(8);
  }

  function renderLanguages() {
    if (!structured.languages || structured.languages.length === 0) return;
    sectionHeading("Languages");
    doc.setFont(fontName, "normal");
    doc.setFontSize(FS(10.5));
    const line = structured.languages
      .map((l) => (l.level ? `${l.name} (${l.level})` : l.name))
      .join("   •   ");
    const wrapped = doc.splitTextToSize(line, pageWidth - marginX * 2);
    for (const l of wrapped) {
      ensureRoom(FS(14));
      doc.text(l, marginX, y);
      y += FS(14);
    }
    y += FS(8);
  }

  // Real grid-drawn table for a custom "table" section — evenly divided
  // column widths, a bold header row, and thin divider lines between rows.
  // This is what actually satisfies "let me add a table" in the exported
  // PDF, not just the on-screen preview.
  //
  // Row spacing fix: the previous version computed each divider line's y
  // from the SAME cursor advance used for the next row's first text
  // baseline, leaving only ~2pt between a row's divider line and the next
  // row's text — since jsPDF draws text from its baseline (not its top),
  // that 2pt gap put the line through the middle of the next row's glyphs
  // instead of cleanly between rows (the reported "text is on table
  // lines" bug). Now the divider line's position and the next row's start
  // position are computed as two clearly separate offsets from the current
  // row's own text block, with an explicit gap between them.
  function renderCustomSections() {
    const sections = structured.customSections ?? [];
    const lineHeight = FS(12);
    const rowToLineGap = FS(6); // last text baseline -> divider line
    const lineToNextGap = FS(9); // divider line -> next row's first baseline

    for (const cs of sections) {
      const rows = cs.rows.filter((r) => r.some((cell) => cell.trim()));
      if (rows.length === 0 && !cs.title.trim()) continue;
      if (cs.title) sectionHeading(cs.title);

      if (cs.type === "table") {
        const hasHeader = cs.columns.some((c) => c.trim());
        const colCount = Math.max(cs.columns.length, ...rows.map((r) => r.length), 1);
        const colWidth = (pageWidth - marginX * 2) / colCount;

        if (hasHeader) {
          ensureRoom(lineHeight + rowToLineGap + lineToNextGap);
          doc.setFont(fontName, "bold");
          doc.setFontSize(FS(9.5));
          cs.columns.forEach((col, ci) => {
            doc.text(col, marginX + ci * colWidth, y);
          });
          const headerLineY = y + rowToLineGap;
          doc.setDrawColor(150);
          doc.line(marginX, headerLineY, pageWidth - marginX, headerLineY);
          y = headerLineY + lineToNextGap;
        }

        doc.setFont(fontName, "normal");
        doc.setFontSize(FS(9.5));
        for (const row of rows) {
          // Wrap each cell independently, then advance y by the tallest
          // cell in that row so multi-line content in one column doesn't
          // overlap the next row.
          const wrappedCells = row.map((cell) => doc.splitTextToSize(cell, colWidth - 8));
          const rowLines = Math.max(1, ...wrappedCells.map((w) => w.length));
          const blockHeight = (rowLines - 1) * lineHeight + rowToLineGap + lineToNextGap;
          ensureRoom(blockHeight);
          wrappedCells.forEach((lines, ci) => {
            lines.forEach((line: string, li: number) => {
              doc.text(line, marginX + ci * colWidth, y + li * lineHeight);
            });
          });
          const rowLineY = y + (rowLines - 1) * lineHeight + rowToLineGap;
          doc.setDrawColor(225);
          doc.line(marginX, rowLineY, pageWidth - marginX, rowLineY);
          y = rowLineY + lineToNextGap;
        }
        y += FS(4);
      } else {
        doc.setFont(fontName, "normal");
        doc.setFontSize(FS(10));
        for (const row of rows) {
          const wrapped = doc.splitTextToSize(`•  ${row[0] ?? ""}`, pageWidth - marginX * 2 - 8);
          for (const l of wrapped) {
            ensureRoom(FS(13));
            doc.text(l, marginX + 8, y);
            y += FS(13);
          }
        }
        y += FS(8);
      }
    }
  }

  const renderers: Record<SectionKey, () => void> = {
    summary: renderSummary,
    skills: renderSkills,
    experience: renderExperience,
    education: renderEducation,
    certifications: renderCertifications,
    languages: renderLanguages,
    custom: renderCustomSections,
  };

  for (const key of config.order) {
    renderers[key]();
  }

  doc.save(filename);
}
