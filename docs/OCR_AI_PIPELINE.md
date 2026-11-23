# OCR and AI pipeline

OCR and AI are **separate** stages. OCR reads text; deterministic code extracts fields; AI (optional) only explains unfamiliar ingredients.

```text
Photo -> resize + grayscale + contrast stretch (browser canvas)
      -> Tesseract.js (browser)            raw lines + per-line confidence
      -> POST /api/ocr/parse (text only)
      -> parseNutritionLines               field extraction
      -> unit normalisation                kJ->kcal, mg/g, salt->sodium, serving->per 100 g
      -> validation                        sat fat <= fat, sugars <= carbs, macros <= 100 g
      -> confidence + needsVerification    < 0.60 => highlighted, "Unable to confidently read sodium. Please verify the value."
      -> user edits / confirms             POST /api/products/submit
      -> ingredient parser -> knowledge base -> allergens -> (optional AI for unknown names)
      -> deterministic score -> MongoDB
```

## Why OCR runs in the browser
Photos are large (Vercel request bodies are limited) and private. Only text is uploaded. Trade-off: the first run downloads Tesseract language data (~10 MB) and needs internet.

## Confidence
Each extracted field carries `{value, unit, confidence, source:"ocr"}`. Confidence starts as the OCR line confidence and is reduced when the unit was guessed (-0.15), the value is implausible (cap 0.3), or cross-field validation fails (cap 0.4). Stored values keep `source` and `verifiedByUser` in `nutritionMeta`.

## Known limits
Tesseract struggles with curved packs, glare, and tiny type. Multi-column tables may mis-pair labels and numbers; the validation rules catch many but not all errors, which is why the user always reviews values.

## Where AI is used (`lib/ai.ts`)
- Only when `GEMINI_API_KEY` is set, and only for ingredient names missing from the knowledge base.
- Returns category, type, a <=25-word explanation, optional allergen hint, confidence (capped at 0.7).
- Tagged `source:"ai"`, labelled "AI note" in the UI, **risk level forced to none, excluded from the score**, allergen hints appear only as "Unknown source".
- The prompt forbids scores and legal-status claims. Output is validated; any failure returns an empty list and the app continues.
- Not implemented: sending the image to a multimodal model for OCR correction. The layer is the place to add it.
