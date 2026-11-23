/** Barcode validation: EAN-13, EAN-8, UPC-A, UPC-E (+ GTIN-14). */

function gs1Check(digits: string): boolean {
  // digits includes the check digit as the last character
  const body = digits.slice(0, -1).split("").map(Number);
  const check = Number(digits.slice(-1));
  let sum = 0;
  for (let i = body.length - 1, pos = 1; i >= 0; i--, pos++) {
    sum += body[i] * (pos % 2 === 1 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10 === check;
}

/** Expand an 8-digit UPC-E (number system 0/1) to its 12-digit UPC-A form. */
export function expandUpcE(upce: string): string | null {
  if (!/^[01]\d{7}$/.test(upce)) return null;
  const ns = upce[0], d = upce.slice(1, 7), chk = upce[7];
  const [d1, d2, d3, d4, d5, d6] = d.split("");
  let body: string;
  if ("012".includes(d6)) body = `${ns}${d1}${d2}${d6}0000${d3}${d4}${d5}`;
  else if (d6 === "3") body = `${ns}${d1}${d2}${d3}00000${d4}${d5}`;
  else if (d6 === "4") body = `${ns}${d1}${d2}${d3}${d4}00000${d5}`;
  else body = `${ns}${d1}${d2}${d3}${d4}${d5}0000${d6}`;
  return body + chk;
}

export type BarcodeFormat = "EAN-13" | "EAN-8" | "UPC-A" | "UPC-E" | "GTIN-14";

export function validateBarcode(raw: string): { valid: boolean; format?: BarcodeFormat; normalized: string; reason?: string } {
  const code = (raw ?? "").trim().replace(/[\s-]/g, "");
  if (!/^\d+$/.test(code)) return { valid: false, normalized: code, reason: "Barcode must contain digits only." };
  const len = code.length;
  if (![8, 12, 13, 14].includes(len)) return { valid: false, normalized: code, reason: "Barcode must be 8, 12, 13 or 14 digits long." };
  if (len === 8) {
    if (gs1Check(code)) return { valid: true, format: "EAN-8", normalized: code };
    const exp = expandUpcE(code);
    if (exp && gs1Check(exp)) return { valid: true, format: "UPC-E", normalized: code };
    return { valid: false, normalized: code, reason: "Check digit does not match." };
  }
  if (!gs1Check(code)) return { valid: false, normalized: code, reason: "Check digit does not match." };
  return { valid: true, format: len === 13 ? "EAN-13" : len === 12 ? "UPC-A" : "GTIN-14", normalized: code };
}
