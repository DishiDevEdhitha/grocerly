/** Usage: npm run catalogue:stats  - health report of the product catalogue (great for demos and your viva). */
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { C, getDb } from "../lib/db";
import { DEPARTMENTS } from "../lib/taxonomy";
(async () => {
  const db = await getDb(); const c = db.collection(C.products);
  const by = async (field: string, values: string[]) => (await Promise.all(values.map(async (v) => `${v}: ${await c.where(field, "==", v).count()}`))).join(" | ");
  console.log(`Products: ${await c.count()}`);
  console.log(`By status:     ${await by("catalogStatus", ["active", "needs_review", "hidden"])}`);
  console.log(`By source:     ${await by("source.type", ["dataset", "openfoodfacts", "gemini", "ocr", "manual"])}`);
  console.log(`By confidence: ${await by("confidence.overall", ["verified", "high", "medium", "low", "unknown"])}`);
  console.log(`By department: ${await by("activeDepartment", DEPARTMENTS)}`);
  process.exit(0);
})().catch((e) => { console.error(e.message ?? e); process.exit(1); });
