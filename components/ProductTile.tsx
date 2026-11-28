import Link from "next/link";
import { Package } from "lucide-react";
import VegMark from "./VegMark";
import LevelPill from "./LevelPill";
import { NUTRIENT_META } from "@/lib/nutrition";
import type { ProductCardData } from "@/lib/search";

const SCORE = (s: number | null) => (s == null ? "bg-slate2/20 text-slate2" : s >= 75 ? "bg-leaf text-white" : s >= 50 ? "bg-turmeric text-ink" : s >= 25 ? "bg-[#E0702B] text-white" : "bg-chilli text-white");

/** Grid card for search results, popular products and suggestions. Images are lazy-loaded and never stretched. */
export default function ProductTile({ item, via, action }: { item: ProductCardData; via?: string; action?: React.ReactNode }) {
  return (
    <div className="card flex flex-col !p-2.5">
      <Link href={`/product/${item.id}${via ? `?via=${via}` : ""}`} className="flex flex-1 flex-col">
        <div className="relative grid aspect-square w-full place-items-center overflow-hidden rounded-xl bg-paper ring-1 ring-ink/5">
          {item.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.image} alt={`${item.brand ?? ""} ${item.name}`.trim()} loading="lazy" decoding="async" width={200} height={200} className="h-full w-full object-contain p-2" />
          ) : (<Package size={30} className="text-slate2/40" aria-hidden />)}
          <span className="absolute left-2 top-2"><VegMark veg={item.vegetarian} /></span>
        </div>
        <h3 className="mt-2 line-clamp-2 text-[13px] font-bold leading-tight">{item.name}</h3>
        <p className="truncate text-[11px] text-slate2">{[item.brand, item.quantity].filter(Boolean).join(" · ") || "Brand not listed"}</p>
        {item.category && <p className="truncate text-[11px] text-slate2/80">{item.category}</p>}
        <div className="mt-2 flex items-center gap-2">
          <span className={`grid h-8 min-w-[2.3rem] place-items-center rounded-[10px] px-2 text-[13px] font-extrabold ${SCORE(item.score)}`}>{item.score ?? "–"}</span>
          <span className="text-[11px] font-semibold leading-tight text-slate2">{item.score == null ? "No score yet" : "Nutrition score /100"}</span>
        </div>
        {item.indicators.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1" aria-label="Key nutrition indicators">
            {item.indicators.map((i) => <li key={i.key}><span className="mr-0.5 text-[10px] font-semibold text-slate2">{NUTRIENT_META[i.key].label.replace("Saturated fat", "Sat. fat")}</span><LevelPill label={i.label} tone={i.tone} /></li>)}
          </ul>
        )}
        <span className="mt-2.5 text-[12px] font-semibold text-leaf">View analysis →</span>
      </Link>
      {action}
    </div>
  );
}
