import { NUTRIENT_META, formatNutrient, LOW_CONFIDENCE } from "@/lib/nutrition";
import { NUTRIENT_KEYS, type Nutrition, type NutritionMeta } from "@/lib/types";

const PRIMARY = ["calories", "protein", "carbohydrates", "fat", "sodium", "sugars", "fiber"] as const;

export default function NutritionGrid({ nutrition, meta, basis = "100 g" }: { nutrition: Nutrition; meta?: NutritionMeta; basis?: string }) {
  const extra = NUTRIENT_KEYS.filter((k) => !PRIMARY.includes(k as (typeof PRIMARY)[number]) && nutrition[k] != null);
  const keys = [...PRIMARY, ...extra];
  return (
    <section aria-labelledby="nut-h" className="card">
      <h2 id="nut-h" className="text-lg font-bold">Nutrition <span className="text-sm font-medium text-slate2">per {basis}</span></h2>
      <dl className="mt-3 grid grid-cols-2 gap-2">
        {keys.map((k) => {
          const v = nutrition[k]; const m = meta?.[k];
          return (
            <div key={k} className="rounded-2xl bg-paper p-3">
              <dt className="text-xs font-semibold text-slate2">{NUTRIENT_META[k].label}</dt>
              <dd className={`mt-0.5 text-lg font-bold ${v == null ? "text-slate2/70" : ""}`}>{formatNutrient(k, v)}</dd>
              {m && v != null && m.source !== "openfoodfacts" && <p className="text-[11px] text-slate2">{m.verifiedByUser ? "Checked by you" : m.confidence < LOW_CONFIDENCE ? "Low confidence" : "Read from label"}</p>}
            </div>
          );
        })}
      </dl>
    </section>
  );
}
