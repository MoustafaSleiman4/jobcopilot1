import { NextRequest, NextResponse } from "next/server";

// pdf-parse/mammoth both need real Node APIs (Buffer, fs internals), so this
// route must run on the Node runtime, not the Edge runtime.
export const runtime = "nodejs";

const MAX_TEXT_CHARS = 20000; // keep the downstream AI call within a sane token budget

/**
 * Extracts plain text from an uploaded resume file (PDF or DOC/DOCX) so it
 * can be sent to the AI rewrite step. This never touches the outside
 * internet — pdf-parse and mammoth both parse the file bytes locally.
 */
export async function POST(request: NextRequest) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data with a 'file' field." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing 'file'." }, { status: 400 });
  }

  const name = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    let text = "";

    if (name.endsWith(".pdf")) {
      const { PDFParse } = await import("pdf-parse");
      // pdf-parse's default DOMCanvasFactory assumes a DOMMatrix global that
      // only exists in real browsers/jsdom. In this Vercel serverless build,
      // pdf-parse and @napi-rs/canvas are marked as serverExternalPackages
      // (see next.config.ts) so pdfjs-dist's bundled worker never gets the
      // chance to set that global up itself, which was crashing every
      // production upload with "ReferenceError: DOMMatrix is not defined"
      // (confirmed via Vercel runtime error logs — this never reproduced in
      // local dev, only in the deployed serverless function). Passing the
      // package's own Node CanvasFactory (backed directly by @napi-rs/canvas,
      // no DOM globals needed) is pdf-parse's documented fix for exactly this
      // Vercel/Next.js deployment error.
      const { CanvasFactory } = await import("pdf-parse/worker");
      const parser = new PDFParse({ data: buffer, CanvasFactory });
      try {
        const result = await parser.getText();
        text = result.text;
      } finally {
        await parser.destroy();
      }
    } else if (name.endsWith(".docx") || name.endsWith(".doc")) {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else {
      return NextResponse.json(
        { error: "Unsupported file type — please upload a PDF or Word (.doc/.docx) file." },
        { status: 400 }
      );
    }

    text = text
      .replace(/\r\n/g, "\n")
      // pdf-parse inserts "-- N of M --" page-break markers between pages —
      // useful for debugging, but they'd otherwise leak into the resume
      // text a user sees and edits.
      .replace(/^--\s*\d+\s*of\s*\d+\s*--$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (!text) {
      return NextResponse.json(
        { error: "No readable text found in that file — it may be a scanned image rather than real text." },
        { status: 422 }
      );
    }

    return NextResponse.json({ text: text.slice(0, MAX_TEXT_CHARS) });
  } catch (err) {
    console.error("[resume/parse] extraction failed:", err);
    return NextResponse.json(
      { error: "Couldn't read that file. Try re-saving it as a standard PDF or DOCX and upload again." },
      { status: 422 }
    );
  }
}
