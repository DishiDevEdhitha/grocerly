# MongoDB database guide

## 1. Why MongoDB
Packaged-food data is **heterogeneous**: one product lists 6 nutrients, another 14; ingredients are variable-length lists; allergen declarations vary; OCR adds confidence metadata. A document model stores each product as one self-contained JSON-like document. Reading a product is one lookup with no joins, new fields need no migration, and arrays/embedded objects map directly to the data.

## 2. Vocabulary
| Term | Meaning | In Grocerly |
|---|---|---|
| Database | Container of collections | `grocerly` |
| Collection | Group of documents (like a table, without a fixed schema) | `products` |
| Document | One BSON record | one product |
| Field | Key/value in a document | `name`, `nutrition.sodium` |
| Index | Structure that makes queries fast | `barcode_unique` |
| Query | Read with a filter | `find({category:"Chips"})` |
| Aggregation | Multi-stage pipeline (`$match`, `$lookup`, `$group`...) | alternatives, history |

## 3. MongoDB Atlas free cluster (step by step)
1. Go to mongodb.com/atlas, create an account.
2. **Create** a deployment, choose the free **M0** tier, a region near you (e.g. Mumbai `ap-south-1`), name it `grocerly-cluster`.
3. **Database Access > Add New Database User**: username `grocerly_app`, generate a password, role **Read and write to any database** (or restrict to `grocerly`). Save the password. Avoid `@ : / ?` in it, or URL-encode them.
4. **Network Access > Add IP Address**: add your current IP for local work. Vercel uses changing IPs, so for deployment add `0.0.0.0/0` (allow from anywhere). This is acceptable for a coursework demo **because** the database is protected by the user/password and TLS; for production use Vercel's secure-connectivity options or a private network.
5. **Database > Connect > Drivers > Node.js**: copy the string `mongodb+srv://grocerly_app:<password>@grocerly-cluster.xxxxx.mongodb.net/?retryWrites=true&w=majority`.
6. Create `.env.local`:
```env
MONGODB_URI=mongodb+srv://grocerly_app:YOUR_PASSWORD@grocerly-cluster.xxxxx.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=grocerly
```
7. `npm run dev`, open `/api/health`.

The database and collections are created automatically on the first request (`lib/mongodb.ts > ensureIndexes`) or with `npm run db:indexes`. MongoDB creates a database lazily when the first collection is created.

## 4. Collections and example documents

**products** (embedded nutrition, arrays for ingredients/allergens)
```json
{
  "_id": "ObjectId(...)", "barcode": "8901058852370", "name": "Masala Noodles", "brand": "Maggi",
  "category": "Instant noodles", "categoryTags": ["en:meals","en:instant-noodles"], "profile": "noodles",
  "quantity": {"value": 70, "unit": "g"},
  "nutritionBasis": {"amount": 100, "unit": "g"},
  "nutrition": {"calories": 430, "protein": 9, "sodium": 1500},
  "nutritionMeta": {"sodium": {"confidence": 0.9, "source": "openfoodfacts"}},
  "ingredients": ["noodles", "wheat flour", "palm oil", "salt"],
  "allergens": {"declared": ["en:gluten"], "traces": ["en:milk"]},
  "source": {"type": "openfoodfacts", "confidence": 0.8, "fetchedAt": "ISODate(...)"},
  "createdAt": "ISODate(...)", "updatedAt": "ISODate(...)"
}
```
**product_analysis**: `productId` (reference), `score`, `scoreVersion`, `nutritionScore`, `ingredientScore`, `penalties`, `positives`, `warnings`, `reasons`, `generatedAt`, plus `ingredientInsights`, `allergenReport`, `regulatory`.
**ingredients**: `name`, `normalizedName`, `category`, `type`, `allergen`, `riskLevel`, `description`, `synonyms`, `eNumber`.
**regulations**: `ingredientKey`, `ingredientId`, `country`, `status` (`allowed|restricted|banned|unknown`), `reason`, `authority`, `sourceUrl`, `verifiedAt`, `verification`.
**submissions**: `submissionId`, `barcode`, `rawOCR`, `extractedNutrition`, `extractedIngredients`, `confidence`, `processingStatus`, `createdAt`.
**users**: `userId`, `createdAt`, `lastSeenAt`. **scan_history**: `userId`, `productId`, `method`, `scannedAt`. **saved_products**: `userId`, `productId`, `savedAt`.

### Embedding vs referencing
- **Embedded**: `nutrition`, `quantity`, `source`, `allergens`: always read with the product, never queried alone.
- **Referenced**: `product_analysis.productId`, `scan_history.productId`, `saved_products.productId`: they change at different rates (analysis is recomputed when the score version changes; history grows without bound), so they get their own collections and are joined with `$lookup`.

## 5. Indexes (created in `lib/mongodb.ts`)
| Collection | Index | Why |
|---|---|---|
| products | `{barcode:1}` **unique, partial** (`barcode` is a string) | O(log n) scan lookup; stops duplicate barcodes while still allowing photo-only products with `barcode:null` |
| products | `{name:1}`, `{brand:1}`, `{category:1}` | filters and prefix searches |
| products | `{profile:1, categoryTags:1}` | candidate selection for alternatives |
| products | text index on `name`, `brand`, `ingredientsText` (weights 10/5/1) | ranked `$text` search |
| product_analysis | `{productId:1, scoreVersion:1}` unique | one analysis per product per version |
| scan_history | `{userId:1, scannedAt:-1}` | "recent scans" without a sort in memory |
| saved_products | `{userId:1, productId:1}` unique | no duplicate saves |
Check with `db.products.find({barcode:"..."}).explain("executionStats")`: you should see `IXSCAN` (not `COLLSCAN`) and `totalDocsExamined: 1`.

