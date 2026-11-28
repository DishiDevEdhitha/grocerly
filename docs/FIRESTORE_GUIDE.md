---
title: "Grocerly on Firestore: Switch Guide and New Look"
subtitle: "Replacing MongoDB with Google Cloud Firestore, step by step, for beginners"
---

# Part 1. Read this first

## What changed

1. **The database is now Google Cloud Firestore** (a NoSQL *document* database) instead of MongoDB. Your professor said any NoSQL database except MongoDB is allowed.
2. **The app looks like a real app**: green theme, pastel category tiles, tabbed product page (Analysis, Nutrition, Ingredients, Alerts), list rows with score badges, filter chips on History and Saved, a dark scan screen with manual entry, smaller refined icons.
3. Everything else is unchanged: scoring, categories, search understanding, LOW/MODERATE/HIGH levels, Gemini label reading, imports, comparison.

## What is verified and what is not

| Verified here | Verify yourself (Step 3 and Step 6) |
|---|---|
| TypeScript has no errors | The connection to **your Firebase project** |
| **118 automated tests pass** on an in-memory copy of the database | Real Firestore behaviour (the tests prove the logic, not the cloud service) |
| The production build succeeds | Your phone |
| Screens render correctly (checked in a phone-sized browser) | Open Food Facts and Gemini (they could not be reached from my environment) |

**Your old MongoDB data is not copied.** You re-fill the new database with the import commands in Step 4 (about 5 minutes). Old history and saved items from testing are not carried over.

> **Syllabus note.** Your syllabus lists MongoDB, Redis, Cassandra and Neo4j; Firestore is not listed. Firestore is a document database (the same family as MongoDB), so the Unit 1 ideas (documents, collections, CRUD) apply directly. Tell your professor you are using Firestore and make sure that is accepted.

# Part 2. Firestore in plain words

| MongoDB word | Firestore word | Meaning |
|---|---|---|
| Database | Project / database | The whole cupboard |
| Collection | Collection | A shelf of similar documents |
| Document | Document | One card (a product) with fields |
| Embedded document | Map field | `nutrition: { protein: 21 }` inside the card |
| `_id` | Document ID | The unique name of the card |
| Index | Index | Shortcut for fast queries. Firestore builds one for **every field automatically** |
| `$lookup` / aggregation | *(none)* | Firestore has **no joins**: the app reads the other documents and combines them in code |
| `$group` count | `count()` query | Counting without downloading documents |
| TTL index | TTL policy | Auto-delete old documents |
| Validator | *(none)* | The app validates before saving |

## How Grocerly's data is laid out

```
 products/{barcode or auto id}        the catalogue (the barcode IS the document id)
 product_analysis/{productId_1.0}     score, reasons, allergens (one per product per score version)
 ingredients/{name}                   additive knowledge base
 regulations/{e-number_country}       country rules
 submissions/{submissionId}           label upload evidence
 meta/brands                          list of known brands (for search)
 rate_limits/{bucket_person_window}   request counters (TTL)
 users/{deviceId}                     one document per device
    ├── history/{auto id}             that person's scans (subcollection)
    └── saved/{productId}             that person's saved products (subcollection)
```

**Why these choices (good for your viva):**

- **Barcode as document id** means a barcode can never be stored twice. This replaces MongoDB's unique index.
- **Analysis id = productId_scoreVersion** keeps exactly one analysis per product and score version.
- **History and saved are subcollections of the user**, so "my recent scans" is a simple query on one small shelf: `users/{id}/history` sorted by time.
- **`active*` mirror fields** (`activeBrand`, `activeCategories`, `activeTokens`, `activeDepartment`) copy the normal fields **only when a product is active**. A query such as `activeCategories array-contains "Cheese"` then returns only active cheese, with a single filter. That keeps every query on Firestore's automatic indexes, so you never have to create indexes by hand.
- **Joins in code:** history and saved store only a `productId`. The app fetches those products and scores in one batch (`getAll`) and combines them.
- **Popular products** use a `scanCount` number on each product that goes up by 1 each time it is opened (all-time, not last 30 days).

# Part 3. Step by step

> Use **Command Prompt**. Wait for each command to finish.

## Step 0. Put the new files into your project

**What/why:** copy the new project over your old one, keeping your secrets and installed libraries.

```
robocopy C:\grocerly C:\grocerly_backup2 /E /XD node_modules .next
robocopy C:\Users\seera\Desktop\files_3\grocerly-firestore\grocerly C:\grocerly /E /XD node_modules .git .next /XF .env.local
cd /d C:\grocerly
npm install
npm run typecheck
npm test
```

(Change the second path to wherever you unzipped the new ZIP; it must be the folder that contains `package.json`.)

