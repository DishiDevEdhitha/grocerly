/**
 * Usage:  npm run seed -- maggi
 * Searches Open Food Facts, normalises each hit, upserts into MongoDB and computes its analysis.
 * Respects OFF's rate limits (small pages, sequential requests). Data is ODbL: keep attribution.
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
  console.log(`Searching Open Food Facts for "${term}" ...`);
  const found = await searchOff(term, 24);
  let created = 0, updated = 0;
  for (const p of found) {
    const { product, created: isNew } = await upsertProduct(db, p);
    await getOrComputeAnalysis(db, product, true);
    isNew ? created++ : updated++;
    console.log(`${isNew ? "+ inserted" : "~ updated "}  ${p.barcode}  ${p.brand ?? ""} ${p.name}`);
  }
  console.log(`\nDone. ${created} inserted, ${updated} updated. Total products in DB: ${await col.products(db).countDocuments()}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
