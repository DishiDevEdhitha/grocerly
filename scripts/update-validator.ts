/**
 * Brings the products collection's schema validator up to date (adds the "dataset" and "gemini" source types).
 *   npm run db:validator            -> check, and try the normal way (collMod)
 *   npm run db:validator -- --force -> if your database user is not allowed to run collMod, rebuild the collection instead:
 *                                      rename products -> products_backup_<date>, create a new products collection with the new
 *                                      validator, copy every document across ($merge, ids preserved), recreate indexes.
 * The backup collection is kept so you can drop it yourself once you have checked the result.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { getDb, PRODUCT_VALIDATOR, validatorStatus, ensureIndexes } from "../lib/mongodb";

async function main() {
  const db = await getDb();
  const st = await validatorStatus(db);
  if (st.ok) { console.log("The products validator is already up to date. Nothing to do."); process.exit(0); }
  console.log("Validator is outdated. Trying: collMod ...");
  try {
    await db.command({ collMod: "products", validator: PRODUCT_VALIDATOR, validationLevel: "moderate", validationAction: "error" });
    console.log("Done: validator updated with collMod."); process.exit(0);
  } catch (e) { console.log(`collMod was refused: ${(e as Error).message}`); }
  if (!process.argv.includes("--force")) {
    console.log("\nYour database user is not allowed to change validators. Choose ONE:\n  A) Atlas > Database Access > Edit your user > Built-in Role: 'Atlas admin' (temporarily), then run this command again, then switch the role back.\n  B) Run:  npm run db:validator -- --force   (renames products to a backup, recreates it with the new validator, copies all documents).");
    process.exit(2);
  }
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const backup = `products_backup_${stamp}`;
  const before = await db.collection("products").countDocuments();
  console.log(`Renaming products (${before} documents) to ${backup} ...`);
  await db.collection("products").rename(backup);
  await db.createCollection("products", { validator: PRODUCT_VALIDATOR, validationLevel: "moderate", validationAction: "error" });
  await db.collection(backup).aggregate([{ $match: {} }, { $merge: { into: "products", on: "_id", whenMatched: "keepExisting", whenNotMatched: "insert" } }]).toArray();
  const after = await db.collection("products").countDocuments();
  console.log(`Copied ${after} of ${before} documents.`);
  if (after !== before) { console.error(`Count mismatch! Your original data is safe in ${backup}. Do not delete it. Tell your supervisor / ask for help.`); process.exit(1); }
  await ensureIndexes(db);
  console.log(`Done. New validator active and indexes rebuilt. The old data is kept in ${backup}; drop it later when you are happy.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
