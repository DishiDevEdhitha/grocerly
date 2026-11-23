import type { CountryStatus, RegStatus, RegulationRecord, IngredientInsight } from "./types";
import { extractENumber } from "./ingredients";

export const COUNTRIES: { code: string; name: string }[] = [
  { code: "IN", name: "India" }, { code: "US", name: "United States" }, { code: "GB", name: "United Kingdom" }, { code: "AU", name: "Australia" },
];

/**
 * SEED regulatory entries. These were written from public regulatory texts by the
 * project author, are deliberately few, and are marked `seed-unverified` with no
 * verification date. Anything not listed is reported as "unknown" - never "allowed".
 * Add more rows (and a real verifiedAt) to the `regulations` collection to extend coverage.
 */
type Seed = Omit<RegulationRecord, "_id" | "ingredientId" | "productId">;
const S = (ingredientKey: string, country: string, status: RegStatus, reason: string, authority: string, sourceUrl: string): Seed =>
  ({ ingredientKey, country, status, reason, authority, sourceUrl, verifiedAt: null, verification: "seed-unverified" });

const AZO = ["e102", "e110", "e122", "e124", "e129"];
export const SEED_REGULATIONS: Seed[] = [
  S("e924", "IN", "banned", "Potassium bromate was prohibited as a food additive in India in 2016.", "FSSAI", "https://www.fssai.gov.in"),
  S("e924", "GB", "banned", "Not on the list of authorised food additives in Great Britain.", "Food Standards Agency", "https://www.food.gov.uk"),
  S("e924", "US", "restricted", "Permitted only under conditions in flour/bread (21 CFR 172.730); some US states are moving to ban it.", "US FDA", "https://www.fda.gov"),
  S("e171", "US", "restricted", "Permitted as a colour additive within a 1% by weight limit (21 CFR 73.575). Under review.", "US FDA", "https://www.fda.gov"),
  S("e127", "US", "banned", "FDA revoked the authorisation of Red No. 3 in food in January 2025; manufacturers have until January 2027 to comply.", "US FDA", "https://www.fda.gov"),
  ...AZO.map((e) => S(e, "GB", "restricted", "Authorised, but food containing this colour must carry the warning: may have an adverse effect on activity and attention in children.", "Food Standards Agency", "https://www.food.gov.uk")),
];

const rank: Record<RegStatus, number> = { banned: 3, restricted: 2, allowed: 1, unknown: 0 };

/**
 * Roll ingredient-level records up to a per-country product status.
 * banned > restricted > allowed (only if EVERY detected additive has an "allowed" record) > unknown.
 */
export function evaluateRegulations(ingredients: IngredientInsight[], records: RegulationRecord[]): CountryStatus[] {
  const keys = new Map<string, string>(); // eNumber -> display name
  for (const ing of ingredients) {
    const e = extractENumber(ing.name);
    if (e) keys.set(e, ing.name);
  }
  return COUNTRIES.map(({ code, name }) => {
    const details: CountryStatus["details"] = [];
    for (const r of records.filter((x) => x.country === code && keys.has(x.ingredientKey))) {
      details.push({ ingredient: keys.get(r.ingredientKey)!, status: r.status, reason: r.reason, authority: r.authority, sourceUrl: r.sourceUrl, verifiedAt: r.verifiedAt ? new Date(r.verifiedAt).toISOString() : null, verification: r.verification });
    }
    let status: RegStatus = "unknown";
    for (const d of details) if (rank[d.status] > rank[status]) status = d.status;
    const allCovered = keys.size > 0 && [...keys.keys()].every((k) => details.some((d) => d.status === "allowed" && records.some((r) => r.ingredientKey === k && r.country === code)));
    if (status === "allowed" && !allCovered) status = "unknown";
    const summary =
      status === "banned" ? "Contains an ingredient that is banned here." :
      status === "restricted" ? "Contains an ingredient with restrictions or required warnings here." :
      status === "allowed" ? "All detected additives have an allowed record." :
      "Unknown. Insufficient verified regulatory data.";
    return { country: code, countryName: name, status, summary, details };
  });
}
