/** Turn raw OCR lines from a shopping-cart screenshot into candidate product names. */
const NOISE = /^(add|remove|delete|qty|quantity|save for later|move to wishlist|subtotal|total|delivery|free|offer|discount|coupon|checkout|proceed|apply|view|cart|my cart|bag|items?|savings?|mrp|you save|gst|taxes?|handling|sponsored|out of stock|in stock|buy|sold by|deliver(y|ed)?|arrives?|standard|express|select|change|rating|reviews?)\b/i;
const PRICE = /(₹|rs\.?|inr|\$)\s*\d|\d+\s*%\s*off|^\W*\d+([.,]\d+)?\W*$/i;

export function extractCartItems(lines: string[], max = 8): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.replace(/[|•·_]+/g, " ").replace(/\s+/g, " ").trim();
    if (line.length < 4 || line.length > 90) continue;
    if (NOISE.test(line) || PRICE.test(line)) continue;
    const letters = (line.match(/[a-z]/gi) ?? []).length;
    if (letters < 4 || letters / line.length < 0.55) continue;
    const words = line.split(" ").filter((w) => /[a-z]/i.test(w));
    if (words.length < 2 && line.length < 6) continue;
    const cleaned = line.replace(/\s*[-–]\s*\d+(\.\d+)?\s*(g|kg|ml|l|pack|pcs?)\b.*$/i, "").replace(/\b(pack of|combo)\b.*$/i, "").trim();
    if (cleaned.length >= 4 && !out.some((o) => o.toLowerCase() === cleaned.toLowerCase())) out.push(cleaned);
    if (out.length >= max) break;
  }
  return out;
}
