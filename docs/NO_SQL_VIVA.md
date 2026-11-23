# Viva guide: model answers

**Why MongoDB?** Product data is variable: different nutrients per product, lists of ingredients, extra OCR metadata. A document holds a whole product so one indexed read returns everything, and I can add fields without migrations. It also gave me upserts, text search, aggregation and schema validation in one system.

**Why NoSQL?** The data is document-shaped and read-heavy, has no complex multi-table transactions, and benefits from flexible schema and horizontal scaling.

**Why not MySQL?** It would work, but nutrition would be many sparse columns or an EAV table needing joins, ingredients and allergens would need child tables, and every new field needs `ALTER TABLE`. I would choose MySQL for banking-style transactions.

**Why embedded nutrition?** It is always read with the product, never queried alone, and has a bounded size, so embedding means one read and atomic updates.

**Why arrays?** Ingredients and allergens are ordered, variable-length lists. Arrays can be indexed (multikey) and queried with `$in`.

**How is a new product added?** Scan -> not in MongoDB -> Open Food Facts -> normalise to my schema -> validate -> `updateOne(..., {upsert:true})` into `products` -> score computed and upserted into `product_analysis`. If OFF has nothing, the user photographs the label, OCR text is parsed and verified, then it is saved with `source.type = "ocr"`.

**What happens after barcode scanning?** The browser validates the check digit and calls `GET /api/products/:barcode`. The server does `findOne({barcode})`. On a hit it returns the product and its cached analysis; on a miss it goes to OFF as above. It also records a `scan_history` row.

**How does MongoDB communicate with Android?** It doesn't. The phone talks HTTPS to my Next.js API; the API uses the MongoDB driver with the Atlas connection string.

**Why shouldn't Android connect directly to MongoDB?** Credentials would be inside the app (extractable), anyone could read or delete data, there'd be no validation or rate limiting, and the schema would be coupled to every installed app version.

**What is an upsert?** An update that inserts if nothing matches. `updateOne(filter, update, {upsert:true})`. It makes ingestion idempotent and avoids a race between "check then insert". `$setOnInsert` sets `createdAt` only for new documents.

**What are indexes?** B-tree structures that avoid scanning every document. `barcode` unique index turns scans into an index lookup (`IXSCAN`) and prevents duplicates. Trade-off: extra storage and slower writes.

**What is aggregation?** A pipeline of stages (`$match`, `$lookup`, `$unwind`, `$group`, `$project`) processed on the server. I use it to find alternative candidates with their scores, and to build history/saved lists with product details.

**How does OCR work?** Browser canvas preprocessing, Tesseract.js produces lines with confidence, my parser extracts nutrients with regexes, converts units (kJ->kcal, salt->sodium, serving->per 100 g), validates (sat fat <= fat), and flags confidence under 0.6 for the user to verify.

**Where is AI used?** Optionally, to explain ingredients missing from my knowledge base. Labelled "AI note", excluded from the score, no legal claims.

**Why isn't AI generating the score?** Scores must be reproducible, explainable, and testable. An LLM is non-deterministic, can hallucinate, and cannot show its arithmetic. My engine lists every point gained or lost.

**How do alternatives work?** An aggregation selects same-profile, same-category products that have analyses; metrics are min-max normalised, "lower is better" ones inverted, and a weighted sum using the user's priorities ranks them. Only products that beat the current one are shown, with reasons like "35% less sodium".

**How is country regulation represented?** A `regulations` collection with `ingredientKey`, `country`, `status` (`allowed|restricted|banned|unknown`), `reason`, `authority`, `sourceUrl`, `verifiedAt`. A product's country status is rolled up from its ingredients; no record means `unknown`, never `allowed`. My seed set is small and marked unverified.
