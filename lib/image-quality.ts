/**
 * Browser-side image preparation and quality check. Runs BEFORE anything is sent to the server,
 * so unusable photos get instant feedback and no AI quota is wasted.
 * The blur/brightness thresholds are practical starting values and can be tuned (see constants).
 */
export const QUALITY = { minSide: 600, blurWarn: 40, blurBlock: 8, darkWarn: 45, darkBlock: 20, brightWarn: 238, maxSide: 1600, jpegQuality: 0.82, maxInputBytes: 15 * 1024 * 1024 };
export const UNREADABLE_MESSAGE = "The label is difficult to read. Try taking a closer photo in better lighting.";

/** Variance of the Laplacian: low = few sharp edges = blurry. gray is row-major, 0..255. */
export function laplacianVariance(gray: ArrayLike<number>, w: number, h: number): number {
  if (w < 3 || h < 3) return 0;
  let sum = 0, sumSq = 0, n = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const v = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
    sum += v; sumSq += v * v; n++;
  }
  const mean = sum / n; return sumSq / n - mean * mean;
}
export const meanBrightness = (gray: ArrayLike<number>): number => { let s = 0; for (let i = 0; i < gray.length; i++) s += gray[i]; return gray.length ? s / gray.length : 0; };

export interface QualityReport { level: "ok" | "warn" | "block"; issues: string[]; blur: number; brightness: number }
export function assessQuality(m: { blur: number; brightness: number; width: number; height: number }): QualityReport {
  const issues: string[] = []; let level: QualityReport["level"] = "ok";
  const bump = (l: "warn" | "block") => { if (l === "block" || level === "ok") level = l; };
  if (Math.min(m.width, m.height) < QUALITY.minSide) { issues.push("The photo is small. Move closer so the label fills the frame."); bump("warn"); }
  if (m.brightness < QUALITY.darkBlock) { issues.push("The photo is almost black."); bump("block"); } else if (m.brightness < QUALITY.darkWarn) { issues.push("The photo is dark. Use better lighting."); bump("warn"); }
  if (m.brightness > QUALITY.brightWarn) { issues.push("The photo is overexposed. Reduce glare."); bump("warn"); }
  if (m.blur < QUALITY.blurBlock) { issues.push("The photo is too blurry to read."); bump("block"); } else if (m.blur < QUALITY.blurWarn) { issues.push("The photo looks blurry. Hold steady and tap to focus."); bump("warn"); }
  if (level !== "ok") issues.push(UNREADABLE_MESSAGE);
  return { level, issues, blur: Math.round(m.blur), brightness: Math.round(m.brightness) };
}

export interface PreparedImage { blob: Blob; base64: string; width: number; height: number; previewUrl: string; quality: QualityReport }

/** Browser only: validate type/size, fix orientation (EXIF), resize to max 1600 px, re-encode as JPEG, measure quality. */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) throw new Error("Please choose a JPG, PNG or WebP photo.");
  if (file.size > QUALITY.maxInputBytes) throw new Error("That photo is larger than 15 MB. Choose a smaller one.");
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => { throw new Error("This photo could not be opened. Try a JPG or PNG."); });
  const scale = Math.min(1, QUALITY.maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  // measure on a 400 px wide grayscale copy (fast and comparable between phones)
  const sw = Math.min(400, w), sh = Math.round((h / w) * sw);
  const small = document.createElement("canvas"); small.width = sw; small.height = sh;
  const sctx = small.getContext("2d")!; sctx.drawImage(canvas, 0, 0, sw, sh);
  const px = sctx.getImageData(0, 0, sw, sh).data; const gray = new Uint8ClampedArray(sw * sh);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) gray[j] = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
  const quality = assessQuality({ blur: laplacianVariance(gray, sw, sh), brightness: meanBrightness(gray), width: bmp.width, height: bmp.height });
  const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Could not process the photo."))), "image/jpeg", QUALITY.jpegQuality));
  const base64 = await new Promise<string>((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1]); fr.readAsDataURL(blob); });
  return { blob, base64, width: w, height: h, previewUrl: URL.createObjectURL(blob), quality };
}
