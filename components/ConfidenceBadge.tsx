import { ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";
import type { ConfidenceLevel } from "@/lib/types";

const META: Record<ConfidenceLevel, { label: string; cls: string; Icon: typeof ShieldCheck }> = {
  verified: { label: "Verified", cls: "bg-leaf text-white", Icon: ShieldCheck },
  high: { label: "High confidence", cls: "bg-mint text-leaf-dark", Icon: ShieldCheck },
  medium: { label: "Medium confidence", cls: "bg-turmeric/25 text-ink", Icon: ShieldAlert },
  low: { label: "Low confidence", cls: "bg-chilli/15 text-chilli", Icon: ShieldAlert },
  unknown: { label: "Not available", cls: "bg-slate2/15 text-slate2", Icon: ShieldQuestion },
};
export default function ConfidenceBadge({ level, compact }: { level?: ConfidenceLevel; compact?: boolean }) {
  const m = META[level ?? "unknown"]; const Icon = m.Icon;
  return <span className={`chip ${m.cls}`}><Icon size={13} aria-hidden />{compact ? m.label.replace(" confidence", "") : m.label}</span>;
}
