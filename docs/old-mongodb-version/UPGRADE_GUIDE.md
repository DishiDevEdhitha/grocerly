---
title: "Grocerly Upgrade Guide"
subtitle: "From the working student project to an Indian packaged-food catalogue: every change explained, step by step"
---

# Part 0. Read this first

## What this guide is

This guide describes the **actual changes** made to your current Grocerly project (the version that is already on Vercel and installed on your phone). It does not describe a new project. Everything that worked before still works: barcode scan, search, product analysis, scoring, comparison, history, saved items, the cart screenshot, regulations, alternatives, the PWA.

## How the changes are delivered

The upgraded project is the ZIP file **grocerly-complete.zip**. It is your own project with the changes already applied. This guide explains each change so you understand it, and tells you how to apply and run it.

For each of the 15 steps in Part 4 you get:

1. What we are changing
2. Why
3. Which files
4. Where in those files
5. The key code (the important functions are shown; the complete files are in the ZIP, and each step tells you exactly which file to open)
6. The command to run
7. What you should see
8. A simple test to prove it worked
9. What to do if it fails

> **Why not paste every line of every file into this document?** The upgrade touches about 60 files and roughly 6,000 lines. Retyping that by hand would create typos, and the ZIP already contains the exact, tested code (101 automated tests pass and the production build succeeds). Copying a few key functions here shows you *how it works*; copying the files from the ZIP *guarantees it works*.

## What was and was not verified

Honesty matters for a project you will present, so here is the exact status.

| Verified in my environment | Not verifiable from here (you will verify it in Part 4 and Part 7) |
|---|---|
| TypeScript compiles with no errors | Connection to **your MongoDB Atlas** database |
| 101 automated tests pass (taxonomy, identity, merging, levels, search understanding, comparison, import validation, dataset mapping, Gemini output validation, upload validation, image quality, link safety) | Real **Open Food Facts** responses (my sandbox cannot reach it) |
| The production build succeeds (all pages and 14 API routes) | A real **Gemini** call (needs your key) |
| The server starts and routes answer, with clear errors when the database or key is missing | The **Mendeley dataset's real column names** (the importer detects them and shows you in a dry run) |
| | Your **Android** app |

## Before you start

- Your existing working project folder (this guide uses `C:\grocerly`).
- A working internet connection and your `.env.local` file (it already contains `MONGODB_URI`).
- About 2 to 3 hours the first time (most of it is waiting for imports).
- Command Prompt (not PowerShell) for every command.

> **Never paste secret keys into chat, into GitHub or into code files.** Keys go only into `.env.local` (your computer) and Vercel Environment Variables (the server).

# Part 1. How the whole system works, in plain words

## 1.1 The big picture

Think of Grocerly as a **grocery shop**.

| Real shop | Grocerly | Plain meaning |
|---|---|---|
| The customer | The app on your phone | Asks questions: "tell me about this packet" |
| The shop counter | The **API** (Next.js on Vercel) | Takes the question, checks things, replies |
| The shop's main cupboard | **MongoDB** (Atlas) | Stores every product Grocerly knows. This is Grocerly's own catalogue |
| A wholesaler you call when the cupboard is missing something | **Open Food Facts** | A free public food database used to fill gaps |
| A clerk who can read labels from photos | **Gemini** | Reads a label photo and writes down what it says. It does not judge the food |
| The shop's rulebook | The **analysis engine** | Fixed rules that calculate the score, levels, allergens |

The most important idea: **MongoDB is the shop's own cupboard. Open Food Facts and Gemini only help to stock it.** Customers are served from the cupboard.

## 1.2 Diagram 1: System architecture

```
 ┌────────────────────────┐
 │  ANDROID PHONE         │  Grocerly app (PWA / APK) shows screens
 └───────────┬────────────┘
             │ HTTPS requests (JSON)
             ▼
 ┌────────────────────────────────────────────────────────────┐
 │  VERCEL: Next.js application                               │
 │   pages (screens)         /api/* routes (the "counter")    │
 │                                                            │
 │   lib/ (the rules)                                         │
 │   search · taxonomy · identity · levels · score ·          │
 │   importer · similar · gemini-label · links · rate-limit   │
 └───────┬───────────────────┬───────────────────┬────────────┘
         │                   │                   │
         ▼                   ▼                   ▼
 ┌───────────────┐  ┌──────────────────┐  ┌──────────────────┐
 │ MONGODB ATLAS │  │ OPEN FOOD FACTS  │  │ GEMINI (Google)  │
 │ Grocerly      │  │ gap-filler data  │  │ reads label      │
 │ catalogue     │  │ (India filter)   │  │ photos only      │
 └───────────────┘  └──────────────────┘  └──────────────────┘
```

**In simple language:** the phone only ever talks to Vercel. Vercel talks to MongoDB for almost everything. It talks to Open Food Facts only when you ask it to look wider, and to Gemini only when you upload label photos. The phone never holds any secret.

## 1.3 Diagram 2: Database architecture

```
 grocerly (database)
 │
 ├── products ─────────── the catalogue: one document per product (extended, not replaced)
 │      embeds: nutrition{}, nutritionPerServing{}, servingSize{}, sources[], confidence{},
 │              categoryPath[], searchTokens[], dietary{}, purchaseLinks{}, images{}
 │
 ├── product_analysis ─── the score, reasons, allergens, country status   ──▶ productId
 ├── ingredients ───────── knowledge base (what each additive is)
 ├── regulations ───────── country rules with source and date
 ├── submissions ───────── evidence: label text / AI JSON for each upload   (reused for Gemini)
 ├── scan_history ──────── who looked at what                                ──▶ productId
 ├── saved_products ────── saved lists                                       ──▶ productId
 ├── users ─────────────── anonymous device ids
 └── rate_limits ───────── NEW: request counters with automatic expiry (TTL)
```

**In simple language:** every product is one self-contained "card" in `products`. Other collections point back to a product by its id. `rate_limits` is the only brand-new collection, and it exists only to stop abuse (see Step 14).

## 1.4 Diagram 3: Search flow

```
 user types "maggi noodles"
        │
        ▼
 tokenize + fix spelling ───────────▶ ["maggi","noodle"]
        │
        ▼
 UNDERSTAND the query
   • is a word a known brand?   (list of brands from MongoDB)   ─▶ brand = maggi
   • is a word a category?      (taxonomy)                      ─▶ noodles = Instant Noodles, Cup Noodles
   • anything left over?        ─▶ must appear in the product name
        │
        ▼
 MongoDB query on indexes:  catalogStatus=active, brandNorm=maggi, categoryPath in [...]
        │
        ▼
 RANK in code: brand match + exact product type + name match + data quality + has image
        │
        ▼
 build CHIPS from the products found (All | Instant Noodles | Cup Noodles ...)
        │
        ▼
 filters / sort / 12 per page ──▶ cards on the phone
        │
   (only if the user taps "Look wider"): Open Food Facts, India only, quality gate, then saved
```

**In simple language:** instead of "find any product whose text contains the word", Grocerly first works out *what you mean* (a brand? a kind of food?) and then asks MongoDB precisely for that. Chips are not typed by hand; they are counted from the real results.

## 1.5 Diagram 4: Product import flow

```
  Source file / API page
        │ read rows
        ▼
  MAP columns to Grocerly fields    (dataset-mapper.ts / normalize.ts)
        │
        ▼
  NORMALISE: units, pack size, serving size, brand, category path
        │
        ▼
  VALIDATE: name? numbers sensible? protein <= 100? sat fat <= fat?
        │     bad value dropped, record kept; bad record counted as invalid
        ▼
  DE-DUPLICATE inside the file  ──▶ merge by source priority
        │
        ▼
  DE-DUPLICATE against MongoDB  ──▶ same barcode, or same brand+type+name+PACK SIZE
        │
        ▼
  UPSERT (insert or merge)  +  compute analysis (score, allergens ...)
        │
        ▼
  STATISTICS report  (read / valid / invalid / duplicates / inserted / updated / hidden)
```

**In simple language:** nothing is dumped blindly. Each row is checked, cleaned, compared with what Grocerly already has, merged carefully, then counted in a report you can read.

## 1.6 Diagram 5: Gemini label-analysis flow

```
  phone: take / choose up to 3 photos
        │  (phone checks size, orientation, blur, darkness)
        ▼
  resize to <=1600 px JPEG
        │ POST /api/label/analyze
        ▼
  SERVER: check file signature, size, rate limit
        │
        ▼
  GEMINI (key stays on server) ──▶ structured JSON with null for anything unclear
        │
        ▼
  VALIDATION (our code):
     • each number must appear in the text Gemini says it read
     • convert units (kJ→kcal, salt→sodium, serving→per 100 g)
     • range and consistency checks
     • confidence capped
        │
        ▼
  USER REVIEW SCREEN: values + highlights, user fixes anything wrong
        │ confirm
        ▼
  /api/products/submit ──▶ merge into MongoDB (lower priority than dataset / Open Food Facts)
        │
        ▼
  Grocerly analysis engine ──▶ deterministic score
```

**In simple language:** Gemini is a fast reader. Our code checks its homework. You approve it. Only then is anything saved, and the score is always calculated by fixed rules.

## 1.7 Diagram 6: Comparison flow

```
  open "Amul Processed Cheese"
        │
        ▼
  read its identity:  Dairy > Cheese > Processed Cheese , brand Amul , pack 200 g
        │
        ▼
  MongoDB: active products in the same CATEGORY (Cheese) with an analysis
        │
        ▼
  RULES:  must have 3+ nutrition values and a score; not the same product
        │
        ▼
  RANK:  same product type +50 · different brand +15 · similar pack +10 · data completeness +15
        │
        ▼
  max 2 per brand ──▶ suggestions ──▶ user adds 2 to 4 ──▶ side-by-side table, best value marked
```

