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
 */
export async function downloadResumePdf(structured: StructuredResume, filename = "resume.pdf") {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const marginX = 56;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = 64;

  const config = getFormatConfig(structured.format);
  const plain = config.plain;
  const accentColor: [number, number, number] = plain ? [0, 0, 0] : [30, 110, 80];

  function ensureRoom(next: number) {
    if (y + next > pageHeight - 48) {
      doc.addPage();
      y = 56;
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(structured.fullName || "Resume", marginX, y);
  y += 22;

  if (structured.title) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(80);
    doc.text(structured.title, marginX, y);
    doc.setTextColor(0);
    y += 18;
  }

  const contactLine = [structured.email, structured.phone, structured.location]
    .filter((v): v is string => Boolean(v && v.trim()))
    .join("   •   ");
  if (contactLine) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(100);
    doc.text(contactLine, marginX, y);
    doc.setTextColor(0);
    y += 14;
  }
  if (structured.links) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    const linkColor: [number, number, number] = plain ? [60, 60, 60] : [30, 110, 170];
    doc.setTextColor(...linkColor);
    const wrapped = doc.splitTextToSize(structured.links, pageWidth - marginX * 2);
    for (const l of wrapped) {
      ensureRoom(12);
      doc.text(l, marginX, y);
      y += 12;
    }
    doc.setTextColor(0);
  }
  y += 10;

  function sectionHeading(label: string) {
    ensureRoom(24);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...accentColor);
    doc.text(label.toUpperCase(), marginX, y);
    doc.setTextColor(0);
    y += 16;
    if (plain) {
      // A plain divider line instead of color does the same "this is a
      // section heading" job without relying on color an ATS parser (or a
      // black-and-white printout) might not render distinctly.
      doc.setDrawColor(180);
      doc.line(marginX, y - 12, pageWidth - marginX, y - 12);
    }
  }

  function renderSummary() {
    if (!structured.summary) return;
    sectionHeading("Summary");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    const lines = doc.splitTextToSize(structured.summary, pageWidth - marginX * 2);
    for (const line of lines) {
      ensureRoom(14);
      doc.text(line, marginX, y);
      y += 14;
    }
    y += 8;
  }

  function renderSkills() {
    if (structured.skills.length === 0) return;
    sectionHeading("Skills");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    const line = structured.skills.join("   •   ");
    const wrapped = doc.splitTextToSize(line, pageWidth - marginX * 2);
    for (const l of wrapped) {
      ensureRoom(14);
      doc.text(l, marginX, y);
      y += 14;
    }
    y += 8;
  }

  function renderExperience() {
    if (structured.experience.length === 0) return;
    sectionHeading("Experience");
    for (const job of structured.experience) {
      ensureRoom(16);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      const heading = [job.role, job.company].filter(Boolean).join(" · ");
      doc.text(heading, marginX, y);
      if (job.period) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.text(job.period, pageWidth - marginX, y, { align: "right" });
      }
      y += 13;
      if (job.location) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text(job.location, marginX, y);
        doc.setTextColor(0);
        y += 12;
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      for (const bullet of job.bullets) {
        const wrapped = doc.splitTextToSize(`•  ${bullet}`, pageWidth - marginX * 2 - 8);
        for (const l of wrapped) {
          ensureRoom(13);
          doc.text(l, marginX + 8, y);
          y += 13;
        }
      }
      y += 6;
    }
  }

  function renderEducation() {
    if (structured.education.length === 0) return;
    sectionHeading("Education");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    for (const ed of structured.education) {
      ensureRoom(14);
      const line = [ed.degree, ed.school].filter(Boolean).join(" · ");
      doc.text(line, marginX, y);
      if (ed.period) {
        doc.setFontSize(9);
        doc.text(ed.period, pageWidth - marginX, y, { align: "right" });
        doc.setFontSize(10.5);
      }
      y += 14;
    }
    y += 8;
  }

  function renderCertifications() {
    if (!structured.certifications || structured.certifications.length === 0) return;
    sectionHeading("Certifications");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    for (const c of structured.certifications) {
      ensureRoom(14);
      const line = [c.name, c.issuer].filter(Boolean).join(" · ");
      doc.text(line, marginX, y);
      if (c.year) {
        doc.setFontSize(9);
        doc.text(c.year, pageWidth - marginX, y, { align: "right" });
        doc.setFontSize(10.5);
      }
      y += 14;
    }
    y += 8;
  }

  function renderLanguages() {
    if (!structured.languages || structured.languages.length === 0) return;
    sectionHeading("Languages");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    const line = structured.languages
      .map((l) => (l.level ? `${l.name} (${l.level})` : l.name))
      .join("   •   ");
    const wrapped = doc.splitTextToSize(line, pageWidth - marginX * 2);
    for (const l of wrapped) {
      ensureRoom(14);
      doc.text(l, marginX, y);
      y += 14;
    }
    y += 8;
  }

  // Real grid-drawn table for a custom "table" section — evenly divided
  // column widths, a bold header row, and thin divider lines between rows.
  // This is what actually satisfies "let me add a table" in the exported
  // PDF, not just the on-screen preview.
  function renderCustomSections() {
    const sections = structured.customSections ?? [];
    for (const cs of sections) {
      const rows = cs.rows.filter((r) => r.some((cell) => cell.trim()));
      if (rows.length === 0 && !cs.title.trim()) continue;
      if (cs.title) sectionHeading(cs.title);

      if (cs.type === "table") {
        const hasHeader = cs.columns.some((c) => c.trim());
        const colCount = Math.max(cs.columns.length, ...rows.map((r) => r.length), 1);
        const colWidth = (pageWidth - marginX * 2) / colCount;

        if (hasHeader) {
          ensureRoom(16);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9.5);
          cs.columns.forEach((col, ci) => {
            doc.text(col, marginX + ci * colWidth, y);
          });
          y += 6;
          doc.setDrawColor(150);
          doc.line(marginX, y, pageWidth - marginX, y);
          y += 12;
        }

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        for (const row of rows) {
          // Wrap each cell independently, then advance y by the tallest
          // cell in that row so multi-line content in one column doesn't
          // overlap the next row.
          const wrappedCells = row.map((cell) => doc.splitTextToSize(cell, colWidth - 8));
          const rowLines = Math.max(1, ...wrappedCells.map((w) => w.length));
          ensureRoom(rowLines * 12 + 4);
          wrappedCells.forEach((lines, ci) => {
            lines.forEach((line: string, li: number) => {
              doc.text(line, marginX + ci * colWidth, y + li * 12);
            });
          });
          y += rowLines * 12 + 4;
          doc.setDrawColor(225);
          doc.line(marginX, y - 2, pageWidth - marginX, y - 2);
        }
        y += 8;
      } else {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        for (const row of rows) {
          const wrapped = doc.splitTextToSize(`•  ${row[0] ?? ""}`, pageWidth - marginX * 2 - 8);
          for (const l of wrapped) {
            ensureRoom(13);
            doc.text(l, marginX + 8, y);
            y += 13;
          }
        }
        y += 8;
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
