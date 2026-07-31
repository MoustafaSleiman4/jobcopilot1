/**
 * Small shared helper for downloading a simple text-based PDF (a cover
 * letter, a reports summary) client-side via jsPDF — the same library
 * lib/resume-pdf.ts already uses for the richer resume layout. Kept
 * separate from resume-pdf.ts because this one is deliberately generic
 * (title + paragraphs), not resume-shaped.
 */
export async function downloadTextPdf(
  title: string,
  paragraphs: string[],
  filename: string
) {
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

  if (title) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    const wrapped = doc.splitTextToSize(title, pageWidth - marginX * 2);
    for (const l of wrapped) {
      ensureRoom(20);
      doc.text(l, marginX, y);
      y += 20;
    }
    y += 6;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  for (const paragraph of paragraphs) {
    if (paragraph === "") {
      y += 10;
      continue;
    }
    const wrapped = doc.splitTextToSize(paragraph, pageWidth - marginX * 2);
    for (const line of wrapped) {
      ensureRoom(15);
      doc.text(line, marginX, y);
      y += 15;
    }
  }

  doc.save(filename);
}
