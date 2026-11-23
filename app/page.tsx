import Link from "next/link";
import { ScanLine, Search, FileText, ShoppingBasket, Info } from "lucide-react";

const ACTIONS = [
  { href: "/scan", title: "Scan product", body: "Point at a barcode", Icon: ScanLine, cls: "bg-leaf text-white" },
  { href: "/search", title: "Search product", body: "Find by name", Icon: Search, cls: "bg-white" },
  { href: "/ocr", title: "Upload label", body: "Read ingredients and nutrition", Icon: FileText, cls: "bg-white" },
  { href: "/cart", title: "Analyze cart", body: "Screenshot of your basket", Icon: ShoppingBasket, cls: "bg-turmeric text-ink" },
];

export default function Home() {
  return (
    <>
      <header className="pb-5 pt-4">
        <p className="font-display text-xl font-extrabold text-leaf">Grocerly</p>
        <h1 className="mt-5 text-[34px] font-extrabold leading-[1.05]">What&apos;s really in the pack you&apos;re holding?</h1>
        <p className="mt-3 max-w-[34ch] text-slate2">Get a clear 0 to 100 score, the reasons behind it, allergens, and a better pick, before it reaches your cart.</p>
      </header>
      <ul className="grid grid-cols-2 gap-3">
        {ACTIONS.map(({ href, title, body, Icon, cls }) => (
          <li key={href}><Link href={href} className={`card flex h-full min-h-[148px] flex-col justify-between ${cls}`}><Icon size={30} /><span><b className="block text-lg leading-tight">{title}</b><span className="text-sm opacity-80">{body}</span></span></Link></li>
        ))}
      </ul>
      <Link href="/about" className="mt-5 flex items-center gap-2 rounded-2xl bg-mint p-4 text-sm font-semibold text-leaf-dark"><Info size={18} />How scores work and where data comes from</Link>
    </>
  );
}
