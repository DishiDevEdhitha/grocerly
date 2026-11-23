"use client";
import { useEffect, useRef, useState } from "react";
import { validateBarcode } from "@/lib/barcode";
import type { DecodeHintType as HintType } from "@zxing/library";

/** Live barcode scanner (ZXing). Reports each distinct code once. */
export default function Scanner({ onDetect, paused }: { onDetect: (code: string) => void; paused?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const last = useRef<{ code: string; at: number } | null>(null);
  const cb = useRef(onDetect); cb.current = onDetect;
  const pausedRef = useRef(paused); pausedRef.current = paused;
  const [state, setState] = useState<"starting" | "scanning" | "denied" | "unsupported">("starting");

  useEffect(() => {
    let stop: (() => void) | undefined; let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setState("unsupported"); return; }
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const { BarcodeFormat, DecodeHintType } = await import("@zxing/library");
        const hints = new Map<HintType, unknown>([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]], [DecodeHintType.TRY_HARDER, true]]);
        const reader = new BrowserMultiFormatReader(hints);
        const controls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } } }, video.current!, (result) => {
          if (!result || pausedRef.current) return;
          const code = result.getText();
          const now = Date.now();
          if (last.current && last.current.code === code && now - last.current.at < 4000) return; // duplicate-scan guard
          if (!validateBarcode(code).valid) return; // ignore misreads
          last.current = { code, at: now };
          navigator.vibrate?.(60);
          cb.current(code);
        });
        if (cancelled) controls.stop(); else { stop = () => controls.stop(); setState("scanning"); }
      } catch (e) {
        const n = (e as Error).name;
        setState(n === "NotAllowedError" || n === "SecurityError" ? "denied" : "unsupported");
      }
    })();
    return () => { cancelled = true; stop?.(); };
  }, []);

  if (state === "denied") return <div role="alert" className="card bg-chilli/5 text-sm"><b>Camera access is blocked.</b> Allow the camera for this site in your browser settings (tap the lock icon in the address bar), then reload. You can still type the barcode below.</div>;
  if (state === "unsupported") return <div role="alert" className="card bg-turmeric/10 text-sm"><b>The camera is not available here.</b> Camera scanning needs HTTPS and a supported browser. Type the barcode below instead.</div>;
  return (
    <div className="relative overflow-hidden rounded-tile bg-ink">
      <video ref={video} className="aspect-[4/3] w-full object-cover" playsInline muted aria-label="Camera preview" />
      <div className="pointer-events-none absolute inset-x-[10%] inset-y-[20%] rounded-2xl border-2 border-white/90">
        {state === "scanning" && <div className="scanline absolute inset-x-2 h-0.5 bg-turmeric" />}
      </div>
      <p className="absolute inset-x-0 bottom-3 text-center text-sm font-semibold text-white drop-shadow">{state === "starting" ? "Starting camera…" : "Line the barcode up inside the frame"}</p>
    </div>
  );
}
