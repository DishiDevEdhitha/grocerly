/** Usage: npm run seed:kb  - upserts the ingredient knowledge base and the seed regulations. */
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import type { Db } from "mongodb";
import { getDb, col } from "../lib/mongodb";
import { BASE_KNOWLEDGE, normalizeName } from "../lib/ingredients";
import { SEED_REGULATIONS } from "../lib/regulations";

export async function seedKnowledge(db: Db, log = true) {
  const ing = col.ingredients(db);
  for (const k of BASE_KNOWLEDGE) {
    await ing.updateOne({ normalizedName: normalizeName(k.name) }, { $set: { ...k, normalizedName: normalizeName(k.name) } }, { upsert: true });
  }
  const reg = col.regulations(db);
  for (const r of SEED_REGULATIONS) {
    const ingredient = await ing.findOne({ eNumber: r.ingredientKey });
    await reg.updateOne({ ingredientKey: r.ingredientKey, country: r.country }, { $set: { ...r, ingredientId: ingredient?._id } }, { upsert: true });
  }
  if (log) console.log(`Upserted ${BASE_KNOWLEDGE.length} ingredients and ${SEED_REGULATIONS.length} regulation records.`);
}

if (process.argv[1]?.includes("seed-knowledge")) {
  getDb().then((db) => seedKnowledge(db)).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