**In simple language:** Grocerly only suggests products you can fairly compare, and shows different brands first.

## 1.7b Diagram 7: Deployment flow

```
  your laptop (C:\grocerly)
     │  git add . / git commit / git push
     ▼
  GitHub repository (main branch)
     │  Vercel notices the push
     ▼
  Vercel builds and deploys  ── uses Environment Variables (MONGODB_URI, GEMINI_API_KEY ...)
     │
     ▼
  Production URL  https://your-app.vercel.app
     │
     ├──▶ Phone browser / installed web app  → loads the new version automatically
     └──▶ APK:  depends on how it was made (Part 6)
```

# Part 2. MongoDB explained (Grocerly's main cupboard)

## 2.1 Vocabulary

- **Database**: the whole cupboard (`grocerly`).
- **Collection**: one shelf (for example `products`).
- **Document**: one item on a shelf, one product, stored as a flexible JSON-like record.
- **Field**: one piece of information (`name`, `brand`).
- **Index**: a shortcut list so MongoDB finds things quickly instead of looking at everything.

## 2.2 What a product looks like now (catalogue v2)

```json
{
  "_id": "ObjectId(...)",
  "barcode": "8901262010030",
  "name": "Amul Processed Cheese",
  "brand": "Amul",
  "category": "Processed Cheese",
  "categoryPath": ["Dairy", "Cheese", "Processed Cheese"],
  "productType": "Processed Cheese",
  "quantity": { "value": 200, "unit": "g" },
  "servingSize": { "value": 20, "unit": "g", "text": "20 g" },
  "nutritionBasis": { "amount": 100, "unit": "g" },
  "nutrition":           { "calories": 305, "protein": 21, "fat": 24, "saturatedFat": 15, "sugars": 2, "sodium": 880 },
  "nutritionPerServing": { "calories": 61, "protein": 4.2, "sodium": 176 },
  "nutritionMeta": { "protein": { "confidence": 0.9, "source": "dataset", "corroborated": true } },
  "ingredients": ["cheese", "water", "emulsifier (e331)"],
  "ingredientsText": "Cheese, water, emulsifying salts (331)...",
  "allergens": { "declared": ["en:milk"], "traces": [] },
  "dietary": { "vegetarian": true },
  "image": "https://images.openfoodfacts.org/...front_en.400.jpg",
  "imageSmall": "https://images.openfoodfacts.org/...front_en.200.jpg",
  "purchaseLinks": { "blinkit": "https://blinkit.com/prn/amul-processed-cheese/prid/..." },
  "sources": [
    { "source": "dataset", "name": "Indian Packaged Foods Nutritional Composition Dataset (2026)", "confidence": 0.9, "license": "CC BY 4.0" },
    { "source": "openfoodfacts", "name": "Open Food Facts", "confidence": 0.7, "license": "ODbL / CC BY-SA (images)" }
  ],
  "source": { "type": "dataset", "confidence": 0.9 },
  "confidence": { "nutrition": "verified", "ingredients": "high", "allergens": "medium", "overall": "medium" },
  "brandNorm": "amul", "nameNorm": "processed cheese",
  "identityKey": "bc:8901262010030",
  "searchTokens": ["amul", "processed", "cheese", "dairy"],
  "qualityScore": 95,
  "catalogStatus": "active",
  "createdAt": "ISODate(...)", "updatedAt": "ISODate(...)"
}
```

### Where each piece of information comes from and where it is stored

| Information | Comes from | Stored in |
|---|---|---|
| Name, brand, barcode, pack size | Dataset, Open Food Facts, or the user's label photo | `products` |
| Category path and product type | Grocerly's own taxonomy (computed from the name and tags) | `products.categoryPath`, `productType` |
| Nutrition per 100 g | Dataset > Open Food Facts > Gemini > user | `products.nutrition` |
| Nutrition per serving | Same sources, kept separately and never mixed | `products.nutritionPerServing` |
| Ingredients | Same sources | `products.ingredients`, `ingredientsText` |
| Image | Open Food Facts front-of-pack photo only | `products.image`, `imageSmall` |
| Score, reasons, allergens, country status | Calculated by Grocerly's engine | `product_analysis` |
| Raw label text and AI output | The upload | `submissions` |
| Who scanned what | The app | `scan_history` |

## 2.3 Source and provenance

Every product keeps a list `sources[]`: which source gave data, how confident we are, a link, and the licence. Nutrition values also remember their own source in `nutritionMeta`. Nothing is anonymous.

**Source priority (who wins a disagreement):**

| Priority | Source | Number in `lib/catalogue.ts` |
|---|---|---|
| 1 | Grocerly's own verified data (reserved for future admin tools) | highest |
| 2 | Trusted Indian dataset | 80 |
| 3 | Open Food Facts | 60 |
| 4 | Gemini reading (after the user confirms) | 40 |
| 5 | Text reader / typed by a user | 35 / 30 |

A lower source **can fill a blank but can never overwrite** a value from a higher source. If two sources agree (within 5%) on a nutrient, that nutrient is marked `corroborated`; three or more corroborated nutrients upgrade the nutrition confidence to **verified**.

## 2.4 Duplicates

Two records are "the same product" only if:

- they have the same **barcode**, or
- (no barcode) the same **brand**, the same **product type**, a near-identical **name core** (name without brand and pack words), and the same **pack size**.

So *Amul Cheese 200 g* and *Amul Cheese 1 kg* stay separate, and *Maggi Masala Noodles* never merges with *Maggi Cup Noodles*. The barcode also has a **unique index**, so MongoDB itself blocks a second copy.

## 2.5 Status: who appears in search

`catalogStatus` is the quality gate:

- **active**: Indian-origin, has a brand and name, and at least 3 of the 6 core nutrients. Appears in search, popular products, alternatives and comparison.
- **needs_review**: Indian-origin but incomplete. Can still be opened by scanning, but is hidden from search.
- **hidden**: not Indian-origin (for example a German "Maggi Würze" scanned by someone). Stored so a scan is fast next time, never shown in search.

## 2.6 Confidence levels

`verified` (two sources agree), `high`, `medium`, `low`, `unknown`. They are shown as badges next to Nutrition, Ingredients and Allergens, and are the reason AI-read values show *medium* until a person confirms them.

# Part 3. Gemini explained

**Why Gemini?** Open Food Facts and the dataset will never contain every Indian product. When a product is missing, the fastest way to add it is a photo of the pack. Reading a label photo (curved plastic, small print, many languages) is something Gemini does far better than a basic text reader.

**What Gemini does:** looks at up to 3 photos (front, ingredients, nutrition table) and returns structured JSON: product name, brand, pack size, serving size, ingredient text, declared allergens, veg mark, and one row per nutrient with the printed text.

**What Gemini does NOT do:** it never gives a score, never says "healthy", never decides a country's rules, never overwrites better data, and never saves anything by itself.

## How made-up numbers are prevented

1. **Nulls are allowed.** The instructions say "if not clearly visible, return null; never guess or calculate".
2. **Evidence per row.** Gemini must copy the exact printed text for each nutrient (`"Sodium 620 mg"`).
3. **Evidence check.** Our code rejects a number that does not literally appear in that text. (The test "drops a number that is NOT in the text the model says it read" proves it.)
4. **Units and ranges.** kJ becomes kcal, salt becomes sodium, per-serving becomes per-100 g only when the serving size is known; impossible values are dropped.
5. **Consistency checks.** Saturated fat above total fat, sugars above carbohydrates, and so on are highlighted for you.
6. **Capped confidence.** AI-read values never exceed 85% and are labelled medium until you confirm them.
7. **Human confirmation.** Nothing is saved until you check the review screen.
8. **Low priority.** Even after saving, Gemini-sourced data cannot overwrite dataset or Open Food Facts data.
9. **Not in the score.** The score is calculated from the confirmed numbers by fixed rules.

## How the API key is protected

- It exists only as `GEMINI_API_KEY` in `.env.local` (your laptop) and in Vercel Environment Variables (the server).
- It is read only in `lib/gemini-label.ts` and `lib/ai.ts`, which run on the server.
- It has no `NEXT_PUBLIC_` prefix, so it is never included in the phone's JavaScript.
- It is sent in an HTTP header, never in a URL, and is never logged.
- `.env.local` is in `.gitignore`, so it never reaches GitHub.
- If it ever leaks, delete it in Google AI Studio and create a new one.

# Part 4. The changes, step by step

> **Order matters.** Do the steps in order. Every command is typed in **Command Prompt**, inside your project folder (the prompt ends in `grocerly>`). To open it: press the Windows key, type `cmd`, press Enter, then `cd C:\grocerly`.

## Step 0. Back up, then put the upgraded files into your project

**What:** replace your project's source files with the upgraded ones, keeping your secrets and your installed libraries.
**Why:** the upgrade is delivered as a complete project; copying over the top is the safest way to keep your `.env.local`, your `node_modules` and your Git history.
**Files:** the whole project, except `.env.local`, `node_modules`, `.git`, `.next`.

**Commands** (replace the first path with where you unzipped the new ZIP):

```
cd C:\
xcopy C:\grocerly C:\grocerly_backup /E /I /Q
robocopy C:\Users\YOU\Downloads\grocerly-complete\grocerly C:\grocerly /E /XD node_modules .git .next /XF .env.local
cd C:\grocerly
npm install
npm run typecheck
npm test
```

(`robocopy` prints a summary. Exit messages are fine as long as "FAILED" is 0.)

**You should see:** `npm install` finishes quickly (no new libraries were added), `typecheck` prints nothing, and `npm test` ends with `Tests  101 passed | 8 skipped`.

**Verify:** `dir C:\grocerly\lib\taxonomy.ts` shows the file. Your `.env.local` still exists (`dir C:\grocerly\.env.local`).

**If it fails:**

