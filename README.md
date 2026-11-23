# Grocerly

Android-first (PWA) food intelligence app for Indian shoppers. Scan a barcode, search, or photograph a label and get a transparent 0-100 score, reasons, allergens, country regulatory status, and better alternatives. Built with **Next.js + TypeScript + MongoDB Atlas** for a NoSQL course project.

## What works

| Feature | Where |
|---|---|
| Barcode scan (EAN-13/8, UPC-A/E), duplicate-scan guard, manual entry fallback | `components/Scanner.tsx`, `lib/barcode.ts` |
| MongoDB-first lookup, then Open Food Facts, normalise, validate, score, **upsert** | `lib/products.ts`, `lib/off.ts`, `lib/normalize.ts` |
| Search (text index + partial match + OFF fallback) | `app/api/search` |
| Label OCR (Tesseract.js in the browser) with per-field confidence and verification | `lib/ocr-client.ts`, `lib/nutrition.ts`, `app/ocr` |
| Deterministic, versioned, category-aware score | `lib/score.ts`, `lib/scoring-config.ts` |
| Ingredient parser, knowledge base, allergen engine (contains / derived / may contain / unknown) | `lib/ingredients.ts` |
| Optional AI ingredient explanations (never scores, never regulatory) | `lib/ai.ts` |
| Country status (never "allowed" from missing data) | `lib/regulations.ts` |
| Alternatives with user-adjustable priorities, comparison, cart screenshot, history, saved | `lib/ranking.ts`, `app/*` |

## Quick start (local)

Requirements: Node.js 18.18+ and a free MongoDB Atlas cluster (see `docs/DATABASE_GUIDE.md`, section 3).

```bash
npm install
cp .env.example .env.local      # then paste your MONGODB_URI
npm run seed:kb                 # ingredient knowledge base + seed regulations
npm run seed -- maggi           # real products from Open Food Facts
npm run dev                     # http://localhost:3000
```

Open `http://localhost:3000/api/health` first. It should return `{"status":"ok",...}`.

Camera scanning needs HTTPS. On localhost it works in desktop Chrome; on your phone use the deployed URL (see `docs/DEPLOYMENT_GUIDE.md`) or a tunnel.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm test` | 46 unit/component tests; DB integration tests run when `MONGODB_URI_TEST` is set |
| `npm run typecheck` | TypeScript |
| `npm run seed -- <term>` | Import products from Open Food Facts (e.g. `lays`, `oreo`) |
| `npm run seed:kb` | Upsert ingredients and seed regulations |
| `npm run db:indexes` | Create/list collections and indexes |

## Documentation

`docs/BEGINNERS_GUIDE.md` (and the Word version `GROCERLY_BEGINNERS_GUIDE.docx`) is the step-by-step guide for people new to all of this. `docs/` also holds DATABASE_GUIDE, DEPLOYMENT_GUIDE, ARCHITECTURE, API, OCR_AI_PIPELINE, SCORING_ALGORITHM, NO_SQL_VIVA, TROUBLESHOOTING, PROJECT_PRESENTATION. A Word version of the database and deployment guides is `GROCERLY_DATABASE_AND_DEPLOYMENT_GUIDE.docx`.

## Honest limitations

- Regulatory data is a **small seed set**, marked "not independently verified". Everything else is Unknown. Extend the `regulations` collection with sourced, dated records before presenting it as authoritative.
- Photos are OCR'd on the phone and only text is stored; no image storage is configured (OFF image URLs are linked, not copied).
- Identity is an anonymous per-device id (no login). History/saved are per device.
- Open Food Facts coverage of Indian products is incomplete; the label-photo flow exists for that reason.
- OCR quality depends on photo quality. Low-confidence values are highlighted and must be confirmed.
- The score is a comparison aid based on per-100 g thresholds, not medical advice.

Data: [Open Food Facts](https://world.openfoodfacts.org) (ODbL). Keep attribution if you redistribute.
