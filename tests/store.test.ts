import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryDb } from "@/lib/memory-db";
import { setDb, getDb, C, type DB } from "@/lib/db";
import { enrichProduct } from "@/lib/catalogue";
import { upsertProduct, getProductById, getScores, getOrComputeAnalysis, recordScan, resolveProduct, saveProductWithAnalysis } from "@/lib/products";
import { searchCatalogue, homeData, clearSearchCaches } from "@/lib/search";
import { findSimilar } from "@/lib/similar";
import { findAlternatives } from "@/lib/alternatives";
import { importProducts } from "@/lib/importer";
import { listHistory, listSaved, saveProduct, unsaveProduct, isSaved } from "@/lib/user-data";
import { checkRate } from "@/lib/rate-limit";
import { clearKnowledgeCaches } from "@/lib/products";
import type { Product } from "@/lib/types";

const N = { calories: 300, protein: 20, fat: 25, saturatedFat: 15, sodium: 900, sugars: 2 };
const mk = (name: string, brand: string, o: Partial<Product> = {}): Product => enrichProduct({
  barcode: null, name, brand, category: "c", categoryTags: [], profile: "default", nutritionBasis: { amount: 100, unit: "g" }, nutrition: N,
  nutritionMeta: Object.fromEntries(Object.keys(N).map((k) => [k, { confidence: 0.8, source: "openfoodfacts" }])), ingredients: ["milk"], allergens: { declared: [], traces: [] }, images: {},
  source: { type: "openfoodfacts", confidence: 0.7, fetchedAt: new Date() }, createdAt: new Date(), updatedAt: new Date(), ...o } as Product, { isIndian: true, forceStatus: true });

let db: DB;
beforeEach(async () => { db = createMemoryDb(); setDb(db); clearSearchCaches(); clearKnowledgeCaches(); });
async function load() {
  const items = [
    mk("Maggi 2-Minute Masala Noodles", "Maggi", { barcode: "8901058852370", quantity: { value: 70, unit: "g" }, nutrition: { calories: 430, protein: 9, fat: 17, saturatedFat: 8, sodium: 1500, sugars: 2 } }),
    mk("Maggi Masala Cup Noodles", "Maggi", { barcode: "4006381333931", quantity: { value: 70, unit: "g" } }),
    mk("Maggi Rich Tomato Ketchup", "Maggi", { barcode: "96385074" }),
    mk("Amul Processed Cheese", "Amul", { barcode: "036000291452", quantity: { value: 200, unit: "g" } }),
    mk("Amul Processed Cheese", "Amul", { quantity: { value: 1000, unit: "g" } }),
    mk("Britannia Cheese Slices", "Britannia", { quantity: { value: 200, unit: "g" } }),
    mk("Go Cheese Spread", "Go"),
    mk("Oreo Cream Biscuits", "Cadbury", { barcode: "04252614" }),
    mk("Parle Cream Biscuits", "Parle"),
    mk("Yippee Magic Masala Noodles", "Sunfeast", { barcode: "5012345678900", quantity: { value: 70, unit: "g" }, nutrition: { calories: 400, protein: 9, fat: 14, saturatedFat: 6, sodium: 800, sugars: 3 } }),
  ];
  const foreign = enrichProduct({ ...mk("German Cheese", "Hochland", { barcode: "4006381333948" }) }, { isIndian: false, forceStatus: true });
  const incomplete = enrichProduct({ ...mk("Hidden Snack", "Zed"), nutrition: { calories: 1 } }, { isIndian: true, forceStatus: true });
  for (const p of items) await saveProductWithAnalysis(db, p);
  await saveProductWithAnalysis(db, incomplete); await saveProductWithAnalysis(db, foreign);
  return items;
}