- "robocopy is not recognized": you are in PowerShell or a very old Windows. Open Command Prompt.
- `npm test` shows failures: send me the first failing line. Tests that mention `MONGODB_URI_TEST` are skipped on purpose.
- You overwrote `.env.local` by mistake: restore it from `C:\grocerly_backup\.env.local`.

> **New dependencies installed: none.** The CSV reader, rate limiter and image checks are written in plain TypeScript, so your install stays small.

## Step 1. Extend the database schema (catalogue v2)

**What:** add optional fields to the product record (category path, product type, serving size, per-serving nutrition, sources list, confidence, canonical image, status, purchase links) and the indexes that make them fast.
**Why:** to turn MongoDB into Grocerly's own catalogue rather than a copy of whatever Open Food Facts returned. Old products keep working because every new field is optional.
**Files:** `lib/types.ts`, `lib/mongodb.ts`, `scripts/update-validator.ts` (new), `app/api/health/route.ts`.
**Where:** in `lib/types.ts`, the `Product` interface (bottom of it); in `lib/mongodb.ts`, the function `ensureIndexes`.

**Key code**, the new fields in `Product`:

```ts
categoryPath?: string[];       // ["Dairy", "Cheese", "Processed Cheese"]
productType?: string;          // the last item of categoryPath
identityKey?: string;          // stable identity (barcode, or brand+name+type+pack)
searchTokens?: string[];       // words used by search (name, brand, type, category)
catalogStatus?: "active" | "needs_review" | "hidden";
servingSize?: { value: number; unit: "g" | "ml"; text?: string };
nutritionPerServing?: Nutrition;      // kept apart from per-100 g, never mixed
sources?: SourceEntry[];              // every source that contributed, with licence
confidence?: { nutrition; ingredients; allergens; overall };
purchaseLinks?: { blinkit?: string; zepto?: string; bigbasket?: string };
```

New indexes in `ensureIndexes`:

```ts
p.createIndex({ brandNorm: 1, catalogStatus: 1 }),
p.createIndex({ categoryPath: 1, catalogStatus: 1 }),   // multikey: matches any item of the path array
p.createIndex({ searchTokens: 1 }),
db.collection("rate_limits").createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 }),  // TTL: auto-delete
```

**Important: update the products validator.** Your `products` collection was created with an older schema rule that only allows the source types `openfoodfacts`, `ocr`, `manual`, `ai`. The upgrade adds `dataset` and `gemini`. The app tries to update the rule itself, but Atlas's normal "read and write" user is often **not allowed** to. So run:

```
npm run db:validator
```

**You should see** one of:

- `The products validator is already up to date. Nothing to do.` (finished)
- `Done: validator updated with collMod.` (finished)
- `collMod was refused ...` followed by two options. Choose one:
  - **A (simplest):** Atlas, **Database Access**, **Edit** your `grocerly_app` user, set the built-in role to **Atlas admin** for now, save, run `npm run db:validator` again, then set the role back to *Read and write to any database*.
  - **B (no role change):** run `npm run db:validator -- --force`. It renames `products` to `products_backup_<date>`, creates a new `products` collection with the new rule, copies every document across and rebuilds the indexes. It checks the counts match and keeps the backup.

Then create the indexes:

```
npm run db:indexes
```

**You should see:** a list such as `products: _id_, barcode_unique, name_1, brand_1, category_1, profile_categoryTags, products_text, brandNorm_status, categoryPath_status, searchTokens_1, identityKey_1`.

**Verify:** in Atlas, **Browse Collections**, **products**, **Indexes** tab shows those names. Start the app (`npm run dev`) and open `http://localhost:3000/api/health`: it must say `"validator":"ok"`.

**If it fails:**

- `bad auth` or `timed out`: see the connection troubleshooting in Part 9.
- `/api/health` says `"validator":"outdated"`: run the command above again and choose A or B.
- The `--force` run says "Count mismatch": stop. Your data is safe in `products_backup_<date>`; do not delete it.

## Step 2. Give products a proper category hierarchy

**What:** a category tree (Dairy, Cheese, Processed Cheese, and so on) and a classifier that places each product in it.
**Why:** to show real category chips, filter correctly and compare like with like. A product called "Maggi Masala Cup Noodles" must not land in the same place as "Maggi Ketchup".
**File:** `lib/taxonomy.ts` (new).
**Where:** the `TAXONOMY` constant at the top is the tree; `classify()` is the function.

**Key code:**

```ts
n("Dairy", [], { children: [
  n("Cheese", ["cheese", "cheddar"], { children: [
    n("Processed Cheese", ["processed cheese", "cheese block", "cheddar cheese"]),
    n("Cheese Slices",    ["cheese slice", "cheese slices"]),
    n("Mozzarella",       ["mozzarella", "pizza cheese"]),
    n("Cheese Spread",    ["cheese spread", "cream cheese"]),
    n("Cheese Cubes",     ["cheese cube", "cheese cubes"]),
  ] }),
```

The rule inside `classify()`: **the longest matching keyword wins, and a match in the product name beats a match in external tags.** That is why "Chocolate Cream Biscuits" goes to Biscuits (the keyword "cream biscuit" is longer than "chocolate").

Twelve departments are included: Dairy, Snacks, Instant Foods, Beverages, Biscuits, Chocolates & Sweets, Cereals, Spreads, Sauces & Condiments, Bakery, Frozen Food, Staples.

**Command:** `npm test -- taxonomy` (or `npm test`).
**You should see:** the `taxonomy classification` tests pass, including "distinguishes the Maggi product family".
**Verify:** the test proves Maggi Masala Noodles gives `Instant Foods > Instant Noodles`, Cup Noodles gives `Cup Noodles`, pasta gives `Pasta`, ketchup gives `Ketchup`, Würze seasoning gives `Seasonings`.
**If it fails / a product lands in the wrong category:** open `lib/taxonomy.ts`, add a keyword to the correct node (for example add `"khakhra"` to `Namkeen`), save and re-run `npm test`. Then run `npm run migrate:v2 -- --all` (Step 4) to re-classify stored products. The tree is meant to grow with your data.

> **Note on honesty:** keyword classification is imperfect. Some products will be placed in `Uncategorised`. They remain searchable by name; add keywords as you notice them.

## Step 3. Reliable product identity, duplicate handling and source merging

**What:** rules deciding whether two records are the same product, and rules for combining data from several sources.
**Why:** so that "Amul Cheese 200 g" and "Amul Cheese 1 kg" stay separate, and four copies of the same cheese never appear.
**Files:** `lib/identity.ts` (new), `lib/catalogue.ts` (new), `lib/products.ts` (function `upsertProduct`, `findDuplicate`).
**Where:** `isSameProduct()` in `identity.ts`, `mergeProducts()` in `catalogue.ts`.

**Key code:**

```ts
export function isSameProduct(a, b): boolean {
  if (a.barcode && b.barcode) return a.barcode === b.barcode;          // barcodes decide when both exist
  if (normBrand(a.brand) !== normBrand(b.brand) || !normBrand(a.brand)) return false;
  if (norm(a.productType) !== norm(b.productType)) return false;       // Cup Noodles != Instant Noodles
  if (jaccard(nameCore(a.name, a.brand), nameCore(b.name, b.brand)) < 0.85) return false;
  if (a.quantity && b.quantity) return samePack(a.quantity, b.quantity); // 200 g != 1 kg
  return !a.quantity && !b.quantity;
}
```

And in `catalogue.ts`: the higher-priority source is the base; the other only fills missing fields; agreement marks values `corroborated`.

**Command:** `npm test`
**You should see:** `product identity` and `enrich + status + merge` tests pass.
**Verify:** the tests "Amul Cheese 200 g and 1 kg are DIFFERENT products" and "a lower-priority source never overwrites a value" are green.
**If it fails:** this step is pure logic with no database, so a failure means a file was not copied correctly. Re-copy `lib/identity.ts` and `lib/catalogue.ts` from the ZIP.

## Step 4. Upgrade the products you already have (migration)

