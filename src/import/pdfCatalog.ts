import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import DOMPurify from "dompurify";

export interface CatalogPageImage {
  page: number;
  text: string;
  image: string;
  width: number;
  height: number;
}

let workerReady = false;

function ensureWorker(): void {
  if (workerReady) return;
  GlobalWorkerOptions.workerSrc = workerSrc;
  workerReady = true;
}

function linesFrom(items: Array<{ str: string; transform: number[] }>): string {
  const rows = items.filter((item) => item.str.trim());
  rows.sort((a, b) => {
    const diffY = b.transform[5] - a.transform[5];
    if (Math.abs(diffY) <= 3) return a.transform[4] - b.transform[4];
    return diffY;
  });
  const lines: string[] = [];
  let currentY = Number.POSITIVE_INFINITY;
  let line: string[] = [];
  for (const item of rows) {
    const y = item.transform[5] ?? 0;
    if (Math.abs(y - currentY) > 3) {
      if (line.length) lines.push(line.join(" "));
      line = [item.str.trim()];
      currentY = y;
    } else if (item.str.trim()) {
      line.push(item.str.trim());
    }
  }
  if (line.length) lines.push(line.join(" "));
  return DOMPurify.sanitize(lines.join("\n"));
}

export async function readPdfCatalog(data: ArrayBuffer): Promise<CatalogPageImage[]> {
  ensureWorker();
  const pdf: PDFDocumentProxy = await getDocument({ data: new Uint8Array(data) }).promise;
  const pages: CatalogPageImage[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = linesFrom(content.items.flatMap((item) => ("str" in item && "transform" in item ? [{ str: item.str, transform: item.transform }] : [])));
    const viewport = page.getViewport({ scale: 1.15 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) continue;
    await page.render({ canvas, viewport }).promise;
    pages.push({
      page: pageNumber,
      text,
      image: canvas.toDataURL("image/jpeg", 0.72),
      width: canvas.width,
      height: canvas.height,
    });
  }
  return pages;
}
