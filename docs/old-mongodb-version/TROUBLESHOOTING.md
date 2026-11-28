# Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `db_not_configured` from the API | `MONGODB_URI` missing | Create `.env.local` (local) or add the Vercel env var, then redeploy |
| `db_unavailable`, `MongoServerSelectionError` | Atlas network access blocks you | Atlas > Network Access > add your IP (or `0.0.0.0/0` for Vercel) |
| `bad auth : Authentication failed` | Wrong user/password | Reset the database user's password; URL-encode special characters |
| Works locally, not on Vercel | Env vars not set in Vercel, or IP not allowed | Add vars (Settings > Environment Variables) and redeploy |
| Camera does not start | Not HTTPS, permission denied, or in-app browser | Use the HTTPS URL in Chrome; lock icon > Permissions > Camera > Allow |
| Barcode never detected | Glare, blur, too close | Hold 15-25 cm away, steady, good light; or type the digits |
| "not_found" after scan | Not in Open Food Facts | Use "Add it from its label" |
| `external_unavailable` | OFF down/slow/rate-limited | Retry later; OFF limits search to about 10 requests/min |
| OCR stuck at 0% | First run downloading language data | Wait, keep internet on |
| OCR values wrong | Blurry or curved label | Retake flat, bright, close; edit highlighted fields |
| Score shows "–" | Fewer than 3 core nutrients | Add the nutrition label |
| Duplicate key error E11000 on barcode | Unique index working as designed | Use the upsert path (`/api/products/submit` does) |
| 422 `validation_failed` | Document violates `$jsonSchema` | Name, nutrition, ingredients and source are required |
| `npm run seed` finds nothing | Search term too narrow / OFF busy | Try another term (`lays`, `oreo`), wait a minute |
| `next build` fails with `child_process`/`net` | Client file imported MongoDB code | Import pure helpers from `lib/ranking.ts`, never `lib/mongodb.ts`, in client components |
| Vercel function timeout on cart analysis | Plan duration limit | Upload cart screenshots with fewer items, or upgrade the plan |
| AI notes missing | No `GEMINI_API_KEY` or API error | Optional; the app works without it |