**What:** one script that gives every existing product the new fields and hides products that are not Indian or too incomplete.
**Why:** this is what removes "Maggi Würze" and other worldwide results from your search. Old records lack country information, so the script uses a reliable clue: Indian barcodes start with **890** (India's GS1 prefix). Products you added yourself from labels are kept.
**File:** `scripts/migrate-v2.ts` (new). Run it from your computer; it changes the same Atlas database that Vercel uses.

**Commands:**

```
npm run migrate:v2 -- --dry-run
npm run migrate:v2
npm run catalogue:stats
```

**You should see**, for the dry run (numbers will differ):

```
DRY RUN: 64 products processed.
Status: {"active":21,"needs_review":9,"hidden":34}
Departments: {"Instant Foods":18,"Snacks":12,"Dairy":9,...}
Examples hidden: Maggi Maggi Würze | Maggi Bouillon Cubes | ...
```

Run the real command only if the "hidden" examples look right. The second command prints the same without the word DRY RUN. `catalogue:stats` then summarises the catalogue.

**Verify:** in Atlas, **Browse Collections**, **products**, open any document: it now has `categoryPath`, `searchTokens`, `identityKey`, `catalogStatus`, `qualityScore`, `confidence`.

**If it fails:**

- `STOP: The products collection validator is from the old version...`: go back to Step 1 and run `npm run db:validator`.
- Too many Indian products are hidden: Indian items sold under a non-890 barcode are hidden until re-imported with a country tag (Step 6), which restores them automatically.
- Safe to re-run any time; `--all` recomputes everything.

## Step 5. Stop treating Open Food Facts as the whole database

**What:** four fixes to how Open Food Facts (OFF) is used.
**Why:** your old search asked OFF **worldwide** whenever Grocerly had fewer than 5 results, then **saved every result forever**. That is how German Maggi sauces entered your catalogue.
**Files:** `lib/off.ts`, `lib/normalize.ts`, `lib/products.ts`.

What changed:

1. **India-only search.** In `lib/off.ts`, the text search now adds the country filter:

```ts
const india = opts.india !== false ? "&tagtype_0=countries&tag_contains_0=contains&tag_0=india" : "";
```

2. **Search no longer auto-saves.** OFF is called only when the user taps **Look wider on Open Food Facts (India)**, it is rate-limited (20 per hour), and only products that pass the quality gate are saved.
3. **Normaliser upgraded.** `lib/normalize.ts` is the only file that knows OFF's field names. It now also reads serving size, per-serving nutrition, the vegetarian analysis, the front image, and country. A product is Indian if OFF says `en:india` **or** the barcode starts with 890.
4. **Typed errors.** `lib/off.ts` turns OFF's 429 (too many requests), 503 (unavailable), timeouts and network failures into clear messages, retrying a 503 once.

**Command:** `npm test`
**You should see:** `Open Food Facts normaliser` tests pass.
**Verify later** (Step 15): searching an unknown word and tapping *Look wider* adds only Indian products.
**If it fails:** OFF rate-limits search to about 10 requests a minute. "OFF is rate-limiting requests" simply means wait one minute. If the search returns nothing for words you know exist, tell me; the legacy country filter parameters are used and I could not call OFF from my environment to confirm them.

## Step 6. Build the Indian catalogue with import pipelines

**What:** two import scripts that fill MongoDB properly: one for the Mendeley dataset, one for Open Food Facts (India only), sharing a single pipeline.
**Why:** so the catalogue is built in bulk, cleaned and deduplicated, with a statistics report, instead of hand-typed or accidentally collected.
**Files:** `lib/importer.ts`, `lib/dataset-mapper.ts`, `lib/csv.ts`, `scripts/import-mendeley.ts`, `scripts/import-off-india.ts` (all new).

### 6a. The Mendeley dataset (clean, legal, small)

1. Open `https://data.mendeley.com/datasets/rhswn9z9xr/1` and download the data. The page lists the licence **CC BY 4.0**: you may use it **if you give credit**. The app already shows that credit on the About page and on products that use it.
2. If the file is Excel (`.xlsx`), open it, choose **File, Save As, CSV UTF-8**.
3. Save it as `C:\grocerly\data\indian-packaged-foods.csv`.

First a **dry run**: nothing is written, and the script shows how it understood the columns.

```
npm run import:mendeley -- data\indian-packaged-foods.csv --dry-run
```

**You should see** a "Detected columns" block, for example:

```
Detected columns:
  name         <- Product Name
  brand        <- Brand
  ...
Nutrient columns:
  calories       <- "Energy (kcal)"  basis=unspecified unit=kcal
  protein        <- "Protein (g)"    basis=unspecified unit=g
```

**Read this block carefully.** Check that name, brand and each nutrient column are matched correctly. If the nutrient columns say `basis=unspecified`, you must find out (on the dataset page) whether values are **per 100 g** or **per serving**, because mixing them is the exact mistake Grocerly must avoid. Then run:

```
npm run import:mendeley -- data\indian-packaged-foods.csv --basis per100
```

(or `--basis perServing`; the importer will convert using the serving size.) If you give no `--basis` and the columns are ambiguous, nutrition is **skipped** and the script warns you.

**You should see** a report like (numbers will differ):

```
Read:               852
Valid:              840
Invalid:            12
Duplicates in file: 6
Already in DB:      0
Inserted:           834
Updated (merged):   0
Dropped bad values: 3
Catalogue status:   active=790 needs_review=44 hidden=0
Report saved to data/reports/mendeley-2026-...json
```

### 6b. Open Food Facts, India only

Quick, small import (about 500 of the most-scanned Indian products, 1 to 2 minutes):

```
npm run import:off -- --pages 5 --dry-run
npm run import:off -- --pages 5
```

Larger import (up to 100 per page; the script waits about 7 seconds between pages to respect rate limits):

```
npm run import:off -- --pages 30
```

For a really big import, OFF asks users to use its data export instead of the search API. Download the JSONL export from the Data page at `world.openfoodfacts.org/data` (it is several gigabytes), put it in `data\`, then:

```
npm run import:off -- --file data\openfoodfacts-products.jsonl.gz --limit 20000
```

The script reads the file line by line, keeps only Indian products, and never loads the whole file into memory.

**Verify:**

```
npm run catalogue:stats
```

You should see counts by status, source, department, confidence and brand. In Atlas, **Browse Collections**, **products**, filter `{ "brandNorm": "amul" }` to see the products merged from several sources (`sources` has more than one entry).

**If it fails:**

- `STOP: The products collection validator ...`: Step 1.
- Mendeley "Could not find a product-name column": rename that column header to `Product Name` in the CSV and retry.
- OFF returns 0 products in API mode: use file mode instead, or tell me the exact message.
- "Open Food Facts is rate-limiting requests. Waiting 60s": normal; the script waits and retries up to 3 times.

> **Licence reminder.** Open Food Facts data is under the Open Database Licence (ODbL), which requires attribution and has a share-alike rule for derived databases. Grocerly credits OFF in the app and records each product's source and link. If you will publish or redistribute the catalogue beyond your university project, ask your supervisor about the share-alike rule. The `data/` folder is git-ignored so third-party datasets are not copied into your GitHub repository.

## Step 7. Intelligent search with category chips

**What:** a new search engine that understands brands and categories.
**Why:** "maggi" must show Maggi products; "cheese" must show actual cheese; "processed cheese" must not show everything containing "cheese".
**Files:** `lib/search-core.ts` (pure logic, new), `lib/search.ts` (database part, new), `app/api/search/route.ts` (replaced), `app/search/page.tsx` (replaced), `components/CategoryChips.tsx`, `components/ProductTile.tsx` (new).

**How it works** (see Diagram 3). The core idea, in `parseIntent`:

```ts
// "maggi noodles" -> { brand: "maggi", nodeNames: ["Instant Noodles","Cup Noodles"], freeTokens: [] }
// "cheese"         -> { nodeNames: ["Cheese"] }       // every cheese type carries "Cheese" in its path
// "processed cheese" -> { nodeNames: ["Processed Cheese"] }
// "oreo"           -> { freeTokens: ["oreo"] }        // matched against product names
```

Then MongoDB is asked only for active products matching that intent, ranking is done by `relevance()` (brand match 40, exact product type 35, name match 12 per word, plus data quality and image), and **chips are counted from the matched products** by `buildChips()`.

Also added: filters (brand, vegetarian-only), sorting (best match, highest score, most protein, lowest sodium, lowest sugar; products without that value always go last), 12 per page with **Show more**, skeleton loading, and a **Look wider** button for explicit Open Food Facts search.

**Command:** `npm run dev`, then open `http://localhost:3000/search?q=maggi`.
**You should see:** only Maggi products, with chips such as `All 14 · Instant Noodles 6 · Seasonings 3`. The chips depend on what you imported.
**Verify** with these searches:

| Search | Expected |
|---|---|
| `maggi` | Maggi products only |
| `maggi noodles` | Maggi noodles first |
| `cheese` | Cheese products from several brands, with chips such as Processed Cheese, Cheese Slices |
| `processed cheese` | Only processed cheese |
| `amul cheese` | Amul cheese only |
| `oreo` | Oreo products, not every cream biscuit |
| `maggie nodles` | Same as `maggi noodles` (spelling fixed) |

**If it fails:**

- No results for everything: the catalogue is empty or all products are hidden. Run `npm run catalogue:stats`; if `active` is 0, repeat Steps 4 and 6.
- Chips missing: chips need at least 2 different product types in the results; otherwise there is nothing to choose between.
- Slow: confirm the indexes exist (Step 1).

## Step 8. LOW / MODERATE / HIGH nutrient levels, with the reference shown

**What:** every nutrient now shows its **actual value, unit, basis (per 100 g or per 100 ml), a LOW/MODERATE/HIGH label (GOOD for protein and fibre), a coloured bar, and the reference used**.
**Why:** "Sugar 8 g" alone tells a shopper nothing.
**Files:** `lib/levels.ts`, `components/NutrientRow.tsx`, `components/LevelPill.tsx` (new), `components/ProductView.tsx` (nutrition section).
**Where:** the `RULES` array in `lib/levels.ts`.

Example of what the user sees:

```
Sugars
8 g / 100 g                                    [ MODERATE ]
Grocerly reference: ≤ 5 g = Low · 5–22.5 g = Moderate · > 22.5 g = High per 100 g
Source: UK FSA front-of-pack criteria
```

### The thresholds and where they come from

| Nutrient (per 100 g) | Low | High | Source |
|---|---|---|---|
| Sodium (mg) | ≤ 120 | > 250 | Low: UK FSA (0.3 g salt). High: FSSAI's 2026 proposal (0.625 g salt per 100 g, which is 250 mg sodium) |
| Sugars (g) | ≤ 5 | > 22.5 | UK FSA |
| Added sugars (g), shown only if the data has it | ≤ 1.5 | > 3 | High: FSSAI 2026 proposal. Low: Grocerly heuristic |
| Fat (g) | ≤ 3 | > 17.5 | UK FSA |
| Saturated fat (g) | ≤ 1.5 | > 5 | UK FSA |
| Trans fat (g) | ≤ 0.1 | > 0.5 | Grocerly heuristic |
| Energy (kcal) | ≤ 150 | > 400 | Grocerly heuristic |
| Protein (g) | < 5 = Low | ≥ 12 = Good | Grocerly heuristic |
| Fibre (g) | < 1.5 = Low | ≥ 3 = Good | EU "source of fibre" claim (3 g per 100 g) |

Drinks (per 100 ml) use separate, lower numbers listed in `lib/levels.ts`; some of those are heuristics and are labelled so.

**Be honest about these, especially in a viva:**

- They are **"Grocerly reference thresholds"**, not medical advice and not law.
- The **FSSAI front-of-pack scheme is still a proposal** and has been under court review. It is based on *added* sugar and *added* fat, while most product data only has *total* sugar and *saturated* fat. We therefore use FSSAI numbers only for salt and added sugar and the UK FSA scheme for the rest, labelling the source on every row.
- The **score** (0 to 100) still uses its own continuous ramp (`lib/scoring-config.ts`, version 1.0) and was not changed. The label says "where it sits on the reference scale"; the score says "how it compares overall".

**Per 100 g versus per serving.** If a product has serving data, the nutrition card shows two tabs: *Per 100 g* (with levels) and *Per serving (30 g)* (values only, with a note that levels are only judged per 100 g). Per-serving values are **never** compared with per-100 g thresholds.

**Command:** `npm test`, then `npm run dev` and open any product.
**You should see:** nutrition rows with a coloured pill and a bar, and `levels` tests passing.
**Verify:** a product with sodium 900 mg shows **HIGH**; 100 mg shows **LOW**; a missing value shows "Not available" (never 0).
**If it fails:** if every row says "No reference", the product has no nutrition values; add them from the label.

## Step 9. New product cards, home screen and product detail page

**What:** redesigned screens.
**Why:** to feel like a modern grocery app: images first, clean cards, categories, popular products.
**Files:** `components/ProductTile.tsx`, `components/VegMark.tsx`, `components/ConfidenceBadge.tsx` (new), `app/page.tsx` (home, replaced), `components/ProductView.tsx` (detail, replaced), `app/api/home/route.ts` (new).

**Product card shows:** the front-of-pack image (never ingredient or nutrition close-ups, and a neutral placeholder if none exists), name, brand, pack size, category, the nutrition score, up to three key indicators (sodium, sugar, fat or saturated fat, protein), a vegetarian mark **only when Open Food Facts' own analysis or the label says so**, and **View analysis**.

**Home screen:** search bar, four quick actions, **Categories** (the departments that really exist in your catalogue, with counts), **Popular products** (most opened in the last 30 days; if there is no history yet, the most complete records), **Recently analysed** (from your history).

**Detail page sections, in order:** Product information; Grocerly analysis; Nutrition (with the basis tabs and references); Ingredients (full text, "Worth a look" for additives with a caution rating, and a collapsible explanation of every ingredient); Allergens; Country status; Compare with similar products; Better alternatives; Where to buy (only if links exist); Data sources (with licences).

**Performance:** card images are lazy-loaded at the small size; lists send only light fields (no ingredient text); the home endpoint is cached for 60 seconds.

**Command:** `npm run dev`, open `http://localhost:3000`.
**You should see:** the new home screen with categories and (after Step 6) popular products.
**Verify:** open a product: you see the confidence badges, a Data sources section, and "Compare with similar products".
**If it fails:** blank images are normal for products without a front photo (placeholder shown). If the home page says "The catalogue is empty", run Steps 4 and 6.

## Step 10. Relevant product comparison

**What:** a comparison engine that suggests **comparable** products, and a better comparison table.
**Why:** your old comparison relied on you picking products by hand and on loose category matching.
**Files:** `lib/similar.ts` (new), `app/api/compare/suggest/route.ts` (new), `components/CompareTable.tsx`, `app/compare/page.tsx` (replaced), `lib/ranking.ts` (small addition: saturated fat metric).

**The rules** (in `rankSimilar`):

1. Must be in the same department **and** category (Dairy, then Cheese).
2. Must have at least 3 nutrition values and a score.
3. Never the same product (using the identity rules from Step 3).
4. Ranking: same product type +50, different brand +15, similar pack size up to +10, data completeness up to +15, same scoring profile +5.
5. At most 2 products per brand, so one brand cannot fill the list.

**UI:** add or remove products (2 to 4), **Sort by score**, a **Better option** badge on the best score, the best value in each row highlighted, LOW/MODERATE/HIGH under each nutrient, and a note that all nutrient values are per 100 g.

**Command:** `npm run dev`; open a cheese product and scroll to *Compare with similar products*.
**You should see:** other cheese brands (never noodles). Tap **Compare** on one: the compare page opens with both.
**Verify:** `npm test` shows `comparison candidates` tests green, including "does not compare Amul 200 g with Amul 1 kg as the same product".
**If it fails:** "No comparable products with enough nutrition data": import more products in that category (Step 6).

## Step 11. Gemini label reading (server side)

**What:** an API route that sends label photos to Gemini and returns validated structured data.
**Why:** to add products that no dataset contains, and to read ingredients and nutrition from the pack.
**Files:** `lib/gemini-label.ts`, `lib/image-server.ts` (new), `app/api/label/analyze/route.ts` (new), `app/api/products/submit/route.ts` (extended).

### Get your Gemini key (never paste it into chat)

1. Go to `aistudio.google.com`, sign in, click **Get API key**, create a key.
2. Open `C:\grocerly\.env.local` in VS Code and set:

```
GEMINI_API_KEY=your-key-here
GEMINI_MODEL=gemini-2.5-flash
```

3. Save. Restart `npm run dev` after any change to `.env.local`.

(Model names and free quotas change over time. If label reading later says the model was not found, open AI Studio, pick a current "Flash" model and put its name in `GEMINI_MODEL`.)

**Key code**, the request (excerpt of `extractLabelRaw`):

```ts
headers: { "Content-Type": "application/json", "x-goog-api-key": key },   // key in a header, server only
body: JSON.stringify({
  contents: [{ role: "user", parts: [{ text: INSTRUCTIONS }, ...images.flatMap(...)] }],
  generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: LABEL_SCHEMA },
}),
```

and the **evidence check** in `validateExtraction`:

```ts
if (!numbersIn(rawText).some((n) => Math.abs(n - value) < 1e-6 * Math.max(1, value))) {
  dropped.push({ nutrient, reason: "not_verifiable_against_label_text" });   // number not in the text it read: discarded
  continue;
}
```

**Upload rules enforced by the server** (`lib/image-server.ts`): at most 3 photos; only real JPEG, PNG or WebP (checked by the file's first bytes, not its name); under 2.5 MB each and about 4 MB together (Vercel's request limit); hourly limit of 8 label readings per device.

**Errors handled** (`app/api/label/analyze/route.ts`): no key set, quota used up (429), wrong key, model not found, timeout, blocked content, unreadable answer, too-large upload, rate limit. When Gemini is unavailable the app **falls back to the basic on-phone text reader** and says so.

**Command:** `npm test`, then (after Step 12 gives you the screen) try a real photo.
**You should see:** `Gemini output validation` and `upload validation` tests pass.
**Verify:** `http://localhost:3000/api/health` shows `"ai":true`.
**If it fails:**

- `"ai":false`: the key is missing or you did not restart `npm run dev`.
- "AI reader is busy or its free quota is used up": wait, or switch to manual entry; the fallback reader still works.
- "model was not found": change `GEMINI_MODEL`.

## Step 12. The new Upload Label screen

**What:** one screen with **Scan with camera**, **Upload from gallery**, **Paste product link**, up to 3 photos with roles, quality feedback and a review form.
**Why:** to make adding a product quick on an Android phone.
**Files:** `app/ocr/page.tsx` (replaced; the address `/ocr` is unchanged so old links still work), `lib/image-quality.ts` (new), `components/OcrField.tsx` (kept).

**How the three buttons work:**

- **Camera**: an `<input type="file" capture="environment">` opens the phone camera.
- **Gallery**: an `<input type="file" multiple>` opens the gallery; you can pick several photos.
- **Link**: see Step 13.

**Photo roles.** Each photo can be marked *Front of pack*, *Ingredients*, *Nutrition table* or *Other*, and all photos are sent together so Gemini can combine them.

**Quality check on the phone, before anything is uploaded** (`lib/image-quality.ts`): file type; size (max 15 MB); EXIF orientation corrected; resized to at most 1600 px and compressed; blur measured (variance of the Laplacian); brightness measured. A bad photo shows a message such as "The label is difficult to read. Try taking a closer photo in better lighting." Nearly blank, black or extremely blurry photos are blocked; milder problems are warnings.

> The blur and brightness limits are sensible starting values, not scientifically calibrated. If you find good photos being warned, or bad ones passing, change the numbers in the `QUALITY` object at the top of `lib/image-quality.ts`.

**Review form.** After reading, every value appears in an editable box. Yellow boxes are low confidence. If the label does not say per 100 g or per serving, the form asks you. Per-serving values convert to per 100 g only with a serving size. Nothing is saved until you press **Confirm and analyse**.

**Command:** `npm run dev`, open `http://localhost:3000/ocr` (on a phone, use the Vercel URL because the camera needs HTTPS).
**You should see:** the three big buttons.
**Verify:** upload a clear nutrition label photo: after a few seconds a form appears with values filled in. Upload a black photo: it is blocked with the "difficult to read" message.
**If it fails:** camera does nothing, use the gallery button or the HTTPS site; "Switching to the basic text reader" means Gemini was unavailable and the older reader took over (still fine).

## Step 13. Paste a product link (without scraping)

**What:** paste a Blinkit, Zepto or BigBasket link; Grocerly reads the **name written inside the link** and searches its own catalogue.
**Why:** a quick way to find a product from a shop link, **without** touching the shop's website, private APIs or protections.
**Files:** `lib/links.ts`, `app/api/link/resolve/route.ts` (new).

**What it does and does not do:**

- It **never downloads** the retailer's page. It only reads the text of the link you pasted, so there is nothing to scrape and no server-side-request risk.
- It rejects unsafe links: not `https`, a username or password in the link, a custom port, `localhost`, private IP addresses, or no readable name.
- Flow: look in Grocerly's catalogue; if nothing, **one** explicit search of Open Food Facts (India); if still nothing, it tells you to upload the label (the Gemini path).
- When you confirm "This is it", the link can be saved as an optional **Where to buy** link under `purchaseLinks.blinkit` or `.zepto`. Only links on those shops' own domains can be attached, and an existing link is never replaced.

**Command:** `npm run dev`, on the Upload label page tap **Paste product link** and paste something like `https://blinkit.com/prn/amul-processed-cheese-slices/prid/12345`.
**You should see:** "Looking for “amul processed cheese slices”" with matching cards.
**Verify:** `npm test` shows `product links` tests pass (including that `http://`, `localhost`, IP addresses and links with passwords are rejected).
**If it fails:** if the link has no readable name in it (some apps use only numbers), search by name instead.

## Step 14. Security, rate limiting and error handling

**What:** protections and friendly errors across the app.
**Files:** `lib/rate-limit.ts` (new), `lib/api.ts`, every API route, `next.config.mjs`.

| Risk | Protection |
|---|---|
| Gemini key theft | Server-only, header-based, never logged, not in client code, `.env.local` git-ignored |
| Abuse of expensive endpoints | MongoDB-backed rate limits that work across serverless instances: label reading 8 per hour, Open Food Facts search 20 per hour, link lookups 30 per 10 minutes, submissions 20 per hour. Counters auto-delete (TTL) |
| Malicious uploads | Count, type by real file signature, size and total-size limits, validated on the server |
| Unsafe links | https only, no credentials, no ports, no private addresses, never fetched |
| Database injection | Typed filters; search text is escaped before use in a pattern; ids validated as 24 hex characters; barcodes checked with the GS1 check digit |
| Bad data entering the catalogue | Validation before storing; values dropped, not guessed; source priority prevents overwriting |
| Leaking secrets in errors | `handleError` returns generic messages; connection strings are never included |

**Errors handled, with the message the user sees:**

| Situation | Message / behaviour |
|---|---|
| Open Food Facts 503 | Retried once, then "temporarily unavailable"; the app keeps working from MongoDB |
| Open Food Facts 429 | "rate-limiting requests, wait a minute" |
| Gemini failure / quota | "AI reader busy or free quota used up" and automatic fallback to the basic reader |
| MongoDB failure | "The database is temporarily unavailable" (503); missing URI says exactly what to set |
| Invalid image | "Only JPEG, PNG or WebP", "too large", "not a valid image" |
| Invalid link | The reason, in plain words |
| Product not found | Offers **Add it from its label** |
| Missing nutrition | "Not available"; the score explains what is missing and never assumes zero |
| Network timeout | "Could not reach Grocerly. Check your connection." |

**Command:** `npm test`
**Verify:** with `npm run dev` running and no `GEMINI_API_KEY`, run in a second Command Prompt window:

```
curl -X POST http://localhost:3000/api/label/analyze -H "content-type: application/json" -d "{\"images\":[]}"
```

**You should see:** a clear JSON error `ai_unavailable` rather than a crash.
**If it fails:** if rate limits block you while testing, wait (they reset per window) or test from a different browser profile.

## Step 15. Run everything on your computer

**Commands:**

```
npm test
npm run typecheck
npm run dev
```

**You should see:** tests pass; no TypeScript errors; the app at `http://localhost:3000`.

Then follow the test cases in Part 7. When they pass, go to Part 5 to deploy.

# Part 5. Deployment: local, GitHub, Vercel, production, Android

## 5.1 The path your change takes

```
 your laptop  ──git push──▶  GitHub  ──auto──▶  Vercel build  ──▶  Production URL  ──▶  phone
```

You already have this working. An upgrade is just another trip along the same path.

## 5.2 Environment variables (what each one is)

| Variable | Status | What it is | Where it lives |
|---|---|---|---|
| `MONGODB_URI` | existing | Connection address (with password) for your Atlas database | `.env.local` and Vercel |
| `MONGODB_DB` | existing | Database name, `grocerly` | `.env.local` and Vercel |
| `OFF_USER_AGENT` | existing | Tells Open Food Facts who you are (your email). They ask apps to do this | `.env.local` and Vercel |
| `OFF_BASE_URL` | existing, optional | Open Food Facts address; the default is fine | optional |
| `GEMINI_API_KEY` | **new** | Lets the server use Gemini to read label photos | `.env.local` and Vercel, **never anywhere else** |
| `GEMINI_MODEL` | **new, optional** | Which Gemini model to use; default `gemini-2.5-flash` | optional |
| `MONGODB_URI_TEST` | optional | A throw-away database for the 8 optional database tests | `.env.local` only |

`NEXT_PUBLIC_BUILD_ID` and `NEXT_PUBLIC_BUILD_TIME` are **not** variables you set. `next.config.mjs` fills them automatically (the Git commit) so the About page can show which version is running.

> **Do not paste your keys in chat with anyone, and do not commit `.env.local`.** `git status` must never list it.

## 5.3 Important: local and production share one database

Your `.env.local` points to the **same Atlas database** that your live app uses. So when you run `npm run migrate:v2` or an import on your laptop, you are changing production data. That is fine for this upgrade (it is what we want), but it means:

- Do a **dry run** first whenever a script offers one.
- Atlas free clusters have no automatic backup. Before Step 4, take a copy:

```
mongodump --uri "YOUR_MONGODB_URI" --db grocerly --out C:\grocerly_dbbackup
```

(`mongodump` comes with the MongoDB Database Tools from mongodb.com/try/download/database-tools. If you do not want to install it, Step 1's `--force` mode and the migration are both reversible in practice because they only add fields; at minimum export `products` from Atlas using **Browse Collections, Export Collection**.)

- If you want a safe practice area, set `MONGODB_DB=grocerly_dev` in `.env.local` while experimenting, and switch it back when you are ready.

## 5.4 Order of operations for this upgrade

1. Steps 0 to 15 locally (including the database steps).
2. `git push` the code (5.5).
3. Add the Vercel variable (5.6) and redeploy.
4. Test the production URL (5.7).
5. Check Android (Part 6).

(If you deploy the new code **before** running `npm run db:validator`, everything works except saving AI-read or dataset products, which would be rejected until the validator is fixed. `/api/health` tells you with `"validator":"outdated"`.)

## 5.5 Push to GitHub

In Command Prompt, inside `C:\grocerly`:

```
git status
git add .
git commit -m "Catalogue upgrade: Indian catalogue, smart search, levels, Gemini label reading"
git push
```

**You should see:** `git status` lists the changed and new files but **not** `.env.local`, `node_modules` or `data/*.csv`. After `git push`, lines ending in `main -> main`.

**If it fails:**

- "Your branch is behind": run `git pull` first, then `git push`.
- A sign-in window appears: choose browser sign-in.
- `.env.local` appears in `git status`: stop; do not commit. Check that `.gitignore` contains `.env.local` (it does in the upgraded project).

## 5.6 Vercel: environment variables and deploy

1. Open `vercel.com`, your **grocerly** project.
2. **Settings**, **Environment Variables**.
3. Add `GEMINI_API_KEY` (paste the value) and, if you want, `GEMINI_MODEL`. If Vercel offers a **Sensitive** option, turn it on so the value is hidden afterwards.
4. Under environments choose **Production** (and **Preview** only if you want AI in preview builds).
5. Confirm `MONGODB_URI`, `MONGODB_DB` and `OFF_USER_AGENT` are already there.
6. The push in 5.5 started a build automatically (see **Deployments**). If you added variables **after** the build, you must redeploy: **Deployments**, the three dots on the latest one, **Redeploy**. Variables are only read at build time and at server start, so changing them alone changes nothing until a redeploy.

**You should see:** the deployment turns green (**Ready**) in 1 to 3 minutes.
**If the build fails:** click the failed deployment and read the last red lines. The upgraded project passes `next build` here; the usual cause is a file that did not copy (re-run Step 0) or Node version (Vercel's default is fine).

### Production versus Preview

- **Production** = the `main` branch, your real URL.
- **Preview** = any other branch or pull request, with its own temporary URL, useful for trying changes safely.
- Environment variables can be set per environment. Preview deployments use the **same database** unless you give the Preview environment a different `MONGODB_DB`, for example `grocerly_preview`. That is the safe default if you start using branches.

### Rollback

If a deployment misbehaves: **Deployments**, open the previous good one, **Promote to Production** (or **Instant Rollback**). The previous code runs again in seconds. Your database changes remain (they are additive).

## 5.7 Test the production URL

Replace `YOUR-APP` with your Vercel address.

1. `https://YOUR-APP.vercel.app/api/health` should show `"status":"ok"`, `"validator":"ok"` and `"ai":true`.
2. Open the site: the new home screen with categories.
3. Search `maggi`, `cheese`.
4. Open a product; open **Compare** with a suggestion.
5. Upload label with a photo.
6. Paste a product link.
7. About page: **App version** should equal the first 7 characters of your latest commit (`git rev-parse --short HEAD`).

## 5.8 Future updates, in one block

```
npm test
git add .
git commit -m "Describe your change"
git push
```

Then wait for the green deployment and test the URL. That is the whole routine.

# Part 6. Android: what happens after you change the project

## 6.1 The honest situation

I did not build your APK and I cannot see it. In this project I only provided an **installable web app** (a PWA). You said you deployed to Vercel and now use "the APK file as an app". There are three ways that can be true, and they behave differently. **Do not assume; run the 2-minute test in 6.2.**

| What you have | How to recognise it | Does a Vercel deploy update it? |
|---|---|---|
| **A. Web app installed from Chrome** (Chrome menu, Add to Home screen / Install app; Android may call it a WebAPK) | There is no .apk file you handled yourself | **Yes, automatically.** It loads your live site |
| **B. A wrapper APK that just opens your Vercel URL** (made with PWABuilder / Bubblewrap / a "Trusted Web Activity", or Capacitor with `server.url`) | You downloaded and installed an .apk | **Yes for all page and API changes.** The APK only needs rebuilding if you change its icon, name, permissions or package settings |
| **C. An APK with the website files packed inside** (Capacitor/Cordova using bundled files) | The app works with no internet for its screens | **No.** A new build and new APK are needed. (Grocerly's pages need its server for the API, so this setup is unusual.) |

**This upgrade changes no icon, name, manifest, permission or package id.** So for A and B, **a Vercel deployment is enough** and no new APK is needed.

## 6.1b Your case (confirmed by you)

You told me your phone offered an **install pop-up from the website** and you installed that. That is **type A: a web app installed from Chrome**. So:

- **A Vercel deployment is enough.** There is no APK to rebuild and no file to reinstall.
- After deploying, fully close the app and reopen it. If it still looks old, use **Clear cache** (not Clear data), see 6.3.
- The 2-minute test below (About page, App version) proves it.

## 6.2 The 2-minute test (works for every type)

1. Deploy the upgrade (Part 5).
2. On your phone, **fully close** the Grocerly app (swipe it away from recent apps) and open it again.
3. Open **Home, then the link "How scores work and where data comes from"**, scroll to the bottom of the About page.
4. Read **App version xxxxxxx**. Compare it with `git rev-parse --short HEAD` on your laptop.

- **Same code?** Your app uses the live Vercel version. You are done.
- **Different or no version line, and the home screen looks old?** The app is showing cached or bundled files. Try 6.3. If it is still old, you have type C (6.4).

## 6.3 Force a refresh (types A and B)

1. Android **Settings, Apps, Grocerly**, **Storage**, **Clear cache** (not "Clear data").
2. Open the app again. The upgrade bumps the service-worker cache to `v2`, so the app fetches the new shell on the next open.
3. If it still shows the old design: also open the same Vercel link once in Chrome and refresh, then reopen the app.

> **Warning: "Clear data" or uninstalling erases the anonymous device id stored in the app**, so Recent scans and Saved items (which are tied to that id) will no longer show. Use **Clear cache** only.

## 6.4 If your APK bundles the files (type C)

You must build a new APK each time the web code changes. The exact steps depend on the tool you used; common cases:

- **PWABuilder** (`pwabuilder.com`): enter your Vercel URL, **Package for Stores, Android**, download, and install the new APK. **Android only updates an app if it is signed with the same key as the installed one.** If you do not have the old key, you must uninstall first (which erases the device id, see the warning above).
- **Capacitor:** if `capacitor.config` has `server.url` pointing to your Vercel address, it is type B and needs no rebuild. If it bundles files, run `npm run build`, `npx cap sync android`, open Android Studio, **Build, Build APK(s)**, then install.

Because I cannot see how yours was produced, send me the files in the Android project folder (or the name of the tool) and I will write the exact procedure.

## 6.5 Camera and gallery on Android

- The **Upload label** screen uses the standard phone file picker: **Camera** opens the camera app; **Gallery** opens your photos and allows several to be selected. No special permission is needed for the picker.
- The **Scan** screen uses the live camera in the page; Android will ask permission the first time. In a wrapper APK (type B/C) that permission must be allowed for the app (Settings, Apps, Grocerly, Permissions, Camera). If scanning worked before the upgrade, it will still work.

## 6.6 Testing on the actual phone

After deploying: open the app, run the 9 test cases in Part 7, and tick the Android line of the checklist.

# Part 7. Testing

## 7.1 Master checklist

- [ ] Home page: new home, categories, popular products
- [ ] Search
- [ ] Categories (home tiles open a category)
- [ ] Product details
- [ ] Nutrition (values, levels, references)
- [ ] Ingredient analysis
- [ ] Comparison
- [ ] Camera
- [ ] Gallery
- [ ] Gemini
- [ ] Product links
- [ ] MongoDB
- [ ] Open Food Facts fallback
- [ ] Vercel
- [ ] Android

## 7.2 Test cases

**1. Search Maggi.** Type `maggi`. *Expect:* only Maggi products; chips built from results (for example All, Instant Noodles, Cup Noodles, Pasta, Seasonings, Ketchup depending on your data); no German-sounding products. Tap a chip: the list narrows.

**2. Search Cheese.** Type `cheese`. *Expect:* real cheese from several brands; chips like Processed Cheese, Cheese Slices, Cheese Spread. Then type `processed cheese`: only processed cheese.

**3. Open Amul Cheese.** *Expect:* image, brand, pack size, category path `Dairy › Cheese › ...`, score gauge, Nutrition with LOW/MODERATE/HIGH pills and references, Ingredients, Allergens (milk), Data sources.

**4. Compare Amul with other cheese brands.** On the Amul product scroll to *Compare with similar products*. *Expect:* other brands of cheese (not noodles), tap **Compare**: a table with Better option badge, best values highlighted. **Remove** one and **Add** another; try **Sort by score**.

**5. Upload a nutrition label.** Upload label, gallery or camera, choose a clear nutrition table photo, mark it *Nutrition table*, **Read the label**. *Expect:* a form with values; yellow where unsure. Fix any wrong number, **Confirm and analyse**: the new product opens with a score.

**6. Upload an ingredient label.** Same, role *Ingredients*. *Expect:* the ingredient text appears; after saving, the Ingredients and Allergens sections fill in.

**7. Upload a blurry image.** Take a deliberately out-of-focus or very dark photo. *Expect:* a warning or block with "The label is difficult to read. Try taking a closer photo in better lighting." and no AI call is made.

**8. Search an unknown Indian product.** Search a real product you know is not yet imported. *Expect:* "No matching products", **Look wider on Open Food Facts (India)**: if found, it is added and shown; if not, use **Add it from a label photo**.

**9. Paste a product link.** Upload label, **Paste product link**, paste a Blinkit or Zepto product link. *Expect:* "Looking for ..." and matches, or "not in Grocerly yet" with the photo instruction. A link like `http://localhost/...` must be refused.

## 7.3 Behind-the-scenes checks

- **MongoDB:** Atlas, **Browse Collections**: a product you added has `sources`, `confidence`, `categoryPath`, `catalogStatus: "active"`. Scan it again: no duplicate appears (`updatedAt` may change, count does not).
- **Open Food Facts fallback:** scan a barcode Grocerly does not have; it is fetched, stored and shown.
- **Duplicates:** import the same file twice: the second report shows `Inserted: 0`.
- **Gemini:** `/api/health` shows `"ai":true`; a clear photo produces values with confidence; the Vercel logs contain no key.
- **Vercel:** About page version equals your latest commit.
- **Automated:** `npm test` prints `Tests  101 passed | 8 skipped`. To run the 8 database tests, set `MONGODB_URI_TEST` in `.env.local` to a **throw-away** database and run `npm test` again; do not use your real one.

# Part 8. Maintaining the project

| Task | What to do |
|---|---|
| A product is in the wrong category | Add a keyword to the right node in `lib/taxonomy.ts`, run `npm test`, then `npm run migrate:v2 -- --all` |
| Add another dataset | Copy `scripts/import-mendeley.ts`, adapt the source name and licence; reuse `lib/importer.ts` and `lib/dataset-mapper.ts` |
| Refresh Indian products | `npm run import:off -- --pages 20` (safe to re-run; it merges, never duplicates, never overwrites better data) |
| Change the LOW/HIGH thresholds | Edit `RULES` in `lib/levels.ts` (note the source of any new number), run `npm test`, update the About text if needed |
| Change the 0 to 100 score | Edit `lib/scoring-config.ts` **and bump `SCORE_VERSION`**; analyses are recomputed per version |
| Check catalogue health | `npm run catalogue:stats` |
| A brand shows under two spellings | Add an alias in `BRAND_ALIASES` in `lib/identity.ts`, then `npm run migrate:v2 -- --all` |
| Gemini model retired | Change `GEMINI_MODEL` in Vercel and redeploy |
| Rotate a leaked key | Delete it in Google AI Studio or Atlas, create a new one, update `.env.local` and Vercel, redeploy |
| Backups | `mongodump` as in 5.3. After checking Step 1's `--force` result, you may drop `products_backup_<date>` in Atlas |
| Regulations | Add sourced, dated rows to the `regulations` collection; anything missing remains **Unknown** |

# Part 9. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `/api/health` says `"validator":"outdated"` | Old collection rule rejects `dataset` / `gemini` | `npm run db:validator` (Step 1, options A or B) |
| Error code 121 / "validation_failed" when saving | Same as above | Same |
| Search returns nothing for everything | Catalogue empty or all products hidden | `npm run catalogue:stats`; repeat Steps 4 and 6 |
| Home says "The catalogue is empty" | Same | Same |
| Maggi results still include foreign products | Old records not migrated | `npm run migrate:v2` |
| Chips not showing | Fewer than 2 product types in the results | Normal; import more products |
| Everything is "Uncategorised" | Product names do not match taxonomy keywords | Add keywords (Part 8) and re-run `migrate:v2 -- --all` |
| Mendeley import: nutrition skipped | Basis unknown | Use `--basis per100` or `--basis perServing` after checking the dataset page |
| Mendeley import: no name column | Header differs | Rename the header to `Product Name` |
| OFF import: 0 products in API mode | API filter not accepted | Use file mode (`--file`) |
| "Open Food Facts is rate-limiting requests" | Too many requests | Wait a minute; the script retries |
| `"ai":false` | No `GEMINI_API_KEY`, or server not restarted/redeployed | Set it, restart `npm run dev` / redeploy |
| "AI reader is busy or its free quota is used up" | Gemini quota | Wait, or use manual entry; the basic reader still works |
| "configured AI model was not found" | Model name retired | Update `GEMINI_MODEL` |
| "hourly limit" messages | Rate limit | Wait for the window to pass |
| Photos rejected as "too large" | Request limit | Take photos closer / fewer at once; the app already shrinks them |
| Camera does nothing | Not HTTPS / permission off | Use the Vercel `https://` link; allow Camera |
| The installed app still looks old | Cached or bundled app | Part 6.2 to 6.4 |
| `npm` / `tsx` not recognized | Libraries not installed | `npm install` (see the beginner guide for network problems) |
| Build fails on Vercel | Missing file or bad variable name | Read the last red lines; re-run Step 0 |
| `git status` shows `.env.local` | Not ignored | Do not commit; fix `.gitignore` |

# Part 10. Viva-ready explanation

**In one minute:** "Grocerly started by asking Open Food Facts every time and saving whatever came back, which gave us foreign and incomplete products. I changed the architecture so that MongoDB is Grocerly's own product catalogue. Data from an Indian dataset, Open Food Facts and Gemini label reading goes through a pipeline: normalise, validate, de-duplicate and merge by source priority, then store with its provenance and a confidence level. Search then understands brands and categories and queries only the catalogue. Nutrition is shown as value, unit and basis with a LOW, MODERATE or HIGH label and the reference used, and the score is still calculated by fixed rules, never by AI. Gemini is only a label reader whose answers are verified against the text it claims to have read and confirmed by the user."

**Q: Why is MongoDB the main catalogue and not Open Food Facts?** Coverage of Indian products is incomplete and uneven, search quality is outside our control, and we need our own categories, identity rules, confidence levels and licences per field. External sources fill and enrich; MongoDB serves.

**Q: How do you identify a product?** Barcode first. Without one: brand, product type, name core and pack size together. That is why 200 g and 1 kg Amul cheese are different, and Maggi noodles, cup noodles and pasta never merge.

**Q: What happens when two sources disagree?** The higher-priority source wins field by field (dataset, then Open Food Facts, then Gemini, then user-typed). Lower sources only fill blanks. When two agree, the value is marked corroborated.

**Q: How does search work?** The query is split into tokens and spelling is corrected; words are recognised as a brand (from the catalogue's brand list), a category (from the taxonomy) or leftover name words. MongoDB is queried with indexes (`brandNorm`, `categoryPath`, `searchTokens`), results are ranked in code, and chips are counted from the results.

**Q: Why does a category chip list change per search?** It is computed from the products found, not hard-coded.

**Q: What is an upsert, and where do you use it?** An update that inserts when nothing matches. Used when storing products, with a unique barcode index so concurrent requests cannot duplicate them.

**Q: How do you avoid mixing per-100 g and per-serving values?** They are stored in different fields (`nutrition` and `nutritionPerServing`) with the serving size; levels are only computed on per-100 g; per-serving becomes per-100 g only when the serving size is known; importers skip ambiguous columns instead of guessing.

**Q: Where do the thresholds come from?** UK FSA traffic-light cut-offs for fat, saturated fat, sugars; FSSAI's 2026 front-of-pack proposal for salt and added sugar; the EU fibre claim; our own heuristics where nothing suitable exists. They are labelled "Grocerly reference thresholds", shown with their source, and are not medical advice or law. The FSSAI scheme is still a proposal.

**Q: Why not let Gemini compute the health score?** An LLM is non-deterministic, cannot show its arithmetic and can hallucinate. The score must be reproducible and explainable, so Gemini only extracts; our engine scores.

**Q: How do you stop Gemini inventing numbers?** Nulls are allowed; each number needs the printed text; our code checks the number appears in that text; units and ranges are validated; confidence is capped; a person confirms; and AI data has the lowest priority in the merge.

**Q: How is the API key protected?** Server-only environment variable, sent in a header, never in client code, URLs, logs or GitHub; rotatable.

**Q: Did you scrape Blinkit or Zepto?** No. A pasted link is only read as text to extract the product name already in the link. The retailer's page is never fetched. Retailer links are optional "Where to buy" buttons.

**Q: What are the legal considerations?** Open Food Facts is ODbL (attribution, share-alike for derived databases; photos CC BY-SA); the Mendeley dataset is CC BY 4.0 (attribution). Every product records source, link and licence, and the app displays credits.

**Q: How would it scale?** Indexed queries, light list projections, pagination, cached home data, MongoDB-backed rate limits that work across serverless instances; the catalogue can grow to tens of thousands of products on Atlas; sharding by barcode is possible later.

**Q: What are the limitations?** Keyword classification misses some products; the catalogue is only as complete as the sources; AI reading can still be wrong, hence confirmation; regulations data is a small, unverified seed; thresholds are references, not law; blur thresholds are uncalibrated; the Android behaviour depends on how the APK was built.

# Appendix A. Files changed and added

## Modified files

| File | Change |
|---|---|
| `lib/types.ts` | Catalogue v2 fields, new source types |
| `lib/mongodb.ts` | New indexes, validator check `validatorStatus`, new source types in the validator |
| `lib/off.ts` | India filter, typed errors, retry, India paging |
| `lib/normalize.ts` | Serving size, per-serving, veg, image, country, enrichment |
| `lib/products.ts` | Merging upsert, duplicate finder, lazy upgrade of old records, search removed (moved) |
| `lib/nutrition.ts` | `crossCheck`, exported `plausible` |
| `lib/ranking.ts` | Saturated fat metric |
| `app/api/search/route.ts`, `app/api/products/submit/route.ts`, `app/api/cart/route.ts`, `app/api/history/route.ts`, `app/api/health/route.ts` | New search, extended submit, new search in cart, small image field, validator flag |
| `app/page.tsx`, `app/search/page.tsx`, `app/compare/page.tsx`, `app/ocr/page.tsx`, `app/about/page.tsx` | Redesigned screens |
| `components/ProductView.tsx`, `components/CompareTable.tsx` | Redesigned |
| `next.config.mjs`, `public/sw.js`, `package.json`, `.env.example`, `.gitignore`, `scripts/seed.ts` | Build id, cache v2, scripts, comments, ignores, India-only seed |

## New files

| Area | Files |
|---|---|
| Rules | `lib/taxonomy.ts`, `lib/identity.ts`, `lib/catalogue.ts`, `lib/levels.ts`, `lib/search-core.ts`, `lib/search.ts`, `lib/similar.ts` |
| Import | `lib/importer.ts`, `lib/dataset-mapper.ts`, `lib/csv.ts` |
| AI and uploads | `lib/gemini-label.ts`, `lib/image-server.ts`, `lib/image-quality.ts`, `lib/links.ts`, `lib/rate-limit.ts` |
| API routes | `app/api/home`, `app/api/compare/suggest`, `app/api/label/analyze`, `app/api/link/resolve` |
| Components | `ProductTile`, `CategoryChips`, `NutrientRow`, `LevelPill`, `VegMark`, `ConfidenceBadge` |
| Scripts | `import-mendeley.ts`, `import-off-india.ts`, `migrate-v2.ts`, `catalogue-stats.ts`, `update-validator.ts` |
| Tests | `catalogue.test.ts`, `levels-search.test.ts`, `import-gemini.test.ts` |
| Docs | `data/README.md`, this guide |

## New and changed API routes

| Route | Purpose |
|---|---|
| `GET /api/search?q&type&brand&cat&veg&sort&page&external` | Intelligent catalogue search with chips and facets |
| `GET /api/home` | Departments with counts and popular products (public, cached 60 s) |
| `GET /api/compare/suggest?id` | Comparable products |
| `POST /api/label/analyze` | Photos to validated structured extraction (nothing saved) |
| `POST /api/link/resolve` | Product link to catalogue matches, or attach a Where-to-buy link |
| `POST /api/products/submit` | Save confirmed data (merges by source priority) |
| `GET /api/health` | Database, AI and validator status |

## New MongoDB collection

`rate_limits`: documents `{ _id: "bucket:who:window", n, expireAt }` with a TTL index so counters delete themselves.

# Appendix B. Data sources: what was found and decided

| Source | Findings (research in November 2026) | Decision |
|---|---|---|
| Open Food Facts, India | About 20,000 Indian products (early 2026) across 3,300+ brands. Open data under ODbL (attribution, share-alike); images CC BY-SA; API and bulk exports. Quality varies: one research group found only about 4,100 Indian rows with brand, name and an English ingredient list | **Use**, as a gap-filler and bulk import behind a quality gate, India only |
| Mendeley "Indian Packaged Foods Nutritional Composition Dataset (2026)" | 852 products with serving sizes, sub-categories and prices; CC BY 4.0 | **Use** as a clean, legally clear seed; small |
| FoodSwitch India (The George Institute) | About 16,000 packaged products from store labels; research data, not open | Not used; could be requested with permission |
| GS1 India DataKart | National product repository for retailers by subscription; data supplied by brand owners; accuracy not guaranteed | Not open; not used |
| NatFirst | Commercial packaged-food data company | Commercial; licence unknown; not used |
| "OpenMRP", "Shelfpedia", "PackSense" | I could not verify any of these as usable open Indian food datasets ("OpenMRP" appears only as unrelated manufacturing software) | Not used. Send me links and licences if you have them |
| Blinkit / Zepto / BigBasket | Proprietary retail catalogues | **Never scraped**; optional "Where to buy" links only |

**Recommended combination, as implemented:** Grocerly's own records first, then the Mendeley dataset, then Open Food Facts (India), then Gemini label reading, then user-typed data.

# Appendix C. Things you should double-check yourself

1. The **Mendeley file's real columns and basis** (per 100 g or per serving): use the dry run.
2. The **Open Food Facts India filter** behaviour on a live call.
3. Your **Gemini model name and free quota**.
4. The **FSSAI proposal's status** before presenting thresholds; the app labels it a proposal.
5. **Licence obligations** if the catalogue will ever be public (ODbL share-alike; CC BY attribution).
6. The **blur and brightness limits** against your own phone photos.
7. How your **Android app** was built (Part 6).
