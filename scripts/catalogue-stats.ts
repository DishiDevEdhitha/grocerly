/** Usage: npm run catalogue:stats  - quick health report of the product catalogue (great for demos and your viva). */
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { getDb, col } from "../lib/mongodb";
(async () => {
  const db = await getDb(); const c = col.products(db);
  const group = async (field: string) => (await c.aggregate([{ $group: { _id: field, n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 15 }]).toArray()).map((r) => `${r._id ?? "(none)"}: ${r.n}`).join(" | ");
  console.log(`Products: ${await c.countDocuments()}`);
  console.log(`By status:       ${await group("$catalogStatus")}`);
  console.log(`By source:       ${await group("$source.type")}`);
  console.log(`By department:   ${await group({ $arrayElemAt: ["$categoryPath", 0] } as never)}`);
  console.log(`By confidence:   ${await group("$confidence.overall")}`);
  console.log(`Top brands:      ${await group("$brand")}`);
  console.log(`With image: ${await c.countDocuments({ image: { $exists: true, $ne: "" } })} | with 3+ core nutrients (active): ${await c.countDocuments({ catalogStatus: "active" })}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
