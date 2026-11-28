import { PageTitle } from "@/components/States";
import { PENALTY_RULES, BONUS_RULES, SCORE_VERSION } from "@/lib/scoring-config";
import { RULES, REFERENCE_SOURCES } from "@/lib/levels";
import { NUTRIENT_META } from "@/lib/nutrition";

export default function About() {
  return (
    <>
      <PageTitle title="About Grocerly" back />
      <div className="space-y-4">
        <section className="card text-sm leading-relaxed"><h2 className="section-title">How the score works</h2>
          <p className="mt-2">Every product starts at 100. Fixed rules subtract points for nutrients above healthy limits and add points for protein and fibre. A few additives with a caution rating subtract a little more. No AI decides the number, so the same product always gets the same score. Missing data is never treated as zero.</p>
          <ul className="mt-3 space-y-1 text-slate2">{PENALTY_RULES.map((r) => <li key={r.key}>Lower for {r.label}: low ≤ {r.low} {r.unit}, high ≥ {r.high} {r.unit} per 100 g (up to −{r.maxPoints})</li>)}{BONUS_RULES.map((r) => <li key={r.key}>Higher for {r.label}: from {r.from} {r.unit} up to {r.to} {r.unit} (up to +{r.maxPoints})</li>)}</ul>
          <p className="mt-2 text-xs text-slate2">Scoring version {SCORE_VERSION}. The score is a guide for comparing similar products, not medical advice.</p></section>
        <section className="card text-sm leading-relaxed"><h2 className="section-title">LOW / MODERATE / HIGH labels</h2>
          <p className="mt-2">Each nutrient is labelled per 100 g (or 100 ml for drinks) using &quot;Grocerly reference thresholds&quot;. They are for comparing products and are not medical advice or a legal standard.</p>
          <ul className="mt-3 space-y-2 text-xs text-slate2">{RULES.map((r) => <li key={r.key}><b className="text-ink">{NUTRIENT_META[r.key].label}</b>: low {r.kind === "limit" ? "≤" : "<"} {r.solid.low}, {r.kind === "limit" ? "high >" : "good ≥"} {r.solid.high} per 100 g. <span>({r.solid.source})</span></li>)}</ul>
          <ul className="mt-3 space-y-1 text-xs text-slate2">{REFERENCE_SOURCES.map((r) => <li key={r.name}><b className="text-ink">{r.name}:</b> {r.note}</li>)}</ul></section>
        <section className="card text-sm leading-relaxed"><h2 className="section-title">Where the data comes from</h2>
          <p className="mt-2">Product data comes from <a className="font-semibold text-leaf underline" href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer">Open Food Facts</a>, a community database available under the Open Database License (ODbL). Product data may also come from the “Indian Packaged Foods Nutritional Composition Dataset (2026)” on Mendeley Data (CC BY 4.0). Label photos are never stored. If AI reading is on, the photos are sent once to Google&apos;s Gemini service to read the text, and only the confirmed values are saved.</p></section>
        <section className="card text-sm leading-relaxed"><h2 className="section-title">AI and regulations</h2>
          <p className="mt-2">AI may explain unfamiliar ingredients and is always labelled. It never sets the score and never states legal status. Country status shows only sourced rules; everything else is Unknown.</p></section>
        <p className="text-center text-[11px] text-slate2">App version {process.env.NEXT_PUBLIC_BUILD_ID} · built {process.env.NEXT_PUBLIC_BUILD_TIME}</p>
      </div>
    </>
  );
}
