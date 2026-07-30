import type { StructuredResume } from "@/lib/resume-types";

/**
 * Renders a StructuredResume to a downloadable PDF via jsPDF, client-side
 * (jsPDF works fine in the browser and this avoids needing a server-side
 * PDF renderer). Shared by the resume page and the CV builder so both stay
 * visually consistent and a layout fix only needs to happen once.
 */
export async function downloadResumePdf(structured: StructuredResume, filename = "resume.pdf") {
  const { jsPDF } = await import("jspdf");
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
    doc.setTextColor(30, 110, 170);
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
    doc.setTextColor(30, 110, 80);
    doc.text(label.toUpperCase(), marginX, y);
    doc.setTextColor(0);
    y += 16;
  }

  if (structured.summary) {
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

  if (structured.skills.length > 0) {
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

  if (structured.experience.length > 0) {
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

  if (structured.education.length > 0) {
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

  if (structured.certifications && structured.certifications.length > 0) {
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

  if (structured.languages && structured.languages.length > 0) {
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
  }

  doc.save(filename);
}
