# API reference

All routes are JSON. Errors have the shape `{"error":{"code","message"}}`. The browser sends `x-grocerly-user: <uuid>` (anonymous device id) for history and saved items.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | Pings MongoDB. `{status, database, ai}` |
| GET | `/api/products/:id?method=barcode\|search\|ocr\|cart_screenshot` | `:id` is a barcode or a 24-char product id. MongoDB first, then Open Food Facts. Returns `{product, analysis, origin, saved}`. Errors: 400 `invalid_barcode`, 404 `not_found`, 502 `external_unavailable`, 503 `db_*` |
| POST | `/api/products/submit` | Create from verified OCR/manual input. Body: `name`, `brand`, `barcode?`, `category`, `price?`, `basisUnit` (`g`\|`ml`), `nutrition{}` (per 100 g/ml), `nutritionMeta{}`, `ingredientsText`, `submissionId`. 201 when new, 200 when the barcode existed (upsert). 422 if MongoDB schema validation rejects it |
| GET | `/api/search?q=maggi&external=0\|1` | `$text` search, regex fallback, then OFF fallback (adds results to MongoDB) |
| POST | `/api/ocr/parse` | Body `{kind:"nutrition"\|"ingredients", lines:[{text,confidence}], submissionId?, barcode?}`. Returns extracted fields with `confidence`, `needsVerification`, `basis`, `warnings`. Stores raw text in `submissions` |
| GET | `/api/alternatives/:id?prefs=score:40,protein:30,sodium:20,price:10` | Weights are relative. Returns ranked alternatives with `reasons` |
| GET | `/api/compare?ids=a,b,c` | 2-4 products + `winners` per metric |
| POST | `/api/cart` | Body `{lines:string[]}` (OCR lines). Returns basket report |
| GET / POST / DELETE | `/api/saved` (`?productId=` for DELETE) | Saved products |
| GET | `/api/history` | Last 100 scans with product + score (aggregation with `$lookup`) |

## Example
```bash
curl https://YOUR-APP.vercel.app/api/products/8901058852370 -H "x-grocerly-user: 11111111-2222-3333-4444-555555555555"
```
