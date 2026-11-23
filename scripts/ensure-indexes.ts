/** Usage: npm run db:indexes  - creates collections, validator and indexes (also runs automatically on first request). */
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { getDb } from "../lib/mongodb";
getDb().then(async (db) => {
  for (const c of await db.listCollections().toArray()) {
    const idx = await db.collection(c.name).indexes();
    console.log(`${c.name}: ${idx.map((i) => i.name).join(", ")}`);
  }
  process.exit(0);
}).catch((e) => { console.error(e); process.exit(1); });
