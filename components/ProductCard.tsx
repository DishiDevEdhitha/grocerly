import Link from "next/link";

export interface CardItem { id: string; name: string; brand?: string; image?: string; score: number | null; sub?: string }
const tone = (s: number | null) => (s == null ? "bg-slate2/15 text-slate2" : s >= 75 ? "bg-leaf text-white" : s >= 50 ? "bg-turmeric text-ink" : s >= 25 ? "bg-[#E0702B] text-white" : "bg-chilli text-white");

export default function ProductCard({ item, href, via }: { item: CardItem; href?: string; via?: string }) {
  return (
    <Link href={href ?? `/product/${item.id}${via ? `?via=${via}` : ""}`} className="card flex items-center gap-3 !p-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {item.image ? <img src={item.image} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-2xl bg-paper object-contain" /> : <div className="h-16 w-16 shrink-0 rounded-2xl bg-mint" aria-hidden />}
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">{item.name}</p>
        <p className="truncate text-sm text-slate2">{[item.brand, item.sub].filter(Boolean).join(" · ") || "Unknown brand"}</p>
      </div>
      <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl font-display text-lg font-extrabold ${tone(item.score)}`} aria-label={item.score == null ? "No score" : `Score ${item.score}`}>{item.score ?? "–"}</span>
    </Link>
  );
}
