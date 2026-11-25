/**
 * Upgrades EXISTING products to the catalogue-v2 shape (category path, product type, identity key, search tokens,
 * quality score, confidence, canonical image, status) and hides records that are not Indian or too incomplete.
 *   npm run migrate:v2 -- --dry-run     (shows what would change)
 *   npm run migrate:v2                  (applies it; safe to re-run)
 *   npm run migrate:v2 -- --all         (recompute even products that already have v2 fields)
 * Old products from worldwide Open Food Facts searches (e.g. "Maggi Würze") lack country info; they are treated as Indian
 * only if the barcode starts with 890 (India's GS1 prefix) or they were added by a user. Others become "hidden"
 * and come back automatically if you re-import them with `npm run import:off` / `npm run seed`.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { getDb, col, validatorStatus } from "../lib/mongodb";
import { enrichProduct } from "../lib/catalogue";
import { clearSearchCaches } from "../lib/search";

async function main() {
  const dry = process.argv.includes("--dry-run"), all = process.argv.includes("--all");
  const db = await getDb();
  { const v = await validatorStatus(db); if (!v.ok) { console.error(`\nSTOP: ${v.reason}\n`); process.exit(1); } } const coll = col.products(db);
  const filter = all ? {} : { $or: [{ identityKey: { $exists: false } }, { categoryPath: { $exists: false } }] };
  const cursor = coll.find(filter);
  const counts: Record<string, number> = { active: 0, needs_review: 0, hidden: 0 }; const depts: Record<string, number> = {}; const hiddenSamples: string[] = [];
  let ops: import("mongodb").AnyBulkWriteOperation<import("../lib/types").Product>[] = []; let n = 0;
  for await (const p of cursor) {
    const isIndian = p.barcode?.startsWith("890") || p.source.type !== "openfoodfacts";
    const { _id, ...doc } = enrichProduct({ ...p, catalogStatus: undefined }, { isIndian, forceStatus: true });
    counts[doc.catalogStatus!]++; depts[doc.categoryPath?.[0] ?? "?"] = (depts[doc.categoryPath?.[0] ?? "?"] ?? 0) + 1;
    if (doc.catalogStatus === "hidden" && hiddenSamples.length < 8) hiddenSamples.push(`${p.brand ?? "?"} ${p.name}`);
    ops.push({ updateOne: { filter: { _id: p._id }, update: { $set: doc } } }); n++;
    if (!dry && ops.length >= 200) { await coll.bulkWrite(ops); ops = []; }
  }
  if (!dry && ops.length) await coll.bulkWrite(ops);
  clearSearchCaches();
  console.log(`${dry ? "DRY RUN: " : ""}${n} products processed.\nStatus: ${JSON.stringify(counts)}\nDepartments: ${JSON.stringify(depts)}\nExamples hidden: ${hiddenSamples.join(" | ") || "(none)"}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