describe("Firestore-style store (in-memory twin)", () => {
  it("document id is the barcode, so a barcode can never be stored twice", async () => {
    const a = await upsertProduct(db, mk("Test Chips", "Acme", { barcode: "8901058852370" })); expect(a.created).toBe(true); expect(a.product._id).toBe("8901058852370");
    const b = await upsertProduct(db, mk("Test Chips v2", "Acme", { barcode: "8901058852370" })); expect(b.created).toBe(false);
    expect((await db.collection(C.products).where("barcode", "==", "8901058852370").get()).size).toBe(1);
  });
  it("products without a barcode get an automatic id; same brand+type+name+PACK merge, different pack does not", async () => {
    const a = await upsertProduct(db, mk("Amul Processed Cheese", "Amul", { quantity: { value: 200, unit: "g" } }));
    const same = await upsertProduct(db, mk("AMUL Processed Cheese 200g", "Amul", { quantity: { value: 200, unit: "g" } }));
    const big = await upsertProduct(db, mk("Amul Processed Cheese", "Amul", { quantity: { value: 1000, unit: "g" } }));
    expect(a.created && !same.created && big.created).toBe(true); expect(same.product._id).toBe(a.product._id); expect(big.product._id).not.toBe(a.product._id);
    expect((await db.collection(C.products).get()).size).toBe(2);
  });
  it("source priority: dataset beats Open Food Facts, agreement marks values verified", async () => {
    await upsertProduct(db, mk("Amul Processed Cheese", "Amul", { barcode: "036000291452" }));
    const ds = mk("Amul Processed Cheese", "Amul", { barcode: "036000291452", source: { type: "dataset", confidence: 0.9, fetchedAt: new Date() }, nutrition: { ...N, protein: 21 }, nutritionMeta: Object.fromEntries(Object.keys(N).map((k) => [k, { confidence: 0.9, source: "dataset" }])) as never });
    const r = await upsertProduct(db, ds);
    expect(r.product.nutrition.protein).toBe(21); expect(r.product.source.type).toBe("dataset"); expect(r.product.confidence?.nutrition).toBe("verified");
    const low = await upsertProduct(db, mk("Amul Processed Cheese", "Amul", { barcode: "036000291452", source: { type: "manual", confidence: 0.7, fetchedAt: new Date() }, nutrition: { ...N, protein: 99 } }));
    expect(low.product.nutrition.protein).toBe(21);
  });
  it("analysis is stored once per product and score version", async () => {
    const { product } = await upsertProduct(db, mk("Test Chips", "Acme", { barcode: "8901058852370" }));
    const a1 = await getOrComputeAnalysis(db, product); const a2 = await getOrComputeAnalysis(db, product);
    expect(a1.score).not.toBeNull(); expect(a2.generatedAt.getTime()).toBe(a1.generatedAt.getTime());
    expect((await db.collection(C.analysis).get()).size).toBe(1); expect((await getScores(db, [product._id])).get(product._id)).toBe(a1.score);
  });
  it("resolveProduct: invalid barcode, unknown id, and catalogue-first lookup", async () => {
    await load();
    expect((await resolveProduct(db, "123")).status).toBe("invalid_barcode");
    expect((await resolveProduct(db, "nope-nope")).status).toBe("not_found");
    const r = await resolveProduct(db, "8901058852370"); expect(r.status).toBe("found"); if (r.status === "found") expect(r.origin).toBe("catalogue");
  });
});

describe("search on the Firestore data model", () => {
  it("maggi -> only Maggi, chips from the data; hidden and foreign products never appear", async () => {
    await load();
    const r = await searchCatalogue(db, { q: "maggi" });
    expect(r.items.every((i) => /maggi/i.test(i.name))).toBe(true); expect(r.total).toBe(3);
    expect(r.chips.map((c) => c.label).sort()).toEqual(["Cup Noodles", "Instant Noodles", "Ketchup"]);
    expect((await searchCatalogue(db, { q: "hidden snack" })).total).toBe(0);
  });
  it("maggi noodles -> noodles first; cheese -> every cheese type; processed cheese -> only that type; amul cheese -> Amul only", async () => {
    await load();
    const mn = await searchCatalogue(db, { q: "maggi noodles" }); expect(mn.items.map((i) => i.productType).sort()).toEqual(["Cup Noodles", "Instant Noodles"]);
    const ch = await searchCatalogue(db, { q: "cheese" }); expect(ch.items.every((i) => /cheese/i.test(i.name))).toBe(true); expect(ch.chips.map((c) => c.label)).toEqual(expect.arrayContaining(["Processed Cheese", "Cheese Slices", "Cheese Spread"]));
    const pc = await searchCatalogue(db, { q: "processed cheese" }); expect(pc.items.every((i) => i.productType === "Processed Cheese")).toBe(true); expect(pc.total).toBe(2);
    const ac = await searchCatalogue(db, { q: "amul cheese" }); expect(ac.items.every((i) => i.brand === "Amul")).toBe(true); expect(ac.intent.brand).toBe("amul");
  });
  it("oreo -> Oreo only (not every cream biscuit); typing a prefix still finds it; nothing unrelated", async () => {
    await load();
    const o = await searchCatalogue(db, { q: "oreo" }); expect(o.items.map((i) => i.name)).toEqual(["Oreo Cream Biscuits"]);
    expect((await searchCatalogue(db, { q: "ore" })).items.map((i) => i.name)).toEqual(["Oreo Cream Biscuits"]);
    expect((await searchCatalogue(db, { q: "zzzz nothing" })).total).toBe(0);
  });
  it("type filter, brand filter and sorting", async () => {
    await load();
    expect((await searchCatalogue(db, { q: "maggi", type: "Ketchup" })).total).toBe(1);
    expect((await searchCatalogue(db, { q: "cheese", brand: "amul" })).items.every((i) => i.brand === "Amul")).toBe(true);
    const s = await searchCatalogue(db, { q: "cheese", sort: "score" }); const sc = s.items.map((i) => i.score ?? -1); expect(sc).toEqual([...sc].sort((a, b) => b - a));
  });
  it("home: real departments with counts and popular products after people open them", async () => {
    await load();
    const before = await homeData(db); expect(before.departments.find((d) => d.name === "Dairy")?.count).toBe(4); expect(before.departments.find((d) => d.name === "Instant Foods")?.count).toBe(3);
    await recordScan(db, "device-aaaaaaaaaaaaaaaa", "8901058852370", "barcode"); await recordScan(db, "device-bbbbbbbbbbbbbbbb", "8901058852370", "search");
    const after = await homeData(db); expect(after.popular[0].id).toBe("8901058852370");
  });
  it("brand list is cached in meta/brands", async () => {
    await load(); await searchCatalogue(db, { q: "maggi" });
    const brands = (await db.collection("meta").doc("brands").get()).data()!.brands as string[]; expect(brands).toEqual(expect.arrayContaining(["maggi", "amul", "britannia"]));
  });
});

