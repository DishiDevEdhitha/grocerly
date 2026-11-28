/** Usage: npm run seed:kb  - saves the ingredient knowledge base and the seed regulations into Firestore. */
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { C, getDb, type DB } from "../lib/db";
import { BASE_KNOWLEDGE, normalizeName } from "../lib/ingredients";
import { SEED_REGULATIONS } from "../lib/regulations";

const slug = (s: string) => s.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);

export async function seedKnowledge(db: DB, log = true) {
  for (const k of BASE_KNOWLEDGE) {
    const normalizedName = normalizeName(k.name);
    await db.collection(C.ingredients).doc(slug(normalizedName)).set({ ...k, normalizedName }, { merge: true });
  }
  for (const r of SEED_REGULATIONS) {
    const ing = BASE_KNOWLEDGE.find((k) => k.eNumber === r.ingredientKey);
    await db.collection(C.regulations).doc(`${r.ingredientKey}_${r.country}`).set({ ...r, ingredientId: ing ? slug(normalizeName(ing.name)) : null }, { merge: true });
  }
  if (log) console.log(`Saved ${BASE_KNOWLEDGE.length} ingredients and ${SEED_REGULATIONS.length} regulation records.`);
}

if (process.argv[1]?.includes("seed-knowledge")) {
  getDb().then((db) => seedKnowledge(db)).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
