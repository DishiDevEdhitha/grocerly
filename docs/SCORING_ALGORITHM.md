# Grocerly score (version 1.0)

```text
score = 100 - nutrient penalties + nutrient bonuses - ingredient penalties - processing penalty   (clamped 0..100)
```
All numbers live in `lib/scoring-config.ts`. Change `SCORE_VERSION` whenever you edit them; analyses are stored per `(productId, scoreVersion)`.

Values are per 100 g (per 100 ml for beverages).

## Nutrient penalties
`points = maxPoints x profileWeight x clamp((value - low) / (high - low), 0, 1)`

| Nutrient | low | high | max pts |
|---|---|---|---|
| Sodium (mg) | 120 | 600 | 18 |
| Sugars (g) | 5 | 22.5 | 16 |
| Saturated fat (g) | 1.5 | 5 | 16 |
| Total fat (g) | 3 | 17.5 | 8 |
| Energy (kcal) | 150 | 450 | 12 |
| Trans fat (g) | 0.1 | 2 | 10 |

Fat, saturated fat, sugars and salt/sodium cut-offs follow the UK FSA front-of-pack traffic-light boundaries per 100 g. Energy, trans fat, protein and fibre thresholds are Grocerly heuristics. Beverage thresholds for sugar, energy and sodium are heuristics based on the same idea.

## Bonuses
Protein 3 -> 15 g (max +8), fibre 1.5 -> 6 g (max +8), also multiplied by profile weights.

## Category profiles (weights)
| Profile | Emphasis |
|---|---|
| chips_snacks | sodium 1.3, sat fat 1.3, fat 1.2, energy 1.2, sugar 0.6 |
| protein_bar | protein 1.5, sugar 1.4, fibre 1.3, sodium 0.6 |
| cereal | sugar 1.5, fibre 1.5, sodium 1.1, protein 1.2 |
| beverage | sugar 2.0, energy 1.5, per-100 ml thresholds |
| noodles | sodium 1.4, sat fat 1.1 |
| biscuits | sugar 1.2, sat fat 1.2, trans fat 1.5 |
| default | all 1.0 |
Profile is picked from Open Food Facts category tags / product name (`detectProfile`).

## Ingredient risk
Only **knowledge-base** ingredients count: low 1, moderate 3, high 6 points, capped at 20 in total. This is an internal *caution rating* (heavily processed markers, synthetic colours with EU/UK warning labels, high-intensity sweeteners, curing agents), **not** a toxicity claim. NOVA group 4 (from Open Food Facts) costs 5. AI-classified ingredients cost nothing.

## Missing data
A missing nutrient is neither penalised nor rewarded and is listed under `missing`. If fewer than 3 of the 6 core nutrients (energy, sodium, sugars, sat fat, fat, protein) exist, `score` is `null` ("Not enough data").

## Bands
75+ Better choice, 50-74 Okay in moderation, 25-49 Less healthy, <25 Poor choice.

## Worked example (chips profile)
Sodium 900 mg: severity 1 -> -18 x 1.3 = -23.4. Sat fat 14 g: -16 x 1.3 = -20.8. Fat 33 g: -8 x 1.2 = -9.6. Energy 540: -12 x 1.2 = -14.4. Sugars 3 g: 0. Protein 6 g: +2.0, fibre 3 g: +2.7. Score = 100 - 68.2 + 4.7 = **37**.

## Alternatives ranking
Min-max normalise each chosen metric across the current product and candidates, invert "lower is better" metrics (sodium, sugar, calories, fat, carbs, price), take the weighted average over the metrics a candidate actually has (weights re-normalised; candidates with under 50% coverage are dropped), keep only candidates that beat the current product.
