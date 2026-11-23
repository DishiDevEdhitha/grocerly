import { PageTitle } from "@/components/States";
import { PENALTY_RULES, BONUS_RULES, SCORE_VERSION } from "@/lib/scoring-config";

export default function About() {
  return (
    <>
      <PageTitle title="About Grocerly" back />
      <div className="space-y-4">
        <section className="card text-sm leading-relaxed"><h2 className="text-lg font-bold">How the score works</h2>
          <p className="mt-2">Every product starts at 100. Fixed rules subtract points for nutrients above healthy limits and add points for protein and fibre. A few additives with a caution rating subtract a little more. No AI decides the number, so the same product always gets the same score. Missing data is never treated as zero.</p>
          <ul className="mt-3 space-y-1 text-slate2">{PENALTY_RULES.map((r) => <li key={r.key}>Lower for {r.label}: low ≤ {r.low} {r.unit}, high ≥ {r.high} {r.unit} per 100 g (up to −{r.maxPoints})</li>)}{BONUS_RULES.map((r) => <li key={r.key}>Higher for {r.label}: from {r.from} {r.unit} up to {r.to} {r.unit} (up to +{r.maxPoints})</li>)}</ul>
          <p className="mt-2 text-xs text-slate2">Scoring version {SCORE_VERSION}. The score is a guide for comparing similar products, not medical advice.</p></section>
        <section className="card text-sm leading-relaxed"><h2 className="text-lg font-bold">Where the data comes from</h2>
          <p className="mt-2">Product data comes from <a className="font-semibold text-leaf underline" href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer">Open Food Facts</a>, a community database available under the Open Database License (ODbL). Labels you photograph are read on your phone and only the text is sent to Grocerly.</p></section>
        <section className="card text-sm leading-relaxed"><h2 className="text-lg font-bold">AI and regulations</h2>
          <p className="mt-2">AI may explain unfamiliar ingredients and is always labelled. It never sets the score and never states legal status. Country status shows only sourced rules; everything else is Unknown.</p></section>
      </div>
    </>
  );
}
