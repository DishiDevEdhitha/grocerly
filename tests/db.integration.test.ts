/**
 * Integration tests against a REAL (throw-away) MongoDB. They run only when MONGODB_URI_TEST is set:
 *   MONGODB_URI_TEST="mongodb+srv://..." npm test
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI_TEST;
describe.skipIf(!uri)("MongoDB integration", () => {
  const dbName = `grocerly_test_${Date.now()}`;
  let client: MongoClient;
  let lib: typeof import("@/lib/products");
  let db: import("mongodb").Db;
  beforeAll(async () => {
    process.env.MONGODB_URI = uri; process.env.MONGODB_DB = dbName;
    const m = await import("@/lib/mongodb"); lib = await import("@/lib/products");
    db = await m.getDb(); client = new MongoClient(uri!);
  }, 30000);
  afterAll(async () => { await db?.dropDatabase(); await client?.close(); });

  const base = async () => (await import("@/lib/normalize")).normalizeOffProduct({ code: "4006381333931", product_name: "Test Chips", brands: "Acme", categories_tags: ["en:chips"], ingredients_text: "potato, palm oil, salt", nutriments: { "energy-kcal_100g": 500, sodium_100g: 0.6, fat_100g: 30, "saturated-fat_100g": 12, proteins_100g: 6 } }).product!;

  it("connects and creates indexes", async () => {
    await db.command({ ping: 1 });
    const names = (await db.collection("products").indexes()).map((i) => i.name);
    expect(names).toEqual(expect.arrayContaining(["barcode_unique", "name_1", "brand_1", "category_1", "products_text"]));
  });
  it("creates a product, then upserts without duplicating (duplicate barcode)", async () => {
    const a = await lib.upsertProduct(db, await base()); expect(a.created).toBe(true);
    const p2 = await base(); p2.name = "Test Chips v2";
    const b = await lib.upsertProduct(db, p2); expect(b.created).toBe(false);
    expect(await db.collection("products").countDocuments({ barcode: "4006381333931" })).toBe(1);
    expect(b.product.name).toBe("Test Chips v2");
  });
  it("rejects a raw duplicate insert via the unique index", async () => {
    const p = await base(); const { _id: _i, ...doc } = p as never as Record<string, unknown>;
    await expect(db.collection("products").insertOne({ ...doc })).rejects.toThrow(/E11000/);
  });
  it("schema validation rejects a document with no name", async () => {
    await expect(db.collection("products").insertOne({ barcode: null, nutrition: {}, ingredients: [], source: { type: "manual", confidence: 1 }, createdAt: new Date(), updatedAt: new Date() })).rejects.toThrow();
  });
  it("scores and stores analysis, search finds it", async () => {
    const found = await db.collection("products").findOne({ barcode: "4006381333931" });
    const a = await lib.getOrComputeAnalysis(db, found as never);
    expect(a.score).not.toBeNull();
    expect(await db.collection("product_analysis").countDocuments({ productId: found!._id })).toBe(1);
    const s = await lib.searchProducts(db, "chips"); expect(s.results.length).toBeGreaterThan(0);
  });
  it("invalid barcode and unknown product are reported, not thrown", async () => {
    expect((await lib.resolveProduct(db, "123")).status).toBe("invalid_barcode");
  });
});
