/** Usage: npm run db:check  - proves the app can reach Firestore and shows how many documents each collection holds. */
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { C, getDb } from "../lib/db";
(async () => {
  const db = await getDb();
  await db.ping();
  console.log(`Connected to Firestore project: ${db.name}`);
  for (const name of [C.products, C.analysis, C.ingredients, C.regulations, C.submissions, C.users]) console.log(`  ${name.padEnd(18)} ${await db.collection(name).count()} documents`);
  process.exit(0);
})().catch((e) => { console.error(e.message ?? e); if (e.code === 5) console.error("Firestore database not created yet: Firebase console > Build > Firestore Database > Create database."); process.exit(1); });
