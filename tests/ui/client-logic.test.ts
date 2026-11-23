import { describe, it, expect } from "vitest";
import { validateBarcode } from "@/lib/barcode";
import { extractCartItems } from "@/lib/cart";

describe("scanner / search inputs", () => {
  it("scanner ignores misread codes (bad check digit) before calling the backend", () => {
    expect(validateBarcode("4006381333932").valid).toBe(false);
    expect(validateBarcode(" 4006381333931 ").normalized).toBe("4006381333931");
  });
  it("cart upload rejects a screenshot with no product-like text", () => { expect(extractCartItems(["₹10", "Qty 1", "Remove"])).toEqual([]); });
});
