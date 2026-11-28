"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Search, Info } from "lucide-react";
import Scanner from "@/components/Scanner";
import { ErrorBox } from "@/components/States";
import { api, ApiError } from "@/lib/client";
import { validateBarcode } from "@/lib/barcode";

export default function ScanPage() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; code?: string; barcode?: string } | null>(null);
  const [manual, setManual] = useState("");

  async function lookup(code: string) {
    const v = validateBarcode(code);
    if (!v.valid) { setError({ message: v.reason ?? "That is not a valid barcode." }); return; }
    setBusy(v.normalized); setError(null);
    try {
      await api(`/api/products/${v.normalized}`); // the catalogue is checked first; Open Food Facts only if it is missing
      router.push(`/product/${v.normalized}?via=barcode`);
    } catch (e) { const ae = e as ApiError; setError({ message: ae.message, code: ae.code, barcode: v.normalized }); setBusy(null); }
  }

  return (
    <div className="-mt-3 min-h-[calc(100vh-70px)]">
      <div className="-mx-4 bg-[#0E1C13] px-4 pb-10 pt-3 text-white">
        <div className="mb-3 flex items-center gap-3">
          <Link href="/" aria-label="Back to home" className="grid h-8 w-8 place-items-center rounded-full bg-white/10"><ArrowLeft size={16} /></Link>
          <h1 className="text-[16px] font-bold">Scan Barcode</h1>
        </div>
        <Scanner onDetect={lookup} paused={Boolean(busy)} />
        {busy && <p role="status" className="mt-3 flex items-center justify-center gap-2 text-[13px] text-white/80"><Loader2 className="animate-spin" size={15} />Looking up {busy}…</p>}
      </div>
      <div className="-mx-4 -mt-5 space-y-3 rounded-t-[26px] bg-white px-4 pb-6 pt-5 shadow-[0_-8px_24px_-16px_rgba(0,0,0,.4)]">
        {error && (
          <div className="space-y-2">
            <ErrorBox message={error.message} />
            {error.code === "not_found" && <div className="grid gap-2"><Link href={`/ocr?barcode=${error.barcode}`} className="btn-primary">Add it from its label</Link><Link href="/search" className="btn-outline">Search by name instead</Link></div>}
          </div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); lookup(manual); }}>
          <label htmlFor="bc" className="text-[13px] font-bold">Or enter barcode manually</label>
          <div className="mt-2 flex gap-2">
            <input id="bc" inputMode="numeric" autoComplete="off" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="e.g. 8901058017687" className="input" />
            <button className="btn-primary !min-w-[48px] !px-0" disabled={!manual || Boolean(busy)} aria-label="Look up barcode"><Search size={17} /></button>
          </div>
        </form>
        <p className="flex items-center gap-2 rounded-xl bg-mint px-3 py-2 text-[12px] text-leaf-dark"><Info size={14} className="shrink-0" />Works with EAN-13, EAN-8, UPC-A and UPC-E.</p>
      </div>
    </div>
  );
}
