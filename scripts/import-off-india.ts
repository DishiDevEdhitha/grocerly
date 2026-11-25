/**
 * Import Indian products from Open Food Facts into the Grocerly catalogue.
 *   API mode  (small/medium):  npm run import:off -- --pages 20          (100 products per page, ~7 s between pages)
 *   File mode (bulk):          npm run import:off -- --file path/to/openfoodfacts-products.jsonl.gz [--limit 20000]
 * Add --dry-run to see statistics without writing.
 * Data licence: ODbL (database) / CC BY-SA (images). Attribution is shown in the app; every record keeps its source URL.
 * Open Food Facts asks bulk users to use the data exports instead of hammering the search API: use file mode for big runs.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import fs from "fs";
import zlib from "zlib";
import readline from "readline";
import path from "path";
import { getDb, validatorStatus } from "../lib/mongodb";
import { fetchOffIndiaPage, ExternalApiError } from "../lib/off";
import { normalizeOffProduct, type OffProduct } from "../lib/normalize";
import { emptyStats, formatStats, importProducts, mergeStats, type ImportItem, type ImportStats } from "../lib/importer";
import { seedKnowledge } from "./seed-knowledge";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };

function toItems(raw: OffProduct[]): ImportItem[] {
  const out: ImportItem[] = [];
  for (const r of raw) { const n = normalizeOffProduct(r); if (n.product) out.push({ product: n.product, isIndian: n.isIndian }); }
  return out;
}

async function main() {
  const dry = process.argv.includes("--dry-run");
  const file = arg("file"); const limit = Number(arg("limit") ?? 0) || Infinity; const pages = Number(arg("pages") ?? 5);
  const db = await getDb();
  { const v = await validatorStatus(db); if (!v.ok) { console.error(`\nSTOP: ${v.reason}\n`); process.exit(1); } } await seedKnowledge(db, false);
  let total: ImportStats = emptyStats();
  const flush = async (raw: OffProduct[]) => { total = mergeStats(total, await importProducts(db, toItems(raw), { dryRun: dry, requireIndian: true })); };

  if (file) {
    if (!fs.existsSync(file)) { console.error(`File not found: ${file}`); process.exit(1); }
    console.log(`Streaming ${file} (keeping only products sold in India)...`);
    const input = file.endsWith(".gz") ? fs.createReadStream(file).pipe(zlib.createGunzip()) : fs.createReadStream(file);
    const rl = readline.createInterface({ input, crlfDelay: Infinity });
    let buf: OffProduct[] = []; let seen = 0, kept = 0;
    for await (const line of rl) {
      seen++; if (seen % 200000 === 0) console.log(`  scanned ${seen.toLocaleString()} lines, kept ${kept}`);
      if (!line.includes('"en:india"') && !/"code":"890/.test(line)) continue;   // cheap pre-filter before JSON.parse
      let rec: OffProduct; try { rec = JSON.parse(line); } catch { continue; }
      kept++; buf.push(rec);
      if (buf.length >= 500) { await flush(buf); buf = []; console.log(`  imported so far: ${total.inserted + total.updated}`); }
      if (kept >= limit) break;
    }
    if (buf.length) await flush(buf);
  } else {
    console.log(`API mode: up to ${pages} pages of 100 Indian products, most-scanned first (about 7 s between requests to respect rate limits).`);
    for (let page = 1; page <= pages; page++) {
      let attempt = 0;
      for (;;) {
        try {
          const { raw, count } = await fetchOffIndiaPage(page, 100);
          if (!raw.length) { page = pages + 1; break; }
          await flush(raw); console.log(`  page ${page}: ${raw.length} records (OFF reports ${count.toLocaleString()} in total)`); break;
        } catch (e) {
          const err = e as ExternalApiError;
          if (++attempt > 3) { console.error(`  giving up on page ${page}: ${err.message}`); break; }
          const wait = err.code === "rate_limited" ? (err.retryAfterSec ?? 60) : 15;
          console.log(`  ${err.message} Waiting ${wait}s then retrying (${attempt}/3)...`); await sleep(wait * 1000);
        }
      }
      await sleep(7000);
    }
  }
  console.log(`\n${dry ? "DRY RUN (nothing written)\n" : ""}${formatStats(total)}`);
  fs.mkdirSync("data/reports", { recursive: true });
  const out = path.join("data/reports", `off-india-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}${dry ? "-dry" : ""}.json`);
  fs.writeFileSync(out, JSON.stringify(total, null, 2)); console.log(`\nReport saved to ${out}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
