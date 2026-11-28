import Link from "next/link";
import { Package } from "lucide-react";

export interface RowItem { id: string; name: string; brand?: string; quantity?: string; image?: string; score: number | null; sub?: string }
const tone = (s: number | null) => (s == null ? "bg-slate2/15 text-slate2" : s >= 75 ? "bg-[#2E9B52] text-white" : s >= 50 ? "bg-[#F6B93B] text-ink" : s >= 25 ? "bg-[#E8772E] text-white" : "bg-[#D8412F] text-white");

/** One product as a list row (search results, history, saved): image, name, brand + pack size, score badge. */
export default function ProductRow({ item, via, trailing }: { item: RowItem; via?: string; trailing?: React.ReactNode }) {
  return (
    <div className="card flex items-center gap-3 !p-2.5">
      <Link href={`/product/${item.id}${via ? `?via=${via}` : ""}`} className="flex min-w-0 flex-1 items-center gap-3">
        <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-paper ring-1 ring-ink/5">
          {item.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.image} alt="" loading="lazy" decoding="async" className="h-full w-full object-contain p-1" />
          ) : <Package size={20} className="text-slate2/40" aria-hidden />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 block text-[13.5px] font-bold leading-snug">{item.name}</span>
          <span className="block truncate text-[11.5px] text-slate2">{[item.brand, item.quantity].filter(Boolean).join(" · ") || "Brand not listed"}</span>
          {item.sub && <span className="block truncate text-[11px] text-slate2/80">{item.sub}</span>}
        </span>
        <span aria-label={item.score == null ? "No score" : `Score ${item.score}`} className={`grid h-9 min-w-[2.5rem] shrink-0 place-items-center rounded-[10px] px-2 text-[14px] font-extrabold ${tone(item.score)}`}>{item.score ?? "–"}</span>
      </Link>
      {trailing}
    </div>
  );
}
