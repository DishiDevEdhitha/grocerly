import LevelPill from "./LevelPill";
import { NUTRIENT_META, formatNutrient } from "@/lib/nutrition";
import type { NutrientLevel } from "@/lib/levels";
import type { NutrientKey } from "@/lib/types";

const BAR: Record<string, string[]> = { limit: ["#1F7A5A", "#E8A317", "#C93B2B"], benefit: ["#9AA7A1", "#E8A317", "#1F7A5A"] };

/** One nutrient: actual value + unit + basis + LOW/MODERATE/HIGH + the reference used. */
export default function NutrientRow({ nutrientKey, value, level, basis }: { nutrientKey: NutrientKey; value: number | undefined; level: NutrientLevel | null; basis: string }) {
  const label = NUTRIENT_META[nutrientKey].label;
  if (value == null) return (
    <div className="flex items-center justify-between border-t border-ink/10 py-3 first:border-0"><span className="font-semibold">{label}</span><span className="text-sm text-slate2">Not available</span></div>
  );
  const colors = level ? BAR[level.kind] : null;
  const max = level ? level.range.high * 1.6 : 1; const pos = level ? Math.min(100, (value / max) * 100) : 0;
  const lowPct = level ? (level.range.low / max) * 100 : 0; const highPct = level ? (level.range.high / max) * 100 : 0;
  return (
    <div className="border-t border-ink/10 py-3 first:border-0">
      <div className="flex items-start justify-between gap-3">
        <div><p className="font-semibold">{label}</p><p className="font-display text-xl font-extrabold leading-tight">{formatNutrient(nutrientKey, value)} <span className="text-xs font-medium text-slate2">/ {basis}</span></p></div>
        {level ? <LevelPill label={level.label} tone={level.tone} /> : <span className="text-xs text-slate2">No reference</span>}
      </div>
      {level && colors && (
        <>
          <div className="relative mt-2 h-2 overflow-hidden rounded-full" role="img" aria-label={`${label} is ${level.label.toLowerCase()}`} style={{ background: `linear-gradient(90deg, ${colors[0]} 0 ${lowPct}%, ${colors[1]} ${lowPct}% ${highPct}%, ${colors[2]} ${highPct}% 100%)` }}>
            <span className="absolute top-[-3px] h-[14px] w-[3px] rounded bg-ink" style={{ left: `calc(${pos}% - 1px)` }} />
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-slate2">Grocerly reference: {level.referenceText}</p>
          <p className="text-[11px] text-slate2/80">Source: {level.range.source}</p>
        </>
      )}
    </div>
  );
}
