/**
 * Usage:
 *   npm run import:mendeley -- data/indian-packaged-foods.csv --dry-run
 *   npm run import:mendeley -- data/indian-packaged-foods.csv --basis per100
 * Source: "Indian Packaged Foods Nutritional Composition Dataset (2026)", Mendeley Data, CC BY 4.0
 *         https://data.mendeley.com/datasets/rhswn9z9xr/1   (download the CSV yourself; attribution is required)
 * --basis per100|perServing   tells the importer what unlabeled nutrient columns mean (default: skip them and warn)
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import fs from "fs";
import path from "path";
import { getDb } from "../lib/db";
import { csvToObjects } from "../lib/csv";
import { describeMap, mapHeaders, rowToProduct } from "../lib/dataset-mapper";
import { formatStats, importProducts, type ImportItem } from "../lib/importer";
import { seedKnowledge } from "./seed-knowledge";

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  const dry = args.includes("--dry-run");
  const bi = args.indexOf("--basis"); const basis = (bi >= 0 ? args[bi + 1] : "auto") as "per100" | "perServing" | "auto";
  if (!file || !fs.existsSync(file)) { console.error("Usage: npm run import:mendeley -- <file.csv> [--dry-run] [--basis per100|perServing]\nDownload the CSV from https://data.mendeley.com/datasets/rhswn9z9xr/1 and put it in the data/ folder."); process.exit(1); }
  if (!["per100", "perServing", "auto"].includes(basis)) { console.error("--basis must be per100 or perServing"); process.exit(1); }
  const { headers, rows } = csvToObjects(fs.readFileSync(file, "utf8"));
  const map = mapHeaders(headers);
  console.log(`${rows.length} rows read from ${file}\n${describeMap(map)}\n`);
  if (!map.name) { console.error("Could not find a product-name column. Rename it to 'Product Name' in the CSV and retry."); process.exit(1); }
  const items: ImportItem[] = []; const skipped: Record<string, number> = {};
  rows.forEach((row, i) => {
    const r = rowToProduct(row, map, { basis, sourceRef: `mendeley:rhswn9z9xr:row${i + 2}`, sourceUrl: "https://data.mendeley.com/datasets/rhswn9z9xr/1", sourceName: "Indian Packaged Foods Nutritional Composition Dataset (2026)", license: "CC BY 4.0" });
    for (const reason of r.reasons) skipped[reason] = (skipped[reason] ?? 0) + 1;
    if (r.product) items.push({ product: r.product, isIndian: true });
  });
  if (skipped.nutrition_basis_unknown) console.log(`WARNING: ${skipped.nutrition_basis_unknown} rows had nutrient columns with no per-100 g / per-serving label. Re-run with --basis per100 (or perServing) after checking the dataset page.\n`);
  const db = await getDb();
  await seedKnowledge(db, false);
  const stats = await importProducts(db, items, { dryRun: dry, onProgress: (d, t) => { if (d % 100 === 0) console.log(`  ... ${d}/${t}`); } });
  stats.read = rows.length; stats.invalid += rows.length - items.length;
  console.log(`\n${dry ? "DRY RUN (nothing written)\n" : ""}${formatStats(stats)}`);
  fs.mkdirSync("data/reports", { recursive: true });
  const out = path.join("data/reports", `mendeley-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}${dry ? "-dry" : ""}.json`);
  fs.writeFileSync(out, JSON.stringify({ file, basis, columns: map, stats, rowWarnings: skipped }, null, 2));
  console.log(`\nReport saved to ${out}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
