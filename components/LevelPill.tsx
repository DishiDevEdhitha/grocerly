import type { Tone } from "@/lib/levels";
const TONE: Record<Tone, string> = { good: "bg-leaf text-white", caution: "bg-turmeric text-ink", bad: "bg-chilli text-white", neutral: "bg-slate2/20 text-ink" };
export default function LevelPill({ label, tone }: { label: string; tone: Tone }) {
  return <span className={`chip ${TONE[tone]}`}>{label}</span>;
}
