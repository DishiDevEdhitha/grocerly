/**
 * Usage:  npm run seed -- maggi
 * Quick, small import for one search term (Indian products only). For large imports use
 * `npm run import:off` and `npm run import:mendeley`.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { getDb, col } from "../lib/mongodb";
import { searchOff } from "../lib/off";
import { upsertProduct, getOrComputeAnalysis } from "../lib/products";
import { seedKnowledge } from "./seed-knowledge";

async function main() {
  const term = process.argv.slice(2).join(" ").trim();
  if (!term) { console.error("Usage: npm run seed -- <search term>   e.g. npm run seed -- maggi"); process.exit(1); }
  const db = await getDb();
  await seedKnowledge(db, false);
  console.log(`Searching Open Food Facts (India) for "${term}" ...`);
  const found = await searchOff(term, 24, { india: true });
  let created = 0, merged = 0, skipped = 0;
  for (const { product: p, isIndian } of found) {
    if (!isIndian) { skipped++; continue; }
    const r = await upsertProduct(db, p, { isIndian });
    await getOrComputeAnalysis(db, r.product, true);
    r.created ? created++ : merged++;
    console.log(`${r.created ? "+ inserted" : "~ merged  "}  ${p.barcode}  ${p.brand ?? ""} ${p.name}  [${p.categoryPath?.join(" > ")}]  status=${r.product.catalogStatus}`);
  }
  console.log(`\nDone. ${created} inserted, ${merged} merged, ${skipped} skipped (not Indian). Products in DB: ${await col.products(db).countDocuments()}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
