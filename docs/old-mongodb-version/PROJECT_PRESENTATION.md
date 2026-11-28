# Presentation outline (10 minutes)

1. **Problem** (1 min): Indian shoppers cannot judge packaged food at a glance; labels are dense; online carts hide details.
2. **Solution** (1 min): Grocerly. Scan, score, explain, compare, find better.
3. **Live demo** (3 min): scan a barcode on the phone -> score + reasons -> allergens -> country status -> alternatives -> compare -> save -> history. Then show the same document in Atlas.
4. **Architecture** (1 min): phone -> Next.js on Vercel -> MongoDB Atlas / Open Food Facts / optional AI. Phone never touches the DB.
5. **NoSQL design** (2 min): collections, embedding vs referencing, indexes (`IXSCAN` in `explain`), upsert, aggregation with `$lookup`, `$jsonSchema` validator.
6. **Trustworthy by design** (1 min): deterministic score with a point-by-point breakdown; AI only explains; missing data stays missing; regulation unknown is never "allowed".
7. **Limitations and future work** (1 min): verified regulatory dataset, image storage with object storage, accounts, price data, Capacitor APK, on-device OCR improvements.

Demo checklist: seed 3 brands beforehand; have one barcode OFF knows and one it doesn't; keep a nutrition label photo ready; open Atlas on a second screen.
