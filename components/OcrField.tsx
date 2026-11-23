import { LOW_CONFIDENCE } from "@/lib/nutrition";

/** A numeric input that shows OCR confidence and demands verification below the threshold. */
export default function OcrField({ label, unit, value, confidence, note, onChange }: { label: string; unit: string; value: string; confidence?: number; note?: string; onChange: (v: string) => void }) {
  const low = confidence != null && confidence < LOW_CONFIDENCE;
  return (
    <div className={`rounded-2xl p-3 ${low ? "bg-turmeric/15 ring-2 ring-turmeric" : "bg-paper"}`}>
      <label className="flex justify-between text-xs font-semibold text-slate2"><span>{label} ({unit})</span>{confidence != null && <span>{Math.round(confidence * 100)}% sure</span>}</label>
      <input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full bg-transparent text-lg font-bold outline-none" placeholder="Not read" aria-label={label} />
      {low && <p role="alert" className="text-xs font-semibold text-ink">Unable to confidently read {label.toLowerCase()}. Please verify the value.</p>}
      {note && !low && <p className="text-[11px] text-slate2">{note}</p>}
    </div>
  );
}
