import { describe, it, expect } from "vitest";
import { validateBarcode } from "@/lib/barcode";

describe("barcode validation", () => {
  it("accepts EAN-13, EAN-8, UPC-A", () => {
    expect(validateBarcode("4006381333931")).toMatchObject({ valid: true, format: "EAN-13" });
    expect(validateBarcode("96385074")).toMatchObject({ valid: true, format: "EAN-8" });
    expect(validateBarcode("036000291452")).toMatchObject({ valid: true, format: "UPC-A" });
  });
  it("accepts UPC-E", () => { expect(validateBarcode("04252614")).toMatchObject({ valid: true, format: "UPC-E" }); });
  it("rejects bad check digits, letters and wrong lengths", () => {
    expect(validateBarcode("4006381333932").valid).toBe(false);
    expect(validateBarcode("40063813A3931").valid).toBe(false);
    expect(validateBarcode("12345").valid).toBe(false);
    expect(validateBarcode("").valid).toBe(false);
  });
});
