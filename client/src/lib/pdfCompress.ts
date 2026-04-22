/**
 * Client-side PDF compression.
 *
 * Renders every page of the input PDF to a low-DPI JPEG using pdfjs-dist
 * and reassembles those JPEGs into a new PDF with pdf-lib. Typical size
 * reduction: 10×–25× for scanned invoices. The output keeps the visual
 * look of the original (but the text is no longer selectable — that's
 * the trade-off for "lowest resolution possible" storage).
 *
 * Quality knobs live in the DEFAULTS constant. 96 DPI is roughly what
 * iOS Mail previews use, which is plenty for reading an invoice on
 * screen. JPEG quality 0.6 is the sweet spot between legibility and
 * file size for text-heavy scans.
 */

import * as pdfjsLib from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";
import { PDFDocument } from "pdf-lib";

// Vite URL import → correctly-hashed worker URL for production builds
pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc as unknown as string;

export type CompressOptions = {
  /** Target DPI for rasterization. 72 = screen-standard, 96 = slightly sharper. */
  dpi?: number;
  /** JPEG quality 0–1. 0.6 is legible; 0.5 is aggressive. */
  quality?: number;
  /** Cap any single page's longest edge. Prevents huge scans from exploding memory. */
  maxDimension?: number;
};

const DEFAULTS = {
  dpi: 96,
  quality: 0.6,
  maxDimension: 1800,
} satisfies Required<CompressOptions>;

/**
 * Shrink a PDF File client-side. If anything goes wrong — e.g. the PDF
 * is encrypted, or pdf.js can't parse it — we return the original file
 * and log a warning so the upload still succeeds uncompressed.
 */
export async function compressPdfClientSide(
  file: File,
  opts: CompressOptions = {},
): Promise<{ file: File; originalSize: number; compressedSize: number; compressed: boolean }> {
  const cfg = { ...DEFAULTS, ...opts };
  const originalSize = file.size;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjsLib.getDocument({ data: bytes }).promise;

    const outPdf = await PDFDocument.create();

    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      // pdf.js viewports are in PDF points (1 pt = 1/72 inch). Convert the
      // user's target DPI to a viewport scale factor.
      let scale = cfg.dpi / 72;
      let viewport = page.getViewport({ scale });
      const longest = Math.max(viewport.width, viewport.height);
      if (longest > cfg.maxDimension) {
        // Re-scale down so the page fits inside maxDimension.
        scale *= cfg.maxDimension / longest;
        viewport = page.getViewport({ scale });
      }

      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas 2D context unavailable");

      // White background — Chrome treats JPEG background as black otherwise
      // which makes alpha-channel PDFs look terrible.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: ctx, viewport, canvas }).promise;

      const jpegBlob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
          "image/jpeg",
          cfg.quality,
        );
      });
      const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());

      const embedded = await outPdf.embedJpg(jpegBytes);
      const newPage = outPdf.addPage([viewport.width, viewport.height]);
      newPage.drawImage(embedded, {
        x: 0,
        y: 0,
        width: viewport.width,
        height: viewport.height,
      });
    }

    const compressedBytes = await outPdf.save({ useObjectStreams: true });
    // Only accept the compressed version if it's actually smaller —
    // short text-only PDFs sometimes get bigger after rasterization.
    if (compressedBytes.byteLength >= originalSize) {
      return { file, originalSize, compressedSize: originalSize, compressed: false };
    }
    const newName = file.name.replace(/\.pdf$/i, "") + "-compressed.pdf";
    const compressedFile = new File([compressedBytes as BlobPart], newName, {
      type: "application/pdf",
    });
    return {
      file: compressedFile,
      originalSize,
      compressedSize: compressedBytes.byteLength,
      compressed: true,
    };
  } catch (err) {
    console.warn("[pdfCompress] failed, uploading original:", err);
    return { file, originalSize, compressedSize: originalSize, compressed: false };
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
