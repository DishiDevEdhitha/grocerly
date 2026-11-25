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
    const { searchCatalogue } = await import("@/lib/search"); const s = await searchCatalogue(db, { q: "chips" }); expect(s.total).toBeGreaterThanOrEqual(0);
  });

  it("import pipeline: de-duplicates, merges by source priority, skips non-Indian, reports statistics", async () => {
    const { importProducts } = await import("@/lib/importer"); const { enrichProduct } = await import("@/lib/catalogue");
    const mk = (name: string, brand: string, type: "dataset" | "openfoodfacts", nutrition: Record<string, number>, bc: string | null = null, q = 200) => enrichProduct({ barcode: bc, name, brand, category: "c", categoryTags: [], profile: "default", quantity: { value: q, unit: "g" }, nutritionBasis: { amount: 100, unit: "g" }, nutrition, nutritionMeta: Object.fromEntries(Object.keys(nutrition).map((k) => [k, { confidence: 0.8, source: type }])), ingredients: ["milk"], allergens: { declared: [], traces: [] }, images: {}, source: { type, confidence: 0.8, fetchedAt: new Date() }, createdAt: new Date(), updatedAt: new Date() } as never, { isIndian: true, forceStatus: true });
    const n = { calories: 300, protein: 20, fat: 25, sodium: 900 };
    const stats = await importProducts(db, [
      { product: mk("Amul Processed Cheese", "Amul", "openfoodfacts", n), isIndian: true },
      { product: mk("AMUL Processed Cheese 200g", "Amul", "dataset", { ...n, protein: 21 }), isIndian: true },
      { product: mk("Amul Processed Cheese", "Amul", "dataset", n, null, 1000), isIndian: true },
      { product: mk("German Cheese", "Hochland", "openfoodfacts", n), isIndian: false },
    ], { requireIndian: true });
    expect(stats).toMatchObject({ read: 4, skippedNotIndian: 1, duplicatesInFile: 1, inserted: 2 });
    const rows = await db.collection("products").find({ brandNorm: "amul" }).toArray();
    expect(rows).toHaveLength(2);                                   // 200 g and 1 kg stay separate
    const small = rows.find((r) => r.quantity.value === 200)!; expect(small.nutrition.protein).toBe(21); expect(small.source.type).toBe("dataset");
  });
  it("search: brand + category intent, chips from data, nothing unrelated", async () => {
    const { searchCatalogue, clearSearchCaches } = await import("@/lib/search"); clearSearchCaches();
    const r = await searchCatalogue(db, { q: "amul cheese" });
    expect(r.items.every((i) => /cheese/i.test(i.name))).toBe(true); expect(r.intent.brand).toBe("amul");
    expect((await searchCatalogue(db, { q: "zzzz-nothing" })).items).toHaveLength(0);
  });
  it("invalid barcode and unknown product are reported, not thrown", async () => {
    expect((await lib.resolveProduct(db, "123")).status).toBe("invalid_barcode");
  });
});
