# Architecture

```text
Android phone (PWA)  --HTTPS-->  Next.js on Vercel (UI + /api routes)
                                      |
              +-----------------------+---------------------------+
              v                       v                           v
        MongoDB Atlas          Open Food Facts API          Gemini (optional)
              ^
              +--- Analysis engine: score | ingredients | allergens | regulations | alternatives
```

The browser never talks to MongoDB. `MONGODB_URI` exists only in server environment variables.

## Request flow: barcode scan
1. `Scanner` (ZXing) decodes, checks the GS1 check digit, de-duplicates for 4 s.
2. `GET /api/products/:barcode?method=barcode`
3. `resolveProduct`: `findOne({barcode})` in MongoDB.
4. Missing -> `fetchOffByBarcode` -> `normalizeOffProduct` (only place that knows OFF field names) -> validation -> `upsertProduct` (`updateOne(..., {upsert:true})`) -> `getOrComputeAnalysis` -> `product_analysis` upsert.
5. Not on OFF -> API returns `404 not_found`; UI offers the label-photo flow.
6. If a user id header is present, one `scan_history` row is inserted.

## Layers (all in `lib/`)
| File | Responsibility | Touches DB? |
|---|---|---|
| `mongodb.ts` | pooled client, validator, indexes | yes |
| `products.ts` | resolve, upsert, analysis cache, search | yes |
| `off.ts`, `normalize.ts` | external API + schema mapping | no |
| `nutrition.ts` | units, OCR text -> nutrients, validation | no |
| `ingredients.ts` | parse, knowledge base, allergens | no |
| `score.ts`, `scoring-config.ts` | deterministic score | no |
| `regulations.ts` | per-country roll-up | no |
| `ranking.ts` / `alternatives.ts` | pure ranking / aggregation query | only the latter |
| `ai.ts` | optional Gemini explanations | no |

Pure logic is separated from I/O so it is unit tested without a database.

## Why the split between `ranking.ts` and `alternatives.ts`
Client pages import `ranking.ts` (labels, weights). Importing the MongoDB driver into a client bundle breaks the build, so DB code lives in a server-only file.

## Collections
`products`, `product_analysis`, `ingredients`, `regulations`, `submissions`, `users`, `scan_history`, `saved_products`. Details in DATABASE_GUIDE.

## Capacitor (later APK)
All UI calls relative `/api/...`. For a Capacitor build, host the API on Vercel and set the web view to load that URL (or add an `NEXT_PUBLIC_API_BASE` prefix in `lib/client.ts`).
