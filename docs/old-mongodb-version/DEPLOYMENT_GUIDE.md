# Deployment guide

**Two separate services:**
- **Vercel hosts** the Next.js application (pages + `/api` routes).
- **MongoDB Atlas hosts** the database.
Vercel connects to Atlas over the internet using `MONGODB_URI`. The phone connects only to Vercel.

```text
Phone --HTTPS--> Vercel (Next.js app + API) --TLS--> MongoDB Atlas
```

## 1. Prepare MongoDB Atlas
Follow `DATABASE_GUIDE.md` section 3. Allow network access `0.0.0.0/0` (Vercel IPs are dynamic).

## 2. Put the code on GitHub
```bash
git init && git add . && git commit -m "Grocerly"
# create an empty repo on github.com, then:
git remote add origin https://github.com/YOUR-USER/grocerly.git
git branch -M main && git push -u origin main
```
Check that `.env.local` is **not** in the repo (`git status` should not list it).

## 3. Deploy on Vercel
1. Sign up at vercel.com with GitHub.
2. **Add New > Project**, import `grocerly`.
3. Framework preset: **Next.js** (auto-detected). Build/output settings: defaults.
4. **Environment Variables**: add `MONGODB_URI`, `MONGODB_DB=grocerly`, optionally `GEMINI_API_KEY`, `OFF_USER_AGENT` (use your email), `OFF_BASE_URL`.
5. **Deploy**. You get `https://grocerly-xxxx.vercel.app`.
6. Open `/api/health` -> `{"status":"ok"}`.

## 4. Load data
Run once from your laptop (it writes to the same Atlas database):
```bash
npm run seed:kb
npm run seed -- maggi && npm run seed -- lays && npm run seed -- oreo
```
(Or just scan; unknown barcodes are fetched and stored automatically.) Seeding several brands in one category (e.g. chips, noodles, biscuits) gives the alternatives engine something to rank.

## 5. Test on Android
1. Open the HTTPS URL in Chrome. Camera access requires HTTPS, which Vercel provides.
2. Tap **Scan**, allow the camera, scan a real pack.
3. Chrome menu > **Add to Home screen** (installs the PWA).
4. Walk through the acceptance checklist below.

## 6. Acceptance checklist
- [ ] Scan -> product, nutrition, ingredients, allergens, reasons, alternatives appear
- [ ] In Atlas > Browse Collections, the product exists in `products` and `product_analysis`
- [ ] Scan again: served from MongoDB (no duplicate; `updatedAt` unchanged)
- [ ] Compare two products; save one; both show on History/Saved
- [ ] Label photo: nutrition values + confidence; low-confidence fields highlighted
- [ ] Cart screenshot -> basket report

## 7. Notes
- Vercel's free plan limits function duration and request size; the cart analysis route sets `maxDuration = 60`, which may be capped on your plan. Check Vercel's current limits.
- First OCR run downloads language data from a CDN; the phone needs internet.
- To try on a phone without deploying, use `npx localtunnel --port 3000` or Vercel preview deployments.

## 8. Optional: Android APK with Capacitor
```bash
npm i @capacitor/core @capacitor/cli @capacitor/android
npx cap init Grocerly com.example.grocerly --web-dir=public
```
In `capacitor.config.ts` set `server.url` to your Vercel URL, then `npx cap add android && npx cap open android`. The APK is a shell around the deployed app, so the backend and MongoDB stay server-side. Add camera permission in `AndroidManifest.xml`.
