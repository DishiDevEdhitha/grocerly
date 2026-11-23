import { BAND_LABEL } from "@/lib/score";
import type { ScoreResult } from "@/lib/types";

const COLORS: Record<ScoreResult["band"], string> = { better: "#1F7A5A", moderate: "#E8A317", poor: "#E0702B", avoid: "#C93B2B", insufficient: "#9AA7A1" };

/** The one memorable element: a 240° dial with the score set large in the display face. */
export default function ScoreGauge({ score, band }: { score: number | null; band: ScoreResult["band"] }) {
  const R = 78, C = 2 * Math.PI * R, arc = C * (240 / 360);
  const pct = score == null ? 0 : score / 100;
  const color = COLORS[band];
  return (
    <div className="flex flex-col items-center" role="img" aria-label={score == null ? "Grocerly score not available" : `Grocerly score ${score} out of 100, ${BAND_LABEL[band]}`}>
      <svg viewBox="0 0 200 170" className="w-56">
        <g transform="rotate(150 100 100)" fill="none" strokeLinecap="round" strokeWidth="16">
          <circle cx="100" cy="100" r={R} stroke="#E3F0E9" strokeDasharray={`${arc} ${C}`} />
          <circle cx="100" cy="100" r={R} stroke={color} strokeDasharray={`${arc * pct} ${C}`} />
        </g>
        <text x="100" y="104" textAnchor="middle" className="font-display" style={{ fontSize: 58, fontWeight: 800, fill: "#12231D" }}>{score ?? "–"}</text>
        <text x="100" y="128" textAnchor="middle" style={{ fontSize: 13, fill: "#5B6B65", fontWeight: 600 }}>{score == null ? "no score yet" : "out of 100"}</text>
      </svg>
      <span className="chip -mt-2 text-white" style={{ background: color }}>{BAND_LABEL[band]}</span>
    </div>
  );
}
