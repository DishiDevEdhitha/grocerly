import type { ImageInput } from "./gemini-label";

/** Server-side upload validation: type (by real file signature, not by name), count and size limits. */
export const MAX_IMAGES = 3;
export const MAX_BYTES_EACH = 2.5 * 1024 * 1024;
export const MAX_TOTAL_BASE64 = 4_000_000; // keeps the whole request under Vercel's ~4.5 MB body limit

export function sniffMime(b: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

export type ImageCheck = { ok: true; images: ImageInput[] } | { ok: false; status: number; code: string; message: string };

export function validateImagePayload(input: unknown): ImageCheck {
  if (!Array.isArray(input) || input.length < 1) return { ok: false, status: 400, code: "no_images", message: "Add at least one photo." };
  if (input.length > MAX_IMAGES) return { ok: false, status: 400, code: "too_many_images", message: `You can send up to ${MAX_IMAGES} photos at once.` };
  let total = 0; const out: ImageInput[] = [];
  for (const im of input as Record<string, unknown>[]) {
    const data = typeof im?.data === "string" ? im.data.replace(/^data:[^;]+;base64,/, "") : "";
    if (!data || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return { ok: false, status: 400, code: "invalid_image", message: "One of the photos is not a valid image." };
    total += data.length;
    if (total > MAX_TOTAL_BASE64) return { ok: false, status: 413, code: "too_large", message: "The photos are too large together. Take them closer or in lower resolution." };
    const bytes = Buffer.from(data.slice(0, 64), "base64");
    const mime = sniffMime(bytes);
    if (!mime) return { ok: false, status: 415, code: "unsupported_type", message: "Only JPEG, PNG or WebP photos are supported." };
    if (Math.floor((data.length * 3) / 4) > MAX_BYTES_EACH) return { ok: false, status: 413, code: "too_large", message: "One photo is larger than 2.5 MB after resizing." };
    out.push({ mime, data, role: typeof im.role === "string" ? im.role.slice(0, 20) : undefined });
  }
  return { ok: true, images: out };
}
