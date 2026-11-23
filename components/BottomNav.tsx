"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ScanLine, Search, History, Bookmark } from "lucide-react";

const ITEMS = [
  { href: "/", label: "Home", Icon: Home }, { href: "/scan", label: "Scan", Icon: ScanLine }, { href: "/search", label: "Search", Icon: Search },
  { href: "/history", label: "History", Icon: History }, { href: "/saved", label: "Saved", Icon: Bookmark },
];
export default function BottomNav() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 border-t border-ink/10 bg-white/95 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <ul className="mx-auto flex max-w-md">
        {ITEMS.map(({ href, label, Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link href={href} aria-current={active ? "page" : undefined} className={`flex min-h-[60px] flex-col items-center justify-center gap-0.5 text-xs font-semibold ${active ? "text-leaf" : "text-slate2"}`}>
                <span className={`rounded-full px-4 py-1 ${active ? "bg-mint" : ""}`}><Icon size={22} strokeWidth={active ? 2.5 : 2} /></span>{label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
