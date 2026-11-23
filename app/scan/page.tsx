"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Scanner from "@/components/Scanner";
import { PageTitle, ErrorBox } from "@/components/States";
import { api, ApiError } from "@/lib/client";
import { validateBarcode } from "@/lib/barcode";
import { Loader2 } from "lucide-react";

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
      await api(`/api/products/${v.normalized}`); // MongoDB first, Open Food Facts fallback happens on the server
      router.push(`/product/${v.normalized}?via=barcode`);
    } catch (e) {
      const ae = e as ApiError; setError({ message: ae.message, code: ae.code, barcode: v.normalized }); setBusy(null);
    }
  }

  return (
    <>
      <PageTitle title="Scan a barcode" sub="Works with EAN-13, EAN-8, UPC-A and UPC-E." />
      <Scanner onDetect={lookup} paused={Boolean(busy)} />
      {busy && <p role="status" className="mt-4 flex items-center justify-center gap-2 text-slate2"><Loader2 className="animate-spin" size={18} />Looking up {busy}…</p>}
      {error && (
        <div className="mt-4 space-y-3">
          <ErrorBox message={error.message} />
          {error.code === "not_found" && (
            <div className="grid gap-2">
              <Link href={`/ocr?barcode=${error.barcode}`} className="btn-primary">Add it from its label</Link>
              <Link href="/search" className="btn-outline">Search by name instead</Link>
            </div>
          )}
        </div>
      )}
      <form className="card mt-4" onSubmit={(e) => { e.preventDefault(); lookup(manual); }}>
        <label htmlFor="bc" className="text-sm font-semibold">Or type the barcode</label>
        <div className="mt-2 flex gap-2">
          <input id="bc" inputMode="numeric" autoComplete="off" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="e.g. 8901058852370" className="input" />
          <button className="btn-primary" disabled={!manual || Boolean(busy)}>Look up</button>
        </div>
      </form>
    </>
  );
}