**You should see:** `robocopy` shows FAILED 0; `npm install` adds the Firebase library and removes the MongoDB one; `typecheck` prints nothing; `npm test` ends with `Tests  118 passed`.

**If it fails:** close VS Code and terminals and repeat; if `npm install` shows network errors use a phone hotspot.

## Step 1. Create the Firebase project and the database

1. Open `console.firebase.google.com` and sign in with a Google account.
2. **Create a project**, name it `grocerly`, turn **Google Analytics off**, create.
3. Left menu: **Build, Firestore Database, Create database**.
4. Location: choose **asia-south1 (Mumbai)** (or the nearest). This cannot be changed later.
5. Choose **Start in production mode** (this blocks the public internet; Grocerly's server uses a private key, so it still works). Click **Create**.

**You should see:** an empty Firestore screen with "Start collection".
**Cost:** the free (Spark) plan is enough for this project. Check the current free limits on Firebase's pricing page; they include a daily number of reads and writes. If you reach the limit the app says "free daily database limit reached" until it resets.

## Step 2. Create the secret key (server only)

1. In Firebase, click the **gear icon, Project settings, Service accounts** tab.
2. Click **Generate new private key**, confirm. A `.json` file downloads.
3. Move it **outside your project**, for example `C:\keys\grocerly-key.json`. **Never put it in the project folder, GitHub or chat.**
4. Turn it into one line of text (base64):

```
mkdir C:\keys
powershell -Command "[Convert]::ToBase64String([IO.File]::ReadAllBytes('C:\keys\grocerly-key.json'))" > C:\keys\key64.txt
```

5. Open `C:\keys\key64.txt` in Notepad, select all, copy.
6. Open `C:\grocerly\.env.local` in VS Code. Delete the old `MONGODB_URI` and `MONGODB_DB` lines. Add one line (paste after the equals sign, no spaces, no quotes):

```
FIREBASE_SERVICE_ACCOUNT_BASE64=PASTE_THE_LONG_TEXT_HERE
```

7. Save.

## Step 3. Test the connection

```
npm run db:check
```

**You should see:**

```
Connected to Firestore project: grocerly-xxxxx
  products           0 documents
  product_analysis   0 documents
  ...
```

**If it fails:**

| Message | Fix |
|---|---|
| "Firebase is not configured" | The line is missing or misspelled in `.env.local`; restart the terminal |
| "The Firebase key could not be read" | Re-create `key64.txt` (Step 2); make sure you copied all of it |
| code 5 / "Firestore database not created" | Do Step 1 (Create database) |
| code 7 / permission denied | In Google Cloud console enable the **Cloud Firestore API** for the project; make sure the key is for the same project |

## Step 4. Fill the database

```
npm run seed:kb
npm run import:off -- --pages 5
npm run catalogue:stats
```

**You should see:** "Saved 54 ingredients and 10 regulation records", then import progress, then counts such as `By status: active: 300 ...`.
Later you can import the Mendeley data exactly as in the earlier guide (`npm run import:mendeley -- data\file.csv --dry-run` first).
**Verify in Firebase:** Firestore Database, you now see the collections `products`, `product_analysis`, `ingredients`, `regulations`, `meta`.

## Step 5. (Optional) Auto-delete old rate-limit counters

Counters in `rate_limits` are tiny, so you can skip this. To clean them automatically: Google Cloud console, Firestore, **Time-to-live (TTL)**, create a policy for collection group `rate_limits` and field `expireAt`.

## Step 6. Run it on your computer

```
npm run dev
```

Open `http://localhost:3000/api/health`. **You should see** `"status":"ok"` and `"engine":"firestore"`. Then open `http://localhost:3000` and check: home categories, search `maggi`, `cheese`, `processed cheese`, open a product and its tabs, Compare, Save, History.

## Step 7. Deploy

1. Push the code:

```
git status
git add .
git commit -m "Switch to Firestore and new app design"
git push
```

(`git status` must **not** list `.env.local`.)

2. In Vercel: your project, **Settings, Environment Variables**:
   - **Add** `FIREBASE_SERVICE_ACCOUNT_BASE64` (paste the long text; tick **Sensitive** if offered; Production).
   - **Delete** `MONGODB_URI` and `MONGODB_DB`.
   - Keep `OFF_USER_AGENT` (and `GEMINI_API_KEY` if you use it).
3. **Deployments**, three dots on the latest, **Redeploy**.
4. Open `https://YOUR-APP.vercel.app/api/health`: `"engine":"firestore"`.

**Android:** your phone app was installed from Chrome's install pop-up, so it loads your Vercel site. A Vercel deployment updates it automatically. Fully close and reopen the app, then open **About** and compare **App version** with `git rev-parse --short HEAD`. If still old: Settings, Apps, Grocerly, Storage, **Clear cache** (not Clear data).

## Step 8. Test checklist

- [ ] `/api/health` shows firestore
- [ ] Home shows categories and popular products
- [ ] Search `maggi` (only Maggi), `cheese`, `processed cheese`, `amul cheese`, `oreo`
- [ ] Product page: Analysis, Nutrition (LOW/MODERATE/HIGH), Ingredients, Alerts tabs
- [ ] Compare with a suggested product; Save; History shows it; Saved shows it
- [ ] Scan a barcode on the phone (HTTPS site)
- [ ] Upload label (gallery and camera); a blurry photo is warned
- [ ] Paste a product link
- [ ] Firebase console shows the new documents

# Part 4. What changed in the code

| Area | Files |
|---|---|
| Database layer (new) | `lib/db.ts` (Firestore connection and the small interface the app uses), `lib/memory-db.ts` (in-memory twin used by tests) |
| Data logic rewritten | `lib/products.ts`, `lib/search.ts`, `lib/similar.ts`, `lib/alternatives.ts`, `lib/rate-limit.ts`, `lib/importer.ts`, `lib/user-data.ts` (new: history and saved) |
| Small edits | `lib/types.ts` (ids are text, new `active*` and `scanCount` fields), `lib/catalogue.ts` (keeps `active*` in sync), `lib/api.ts` (Firestore error messages) |
| API routes | all 14 routes now use Firestore; `health`, `history`, `saved`, `products/[id]`, `products/submit`, `link/resolve`, `ocr/parse`, `label/analyze`, `compare/suggest` rewritten |
| Scripts | `db-check.ts` (new), `seed.ts`, `seed-knowledge.ts`, `catalogue-stats.ts`, imports updated. **Removed:** the MongoDB-only scripts `migrate-v2`, `update-validator`, `ensure-indexes` |
| Dependencies | **added** `firebase-admin`, **removed** `mongodb` |
| Environment | `FIREBASE_SERVICE_ACCOUNT_BASE64` replaces `MONGODB_URI` and `MONGODB_DB` |
| Look and feel | `app/globals.css`, `tailwind.config.ts`, `app/layout.tsx`, `components/BottomNav.tsx`, `States.tsx`, `ProductRow.tsx` (new), `ProductTile.tsx`, `Scanner.tsx`, `NutrientRow.tsx`, `ProductView.tsx` (tabs), pages `page.tsx`, `search`, `scan`, `history`, `saved` |
| Tests | `tests/store.test.ts` (new, 18 tests on the in-memory twin); `db.integration.test.ts` removed |
| Old guides | moved to `docs/old-mongodb-version/` (they describe the MongoDB version) |

# Part 5. Troubleshooting

| Symptom | Fix |
|---|---|
| `db_not_configured` | `FIREBASE_SERVICE_ACCOUNT_BASE64` missing; restart `npm run dev` or redeploy |
| `db_not_created` | Create the database (Step 1) |
| `db_permission` | Enable the Cloud Firestore API; key must belong to the same project |
| `db_quota` | Free daily limit reached; wait for the reset or upgrade the plan |
| Search shows nothing | The database is empty: run Step 4 |
| Categories empty on Home | Same |
| Production works but local does not (or the reverse) | Both need the variable: `.env.local` and Vercel |
| Old app version on the phone | Part 3, Step 7 (Android paragraph) |

# Part 6. Viva-ready answers

**Why Firestore?** It is a NoSQL document database with a free plan, works with Vercel's serverless hosting, and fits Grocerly's product-shaped data. Only the data layer changed; the rest of the app was designed to be independent of the database.

**Document, key-value, column or graph?** Firestore is a **document** store: data lives in documents (maps and arrays) inside collections, like MongoDB.

**What is different from MongoDB?** No joins or aggregation pipeline (the app combines data in code and uses `count()`), automatic single-field indexes, subcollections, document ids chosen by us, and Google-managed hosting.

**How do you avoid duplicates?** The barcode is the document id; products without a barcode are matched by brand, type, name and pack size.

**How are queries kept fast and simple?** Each query uses one filter on an automatically indexed field (`activeBrand ==`, `activeCategories array-contains`, `activeTokens array-contains`); extra conditions are applied in code.

**Where are joins?** `users/{id}/history` stores `productId`; the app batch-reads those products and scores (`getAll`) and merges them.

**How is the secret protected?** A service-account key in a server-only environment variable; the phone only talks to the Vercel API; Firestore rules block direct public access.

**How did you test without a cloud database?** The app talks to a small database interface; tests use an in-memory implementation of it (118 tests), and the Firestore adapter is checked with `npm run db:check`.

**Limitations:** free daily read/write quota, popularity is all-time, categories limited by a 400-document cap per query, the Firestore adapter itself is only verified on your project, and the old MongoDB data was not migrated.