## 6. CRUD examples (mongosh)
```javascript
use grocerly
// READ
db.products.findOne({ barcode: "8901058852370" })
db.products.find({ "nutrition.sodium": { $gt: 600 }, profile: "chips_snacks" }, { name: 1, "nutrition.sodium": 1 }).sort({ "nutrition.sodium": -1 }).limit(10)
db.products.find({ $text: { $search: "maggi masala" } }, { score: { $meta: "textScore" } }).sort({ score: { $meta: "textScore" } })
// INSERT
db.products.insertOne({ barcode: null, name: "Home snack", nutrition: {}, ingredients: [], source: {type:"manual", confidence: 0.7}, createdAt: new Date(), updatedAt: new Date() })
// UPDATE (one field, with operators)
db.products.updateOne({ barcode: "8901058852370" }, { $set: { "nutrition.sodium": 1400, updatedAt: new Date() } })
db.products.updateMany({ profile: "default" }, { $push: { categoryTags: "unreviewed" } })
// REPLACE (whole document except _id)
db.products.replaceOne({ barcode: "8901058852370" }, { /* full new document */ })
// DELETE
db.products.deleteOne({ barcode: null, name: "Home snack" })
db.scan_history.deleteMany({ scannedAt: { $lt: new Date(Date.now() - 90*864e5) } })
```

## 7. Upsert (used on every ingestion)
```javascript
db.products.updateOne(
  { barcode: "8901058852370" },                      // filter
  { $set: { name: "Masala Noodles", updatedAt: new Date() },
    $setOnInsert: { createdAt: new Date() } },       // only applied if a new doc is created
  { upsert: true }                                   // insert when no match, update when there is one
)
```
`upsert: true` makes the operation **idempotent**: scanning the same barcode twice, or re-running `npm run seed -- maggi`, updates instead of duplicating. Combined with the unique barcode index it is also safe under concurrent requests. See `upsertProduct` in `lib/products.ts` (it also refuses to overwrite user-verified OCR/manual data with external data).

## 8. Aggregation examples
Average score per category:
```javascript
db.product_analysis.aggregate([
  { $match: { score: { $ne: null } } },
  { $lookup: { from: "products", localField: "productId", foreignField: "_id", as: "p" } },
  { $unwind: "$p" },
  { $group: { _id: "$p.category", avgScore: { $avg: "$score" }, n: { $sum: 1 } } },
  { $sort: { avgScore: -1 } }
])
```
Recent scans for a user with product names (see `app/api/history/route.ts`) and candidate lookup for alternatives (`lib/alternatives.ts`) use `$match` -> `$lookup` -> `$unwind` -> `$project`.

Most-scanned products:
```javascript
db.scan_history.aggregate([{ $group: { _id: "$productId", scans: { $sum: 1 } } }, { $sort: { scans: -1 } }, { $limit: 5 }])
```

## 9. Data validation
`products` has a `$jsonSchema` validator (`PRODUCT_VALIDATOR`): requires `name`, `nutrition`, `ingredients`, `source`, timestamps; `source.type` must be one of `openfoodfacts|ocr|manual|ai`; confidence 0..1. Inserting an invalid document throws error code 121 (the API returns 422). Application-level validation (barcode check digit, numeric nutrition cleaning, OCR plausibility) happens before the database. Validation is applied in two layers on purpose.

## 10. Ingestion flows
- **External data**: OFF JSON -> `normalizeOffProduct` -> validate -> `upsertProduct` -> `getOrComputeAnalysis`.
- **OCR data**: text lines -> `submissions` (raw evidence, `processingStatus: parsed`) -> user-verified -> `products` (`source.type: ocr`) -> submission marked `accepted`.
- **Analysis**: stored in `product_analysis`; recomputed if `scoreVersion` changes or the product was updated after `generatedAt`.
- **History / saved**: one row per view with a method; saved uses an upsert on `(userId, productId)`.
- **Regulations**: `npm run seed:kb` upserts sourced rows. Missing = `unknown`, never `allowed`.

## 11. Security
- `MONGODB_URI` is only read in server code; never prefixed with `NEXT_PUBLIC_`; `.env.local` is git-ignored.
- App user has only the permissions it needs. Rotate the password if it ever leaks (including in git history).
- The browser has no database driver; every request goes through validated API routes. Regex input in search is escaped to prevent ReDoS/regex injection; ids are validated as 24-hex before `new ObjectId()`.

## 12. Backup and restore
Atlas M0 has no automated backups. Take manual dumps:
```bash
mongodump --uri "$MONGODB_URI" --db grocerly --out backup/
mongorestore --uri "$MONGODB_URI" --nsInclude "grocerly.*" backup/
```
Because products are re-fetchable from Open Food Facts, the critical data to back up is `submissions`, user-verified products, `regulations`, and user collections.

## 13. Scalability talking points
Indexed lookups stay fast as products grow; Atlas can scale up to dedicated clusters and **sharding** (a good shard key would be a hashed `barcode`); documents are self-contained so reads rarely need joins.

## 14. Why a relational schema is less convenient here
Nutrition would need either ~15 sparse nullable columns, or an EAV table (`product_id, nutrient, value`) requiring many joins per product read; ingredients and allergens need child tables; adding a new nutrient or provenance field means `ALTER TABLE` and migrations. In MongoDB these are embedded fields and arrays. (Relational databases remain better for strict multi-table transactions and complex reporting joins; Grocerly does not need those.)

## 15. Troubleshooting
See `TROUBLESHOOTING.md`.
