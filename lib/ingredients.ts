import type {
  AllergenFinding, AllergenLevel, AllergenReport, IngredientInsight, IngredientKnowledge, Product,
} from "./types";

export interface ParsedIngredient { raw: string; name: string; normalized: string; eNumber?: string; parent?: string }

const norm = (s: string) => s.toLowerCase().replace(/[_*]/g, " ").replace(/\s+/g, " ").replace(/^[\s.:;,-]+|[\s.:;,-]+$/g, "");

/** Split on top-level commas/semicolons only (ignore separators inside brackets). */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0, cur = "";
  for (const ch of text) {
    if ("([{".includes(ch)) depth++;
    if (")]}".includes(ch)) depth = Math.max(0, depth - 1);
    if ((ch === "," || ch === ";") && depth === 0) { parts.push(cur); cur = ""; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

export function extractENumber(s: string): string | undefined {
  const m = s.toLowerCase().match(/\b(?:e|ins)\s*-?\s*(\d{3,4}[a-z]?)(?:\([ivx]+\))?\b/);
  return m ? `e${m[1]}` : undefined;
}

/** Parse "Ingredients: Potato, Palm oil (Palmolein), Emulsifier (322, 471)" into a flat list. */
export function parseIngredientText(text: string): ParsedIngredient[] {
  if (!text) return [];
  const cleaned = text
    .replace(/^\s*ingredients?\s*[:\-]?\s*/i, "")
    .replace(/\b(contains|may contain|allergen advice)\b.*$/is, "") // allergen statements are handled separately
    .replace(/\s+/g, " ");
  const out: ParsedIngredient[] = [];
  const walk = (chunk: string, parent?: string) => {
    for (const part of splitTopLevel(chunk)) {
      const p = part.trim();
      if (!p) continue;
      const m = p.match(/^([^([{]*)[([{](.*)[)\]}]\s*$/s);
      const head = norm((m ? m[1] : p).replace(/\d+(\.\d+)?\s*%/g, ""));
      const inner = m ? m[2] : "";
      if (head) out.push({ raw: p, name: head, normalized: head, eNumber: extractENumber(p) ?? extractENumber(head), parent });
      if (inner) {
        // Pure number lists after an additive class: "emulsifier (322, 471)" => e322, e471
        if (/^[\d\s,;a-z()]*$/i.test(inner) && /^\s*(?:ins\s*)?\d{3,4}[a-z]?(?:\s*[,;]\s*(?:ins\s*)?\d{3,4}[a-z]?)*\s*$/i.test(inner)) {
          for (const n of inner.split(/[,;]/)) {
            const num = n.replace(/ins/i, "").trim();
            if (num) out.push({ raw: `${head} ${num}`, name: `${head} (e${num.toLowerCase()})`, normalized: `${head} (e${num.toLowerCase()})`, eNumber: `e${num.toLowerCase()}`, parent: head });
          }
        } else walk(inner, head);
      }
    }
  };
  walk(cleaned);
  return out;
}

// ---------------------------------------------------------------------------------
// Ingredient knowledge base. riskLevel is Grocerly's internal *caution rating*
// (e.g. marker of heavy processing, label-warning additive, high-intensity sweetener).
// It is NOT a toxicity claim. See docs/SCORING_ALGORITHM.md.
// ---------------------------------------------------------------------------------
type KB = Omit<IngredientKnowledge, "_id" | "normalizedName">;
const kb = (name: string, type: string, category: string, riskLevel: IngredientKnowledge["riskLevel"], description: string, synonyms: string[] = [], eNumber?: string, allergen?: string): KB =>
  ({ name, type, category, riskLevel, description, synonyms, eNumber, allergen });

export const BASE_KNOWLEDGE: KB[] = [
  kb("salt", "salt", "seasoning", "low", "Added sodium source. Already reflected in the sodium score.", ["common salt", "iodised salt", "iodized salt", "sodium chloride"]),
  kb("sugar", "sugar", "sweetener", "low", "Added sugar. Already reflected in the sugars score.", ["sucrose", "cane sugar", "raw sugar", "icing sugar"]),
  kb("glucose syrup", "sugar", "sweetener", "moderate", "Refined sweetener often used in processed foods.", ["glucose-fructose syrup", "corn syrup", "liquid glucose"]),
  kb("high fructose corn syrup", "sugar", "sweetener", "moderate", "Refined sweetener used in drinks and sweet snacks.", ["hfcs", "glucose-fructose syrup"]),
  kb("invert sugar", "sugar", "sweetener", "low", "Mixture of glucose and fructose made from sucrose.", ["invert sugar syrup"]),
  kb("maltodextrin", "base_ingredient", "carbohydrate", "moderate", "Highly processed starch derivative used as a filler or carrier; digests quickly.", []),
  kb("palm oil", "oil", "fat", "low", "Vegetable oil high in saturated fat.", ["palmolein", "palm olein", "refined palm oil", "edible vegetable oil (palm)"]),
  kb("hydrogenated vegetable oil", "oil", "fat", "high", "Partially hydrogenated fats can contain industrial trans fat.", ["partially hydrogenated vegetable oil", "vanaspati", "hydrogenated fat", "hydrogenated oil"]),
  kb("refined wheat flour", "base_ingredient", "grain", "low", "Refined flour with low fibre. Contains gluten.", ["maida", "wheat flour", "enriched wheat flour", "all purpose flour"], undefined, "wheat"),
  kb("whole wheat flour", "base_ingredient", "grain", "none", "Wholegrain flour with more fibre. Contains gluten.", ["atta", "wholemeal flour", "whole wheat atta"], undefined, "wheat"),
  kb("monosodium glutamate", "flavouring", "flavour enhancer", "moderate", "Flavour enhancer that adds sodium.", ["msg", "flavour enhancer (621)", "flavor enhancer (621)"], "e621"),
  kb("disodium inosinate", "flavouring", "flavour enhancer", "moderate", "Flavour enhancer, often paired with MSG.", [], "e631"),
  kb("disodium guanylate", "flavouring", "flavour enhancer", "moderate", "Flavour enhancer, often paired with MSG.", [], "e627"),
  kb("yeast extract", "flavouring", "flavour enhancer", "low", "Savoury flavouring that naturally contains glutamates.", []),
  kb("artificial flavour", "flavouring", "flavouring", "low", "Synthetic flavouring. Specific compounds are not disclosed.", ["artificial flavouring", "artificial flavor", "artificial flavouring substances", "nature identical flavouring substances", "nature identical flavour"]),
  kb("tartrazine", "colour", "synthetic colour", "high", "Synthetic azo dye. EU/UK labels require a warning that some azo colours may affect activity and attention in children.", ["yellow 5", "fd&c yellow 5", "ins 102"], "e102"),
  kb("sunset yellow", "colour", "synthetic colour", "high", "Synthetic azo dye with an EU/UK child-activity warning label.", ["sunset yellow fcf", "yellow 6", "ins 110"], "e110"),
  kb("carmoisine", "colour", "synthetic colour", "high", "Synthetic azo dye with an EU/UK child-activity warning label.", ["azorubine", "ins 122"], "e122"),
  kb("ponceau 4r", "colour", "synthetic colour", "high", "Synthetic azo dye with an EU/UK child-activity warning label.", ["cochineal red a", "ins 124"], "e124"),
  kb("allura red", "colour", "synthetic colour", "high", "Synthetic azo dye with an EU/UK child-activity warning label.", ["allura red ac", "red 40", "ins 129"], "e129"),
  kb("erythrosine", "colour", "synthetic colour", "high", "Synthetic colour; US authorisation for food use has been withdrawn (see regulations).", ["red 3", "ins 127"], "e127"),
  kb("brilliant blue", "colour", "synthetic colour", "moderate", "Synthetic colour.", ["brilliant blue fcf", "ins 133"], "e133"),
  kb("titanium dioxide", "colour", "colour", "moderate", "White colouring agent. No longer authorised as a food additive in the EU.", ["ins 171"], "e171"),
  kb("caramel colour", "colour", "colour", "low", "Caramel colours (E150a-d). Class III/IV are made with ammonia/sulphite.", ["caramel color", "ins 150d", "e150d", "ins 150c", "e150c"], "e150d"),
  kb("sodium benzoate", "preservative", "preservative", "moderate", "Preservative common in acidic drinks and sauces.", ["ins 211"], "e211"),
  kb("potassium sorbate", "preservative", "preservative", "low", "Preservative used to prevent mould and yeast growth.", ["ins 202"], "e202"),
  kb("sorbic acid", "preservative", "preservative", "low", "Preservative.", ["ins 200"], "e200"),
  kb("sodium nitrite", "preservative", "preservative", "high", "Curing agent in processed meats; can form nitrosamines when cooked at high heat.", ["ins 250"], "e250"),
  kb("sodium nitrate", "preservative", "preservative", "moderate", "Curing agent in processed meats.", ["ins 251"], "e251"),
  kb("tbhq", "preservative", "antioxidant", "moderate", "Synthetic antioxidant used to extend the shelf life of oils.", ["tertiary butylhydroquinone", "ins 319"], "e319"),
  kb("bha", "preservative", "antioxidant", "moderate", "Synthetic antioxidant used in fats and snacks.", ["butylated hydroxyanisole", "ins 320"], "e320"),
  kb("bht", "preservative", "antioxidant", "moderate", "Synthetic antioxidant used in fats and snacks.", ["butylated hydroxytoluene", "ins 321"], "e321"),
  kb("aspartame", "sweetener", "artificial sweetener", "moderate", "High-intensity sweetener. Must be labelled for people with phenylketonuria.", ["ins 951"], "e951"),
  kb("acesulfame potassium", "sweetener", "artificial sweetener", "moderate", "High-intensity sweetener.", ["acesulfame k", "ace-k", "ins 950"], "e950"),
  kb("sucralose", "sweetener", "artificial sweetener", "moderate", "High-intensity sweetener.", ["ins 955"], "e955"),
  kb("saccharin", "sweetener", "artificial sweetener", "moderate", "High-intensity sweetener.", ["ins 954"], "e954"),
  kb("potassium bromate", "base_ingredient", "flour improver", "high", "Flour improver used in some breads and bakery products.", ["ins 924"], "e924"),
  kb("citric acid", "base_ingredient", "acidity regulator", "none", "Common acidity regulator found naturally in citrus.", ["ins 330"], "e330"),
  kb("acidity regulator", "base_ingredient", "acidity regulator", "none", "Class name for acids/bases that control pH. Specific compounds vary.", ["acidity regulators"]),
  kb("sodium bicarbonate", "base_ingredient", "raising agent", "none", "Baking soda.", ["baking soda", "ins 500", "raising agent (500)"], "e500"),
  kb("soy lecithin", "emulsifier", "emulsifier", "low", "Emulsifier made from soybeans.", ["soya lecithin", "lecithin (soya)", "lecithin (soy)", "lecithin (322)"], "e322", "soy"),
  kb("mono- and diglycerides of fatty acids", "emulsifier", "emulsifier", "low", "Emulsifier common in baked goods and spreads.", ["mono and diglycerides", "emulsifier (471)", "ins 471"], "e471"),
  kb("polysorbate 80", "emulsifier", "emulsifier", "moderate", "Synthetic emulsifier.", ["ins 433"], "e433"),
  kb("carrageenan", "stabilizer", "stabilizer", "low", "Seaweed-derived thickener.", ["ins 407"], "e407"),
  kb("xanthan gum", "stabilizer", "stabilizer", "none", "Fermentation-derived thickener.", ["ins 415"], "e415"),
  kb("guar gum", "stabilizer", "stabilizer", "none", "Plant-derived thickener.", ["ins 412"], "e412"),
  kb("modified starch", "stabilizer", "stabilizer", "low", "Chemically or physically altered starch used as a thickener.", ["modified maize starch", "ins 1422"]),
  kb("skimmed milk powder", "base_ingredient", "dairy", "none", "Dried milk. Contains milk allergen.", ["milk powder", "milk solids", "whole milk powder"], undefined, "milk"),
  kb("whey powder", "base_ingredient", "dairy", "none", "Milk by-product. Contains milk allergen.", ["whey", "whey protein", "whey protein concentrate"], undefined, "milk"),
  kb("peanut", "base_ingredient", "nut", "none", "Peanut (legume). Major allergen.", ["peanuts", "groundnut", "groundnuts"], undefined, "peanuts"),
  kb("almond", "base_ingredient", "nut", "none", "Tree nut. Major allergen.", ["almonds"], undefined, "tree nuts"),
  kb("cashew", "base_ingredient", "nut", "none", "Tree nut. Major allergen.", ["cashews", "cashew nut", "cashew nuts"], undefined, "tree nuts"),
  kb("egg", "base_ingredient", "egg", "none", "Egg. Major allergen.", ["eggs", "egg powder", "dried egg", "albumen"], undefined, "egg"),
  kb("sesame", "base_ingredient", "seed", "none", "Sesame seed. Major allergen.", ["sesame seeds", "til", "tahini"], undefined, "sesame"),
];

export const normalizeName = (s: string) => norm(s);

/** Build lookup maps from a list of knowledge entries (from MongoDB or the built-in list). */
export function buildIndex(entries: (KB | IngredientKnowledge)[]) {
  const byName = new Map<string, KB | IngredientKnowledge>();
  const byE = new Map<string, KB | IngredientKnowledge>();
  for (const e of entries) {
    byName.set(norm(e.name), e);
    for (const s of e.synonyms ?? []) byName.set(norm(s), e);
    if (e.eNumber) byE.set(e.eNumber.toLowerCase(), e);
  }
  return { byName, byE };
}
export type KnowledgeIndex = ReturnType<typeof buildIndex>;

export function classifyIngredients(parsed: ParsedIngredient[], index: KnowledgeIndex): IngredientInsight[] {
  const seen = new Set<string>();
  const out: IngredientInsight[] = [];
  for (const p of parsed) {
    const hit = index.byName.get(p.normalized) ?? (p.eNumber ? index.byE.get(p.eNumber) : undefined) ?? index.byName.get(p.normalized.replace(/\s*\(e?\d+[a-z]?\)\s*$/, ""));
    const key = hit ? norm(hit.name) : p.normalized;
    if (seen.has(key)) continue;
    seen.add(key);
    if (hit) {
      out.push({ name: p.name, category: hit.category, type: hit.type, riskLevel: hit.riskLevel, explanation: hit.description, allergen: hit.allergen, source: "knowledge_base", confidence: 0.9 });
    } else {
      out.push({ name: p.name, category: "unclassified", type: "unknown", riskLevel: "none", explanation: "Not in the Grocerly ingredient knowledge base.", source: "unclassified", confidence: 0 });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------
// Allergen engine
// ---------------------------------------------------------------------------------
const ALLERGEN_TERMS: Record<string, { direct: string[]; derived: string[] }> = {
  milk: { direct: ["milk", "skimmed milk", "milk powder", "milk solids", "butter", "ghee", "cream", "cheese", "curd", "yoghurt", "yogurt", "paneer", "buttermilk", "khoa"], derived: ["whey", "casein", "caseinate", "lactose"] },
  wheat: { direct: ["wheat", "maida", "atta", "semolina", "suji", "rava", "durum"], derived: ["wheat starch", "wheat gluten"] },
  gluten: { direct: ["wheat", "maida", "atta", "semolina", "suji", "rava", "durum", "barley", "rye", "gluten", "spelt"], derived: ["malt", "malt extract", "malted barley"] },
  soy: { direct: ["soy", "soya", "soybean", "soybeans", "soy flour", "tofu"], derived: ["soy lecithin", "soya lecithin"] },
  peanuts: { direct: ["peanut", "peanuts", "groundnut", "groundnuts"], derived: ["peanut oil", "groundnut oil"] },
  "tree nuts": { direct: ["almond", "almonds", "cashew", "cashews", "walnut", "walnuts", "pistachio", "pistachios", "hazelnut", "hazelnuts", "pecan", "macadamia", "brazil nut"], derived: ["marzipan", "praline"] },
  egg: { direct: ["egg", "eggs", "egg powder", "egg white", "egg yolk", "albumen"], derived: ["mayonnaise", "lysozyme", "ovalbumin"] },
  fish: { direct: ["fish", "anchovy", "anchovies", "tuna", "salmon", "cod"], derived: ["fish sauce", "fish oil", "isinglass"] },
  shellfish: { direct: ["shrimp", "prawn", "prawns", "crab", "lobster", "crustacean", "crustaceans", "oyster", "mollusc", "mollusk"], derived: [] },
  sesame: { direct: ["sesame", "sesame seed", "sesame seeds", "sesame oil", "til", "tahini"], derived: [] },
};
const AMBIGUOUS_NOTE: Record<string, string[]> = { soy: ["lecithin", "e322", "emulsifier (322)"] };

const RANK: Record<AllergenLevel, number> = { contains: 3, derived: 2, may_contain: 1, unknown: 0 };
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasTerm = (text: string, term: string) => new RegExp(`(^|[^a-z])${esc(term)}([^a-z]|$)`, "i").test(text);

const DECLARED_MAP: Record<string, string> = { milk: "milk", gluten: "gluten", wheat: "wheat", soybeans: "soy", soy: "soy", peanuts: "peanuts", nuts: "tree nuts", eggs: "egg", egg: "egg", fish: "fish", crustaceans: "shellfish", molluscs: "shellfish", "sesame-seeds": "sesame" };
const cleanTag = (t: string) => t.replace(/^[a-z]{2}:/, "").toLowerCase();

/** Allergens from ingredient names + declared labels. Never claims more than the evidence supports. */
export function detectAllergens(product: Pick<Product, "ingredients" | "ingredientsText" | "allergens">): AllergenReport {
  const found = new Map<string, AllergenFinding>();
  const add = (allergen: string, level: AllergenLevel, evidence: string) => {
    const cur = found.get(allergen);
    if (!cur) found.set(allergen, { allergen, level, evidence: [evidence] });
    else {
      if (RANK[level] > RANK[cur.level]) cur.level = level;
      if (!cur.evidence.includes(evidence)) cur.evidence.push(evidence);
    }
  };

  const names = product.ingredients ?? [];
  for (const name of names) {
    for (const [allergen, terms] of Object.entries(ALLERGEN_TERMS)) {
      // Derived terms ("soy lecithin", "whey") are checked first so they are not upgraded to "contains".
      if (terms.derived.some((t) => hasTerm(name, t))) { add(allergen, "derived", `Ingredient "${name}" is derived from ${allergen}`); continue; }
      if (terms.direct.some((t) => hasTerm(name, t))) add(allergen, "contains", `Ingredient list includes "${name}"`);
    }
    for (const [allergen, amb] of Object.entries(AMBIGUOUS_NOTE)) {
      if (amb.some((a) => hasTerm(name, a)) && !found.get(allergen)) add(allergen, "unknown", `"${name}" can be made from ${allergen}; source not stated on the label`);
    }
  }
  for (const tag of product.allergens?.declared ?? []) {
    const a = DECLARED_MAP[cleanTag(tag)]; if (a) add(a, "contains", "Declared on the label");
  }
  for (const tag of product.allergens?.traces ?? []) {
    const a = DECLARED_MAP[cleanTag(tag)]; if (a) add(a, "may_contain", "Label says it may contain traces");
  }
  const known = names.length > 0 || (product.allergens?.declared?.length ?? 0) > 0 || (product.allergens?.traces?.length ?? 0) > 0;
  return { known, findings: [...found.values()].sort((a, b) => RANK[b.level] - RANK[a.level] || a.allergen.localeCompare(b.allergen)) };
}