describe("comparison, alternatives, history, saved, limits, import", () => {
  it("similar products: same category, other brands first, never itself, never noodles for cheese", async () => {
    await load(); const base = (await getProductById(db, "036000291452"))!;
    const sim = await findSimilar(db, base); const names = sim.map((s) => s.product.name);
    expect(names).toEqual(expect.arrayContaining(["Britannia Cheese Slices", "Go Cheese Spread"])); expect(names.join()).not.toMatch(/Maggi|Oreo|German/);
    expect(sim.every((s) => s.id !== base._id)).toBe(true);
  });
  it("alternatives query returns candidates of the same category", async () => {
    await load(); const p = (await getProductById(db, "8901058852370"))!; const a = await getOrComputeAnalysis(db, p);
    const r = await findAlternatives(db, p, a); expect(r.candidateCount).toBe(1); expect(r.alternatives.every((x) => x.product.name !== p.name)).toBe(true);
  });
  it("history is newest-first per person; saved never duplicates and can be removed", async () => {
    await load(); const u = "device-cccccccccccccccc";
    await recordScan(db, u, "8901058852370", "barcode"); await new Promise((r) => setTimeout(r, 5)); await recordScan(db, u, "036000291452", "search");
    const h = await listHistory(db, u); expect(h.map((x) => x.id)).toEqual(["036000291452", "8901058852370"]); expect(h[0].method).toBe("search"); expect(h[0].score).not.toBeNull();
    expect(await listHistory(db, "device-other-other-other")).toEqual([]);
    await saveProduct(db, u, "8901058852370"); await saveProduct(db, u, "8901058852370");
    expect((await listSaved(db, u)).length).toBe(1); expect(await isSaved(db, u, "8901058852370")).toBe(true);
    await unsaveProduct(db, u, "8901058852370"); expect(await isSaved(db, u, "8901058852370")).toBe(false);
  });
  it("rate limiter allows up to the limit, then blocks, per person", async () => {
    const r = [] as boolean[]; for (let i = 0; i < 4; i++) r.push((await checkRate(db, "t", "p1", 3, 60)).allowed);
    expect(r).toEqual([true, true, true, false]); expect((await checkRate(db, "t", "p2", 3, 60)).allowed).toBe(true);
  });
  it("import pipeline: de-duplicates, merges, skips non-Indian, reports statistics", async () => {
    const mkp = (name: string, type: "dataset" | "openfoodfacts", n: Record<string, number>, bc: string | null, q = 200) => mk(name, "Amul", { barcode: bc, quantity: { value: q, unit: "g" }, nutrition: n, source: { type, confidence: 0.8, fetchedAt: new Date() }, nutritionMeta: Object.fromEntries(Object.keys(n).map((k) => [k, { confidence: 0.8, source: type }])) as never });
    const stats = await importProducts(db, [
      { product: mkp("Amul Processed Cheese", "openfoodfacts", N, null), isIndian: true },
      { product: mkp("AMUL Processed Cheese 200g", "dataset", { ...N, protein: 21 }, null), isIndian: true },
      { product: mkp("Amul Processed Cheese", "dataset", N, null, 1000), isIndian: true },
      { product: mk("German Cheese", "Hochland"), isIndian: false },
    ], { requireIndian: true });
    expect(stats).toMatchObject({ read: 4, skippedNotIndian: 1, duplicatesInFile: 1, inserted: 2 });
    const rows = (await db.collection(C.products).get()).docs.map((d) => d.data()!); expect(rows.length).toBe(2);
    expect(rows.find((r) => r.quantity.value === 200)!.nutrition.protein).toBe(21);
    const again = await importProducts(db, [{ product: mkp("Amul Processed Cheese", "dataset", N, null, 1000), isIndian: true }]); expect(again.inserted).toBe(0); expect(again.updated).toBe(1);
  });
  it("getDb returns the injected test database", async () => { expect(await getDb()).toBe(db); });
});
