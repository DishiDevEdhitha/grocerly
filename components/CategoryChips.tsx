"use client";
/** Horizontal, scrollable chips. The list is built from the matched products (never hard-coded). */
export default function CategoryChips({ chips, active, onSelect, total }: { chips: { label: string; count: number }[]; active?: string; onSelect: (label: string | undefined) => void; total: number }) {
  if (chips.length < 2) return null;
  const base = "min-h-[40px] shrink-0 rounded-full px-4 text-sm font-semibold transition";
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Product type">
      <div className="flex gap-2">
        <button role="tab" aria-selected={!active} onClick={() => onSelect(undefined)} className={`${base} ${!active ? "bg-ink text-white" : "bg-white text-ink ring-1 ring-ink/10"}`}>All <span className="opacity-70">{total}</span></button>
        {chips.map((c) => (
          <button key={c.label} role="tab" aria-selected={active === c.label} onClick={() => onSelect(c.label)} className={`${base} ${active === c.label ? "bg-ink text-white" : "bg-white text-ink ring-1 ring-ink/10"}`}>{c.label} <span className="opacity-70">{c.count}</span></button>
        ))}
      </div>
    </div>
  );
}
