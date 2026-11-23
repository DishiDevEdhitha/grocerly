"use client";
import type { OcrLine } from "./nutrition";

/** Resize + grayscale + contrast-stretch so Tesseract reads labels better. Runs on the phone. */
async function preprocess(file: File): Promise<HTMLCanvasElement> {
  if (!file.type.startsWith("image/")) throw new Error("That file is not an image.");
  if (file.size > 15 * 1024 * 1024) throw new Error("Image is larger than 15 MB. Choose a smaller photo.");
  const bmp = await createImageBitmap(file).catch(() => { throw new Error("This image could not be opened. Try a JPG or PNG."); });
  const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  const ctx = c.getContext("2d")!; ctx.drawImage(bmp, 0, 0, c.width, c.height);
  const img = ctx.getImageData(0, 0, c.width, c.height); const d = img.data;
  let min = 255, max = 0;
  for (let i = 0; i < d.length; i += 4) { const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; d[i] = d[i + 1] = d[i + 2] = g; if (g < min) min = g; if (g > max) max = g; }
  const range = Math.max(1, max - min);
  for (let i = 0; i < d.length; i += 4) { const v = ((d[i] - min) / range) * 255; d[i] = d[i + 1] = d[i + 2] = v; }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Image -> text lines with per-line confidence (0..1). Tesseract language data downloads on first use. */
export async function runOcr(file: File, onProgress?: (p: number) => void): Promise<OcrLine[]> {
  const canvas = await preprocess(file);
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, { logger: (m: { status: string; progress: number }) => { if (m.status === "recognizing text") onProgress?.(m.progress); } });
  try {
    const { data } = await worker.recognize(canvas);
    return (data.lines ?? []).map((l: { text: string; confidence: number }) => ({ text: l.text.trim(), confidence: Math.max(0, Math.min(1, l.confidence / 100)) })).filter((l: OcrLine) => l.text);
  } finally { await worker.terminate(); }
}
