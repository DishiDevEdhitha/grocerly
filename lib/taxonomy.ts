import type { ScoreProfileId } from "./types";
import { norm, stemToken } from "./identity";

/**
 * Category tree used to CLASSIFY products when they are imported.
 * Search chips are NOT read from here: they are computed from the products that actually exist.
 * Keywords are matched as whole words/phrases; the LONGEST matching keyword wins, so
 * "chocolate cream biscuit" lands in Biscuits (cream biscuit) rather than Chocolates (chocolate).
 */
export interface TaxNode { name: string; keywords: string[]; negative?: string[]; profile?: ScoreProfileId; children?: TaxNode[] }
const n = (name: string, keywords: string[], extra: Partial<TaxNode> = {}): TaxNode => ({ name, keywords, ...extra });

export const TAXONOMY: TaxNode[] = [
  n("Dairy", [], { children: [
    n("Milk", ["toned milk", "full cream milk", "double toned milk", "skimmed milk", "pasteurised milk", "pasteurized milk", "uht milk", "cow milk", "buffalo milk", "standardised milk", "milks"]),
    n("Cheese", ["cheese", "cheddar"], { children: [
      n("Processed Cheese", ["processed cheese", "cheese block", "cheddar cheese", "cheese tin"]),
      n("Cheese Slices", ["cheese slice", "cheese slices", "slices cheese"]),
      n("Mozzarella", ["mozzarella", "pizza cheese", "pizza mozzarella"]),
      n("Cheese Spread", ["cheese spread", "cream cheese", "cheese dip", "cheezy spread"]),
      n("Cheese Cubes", ["cheese cube", "cheese cubes", "cheese portions"]),
    ] }),
    n("Yogurt & Curd", ["yogurt", "yoghurt", "curd", "dahi", "greek yogurt", "greek yoghurt"]),
    n("Paneer", ["paneer", "cottage cheese"]),
    n("Butter & Ghee", ["butter", "ghee", "table butter", "white butter"]),
  ] }),
  n("Snacks", [], { children: [
    n("Chips", ["potato chips", "chips", "crisps", "potato crisps", "wafers", "tortilla chips", "nachos"], { profile: "chips_snacks" }),
    n("Namkeen", ["namkeen", "bhujia", "sev", "mixture", "chivda", "chakli", "murukku", "khakhra", "moong dal namkeen", "aloo bhujia"], { profile: "chips_snacks" }),
    n("Puffed & Extruded Snacks", ["puffs", "kurkure", "extruded snack", "corn puffs", "rings", "puffed snack", "makhana"], { profile: "chips_snacks" }),
    n("Popcorn", ["popcorn"], { profile: "chips_snacks" }),
    n("Bars", ["protein bar", "energy bar", "granola bar", "muesli bar", "cereal bar", "snack bar"], { profile: "protein_bar" }),
  ] }),
  n("Instant Foods", [], { children: [
    n("Instant Noodles", ["instant noodles", "noodles", "masala noodles", "2 minute noodles", "2 minutes noodles", "atta noodles", "hakka noodles"], { profile: "noodles", negative: ["cup noodles", "cup noodle"] }),
    n("Cup Noodles", ["cup noodles", "cup noodle", "noodles cup", "instant cup noodles"], { profile: "noodles" }),
    n("Pasta", ["pasta", "macaroni", "penne", "spaghetti", "fusilli", "vermicelli", "pasta mix"], { profile: "noodles" }),
    n("Instant Soups", ["instant soup", "soup mix", "cup soup", "soup"]),
    n("Ready Mixes", ["ready mix", "instant mix", "idli mix", "dosa mix", "upma mix", "poha", "gulab jamun mix", "ready to cook", "ready to eat"]),
  ] }),
  n("Beverages", [], { children: [
    n("Soft Drinks", ["soft drink", "cola", "soda", "carbonated", "carbonated drink", "thums up", "pepsi", "sprite", "fanta", "limca", "mountain dew", "7up", "7 up", "maaza", "mirinda", "lemon soda"], { profile: "beverage" }),
    n("Juices", ["juice", "nectar", "fruit drink", "real fruit power", "coconut water"], { profile: "beverage" }),
    n("Energy Drinks", ["energy drink", "red bull", "monster", "sports drink", "electrolyte"], { profile: "beverage" }),
    n("Flavoured Milk", ["flavoured milk", "flavored milk", "milkshake", "milk shake", "chocolate milk", "lassi", "buttermilk", "chaas", "badam milk", "cold coffee"], { profile: "beverage" }),
    n("Health Drinks", ["health drink", "malt drink", "bournvita", "horlicks", "boost", "complan", "protein powder"]),
    n("Tea & Coffee", ["instant coffee", "tea bags", "tea powder", "green tea", "coffee powder", "chai", "filter coffee", "tea"]),
  ] }),
  n("Biscuits", [], { children: [
    n("Cream Biscuits", ["cream biscuit", "cream biscuits", "sandwich biscuit", "oreo", "bourbon", "jim jam", "hide and seek", "creme biscuit", "chocolate cream"], { profile: "biscuits" }),
    n("Cookies", ["cookie", "cookies", "butter biscuit", "cashew biscuit", "choco chip", "choco chips", "oatmeal biscuit", "good day", "bakery biscuit"], { profile: "biscuits" }),
    n("Crackers", ["cracker", "crackers", "salted biscuit", "monaco", "cream cracker", "krackjack"], { profile: "biscuits" }),
    n("Tea & Glucose Biscuits", ["marie", "glucose biscuit", "parle g", "tea biscuit", "digestive", "rusk biscuit", "milk biscuit", "milk bikis"], { profile: "biscuits" }),
  ] }),
  n("Chocolates & Sweets", [], { children: [
    n("Chocolates", ["chocolate", "dairy milk", "kitkat", "kit kat", "five star", "munch", "perk", "milky bar", "chocolate bar"]),
    n("Candy & Toffee", ["candy", "toffee", "lollipop", "mints", "gum", "eclairs", "jelly"]),
    n("Indian Sweets", ["mithai", "laddu", "ladoo", "barfi", "gulab jamun", "rasgulla", "soan papdi", "halwa", "peda"]),
  ] }),
  n("Cereals", [], { children: [
    n("Breakfast Cereals", ["breakfast cereal", "cornflakes", "corn flakes", "muesli", "granola", "choco flakes", "chocos", "oats", "rolled oats", "instant oats", "wheat flakes", "ragi flakes"], { profile: "cereal" }),
  ] }),
  n("Spreads", [], { children: [
    n("Peanut Butter", ["peanut butter", "nut butter", "almond butter"]),
    n("Chocolate Spread", ["chocolate spread", "hazelnut spread", "nutella", "choco spread"]),
    n("Jams & Honey", ["jam", "fruit spread", "marmalade", "honey", "fruit jam", "mixed fruit jam"]),
  ] }),
  n("Sauces & Condiments", [], { children: [
    n("Ketchup", ["ketchup", "tomato sauce", "tomato ketchup"]),
    n("Sauces", ["sauce", "mayonnaise", "mayo", "schezwan", "chutney", "dip", "soy sauce", "chilli sauce", "pasta sauce", "pizza sauce"]),
    n("Seasonings", ["seasoning", "tastemaker", "taste maker", "spice mix", "bouillon", "stock cube", "bouillon cube", "wurze", "masala powder", "chat masala", "garam masala", "flavour enhancer"]),
    n("Pickles", ["pickle", "achar", "achaar"]),
  ] }),
  n("Bakery", [], { children: [
    n("Bread & Buns", ["bread", "bun", "buns", "pav", "loaf", "kulcha", "burger bun", "milk bread", "brown bread"]),
    n("Cakes & Muffins", ["cake", "muffin", "brownie", "cupcake", "swiss roll", "pastry", "plum cake"]),
    n("Rusks", ["rusk", "toast", "cake rusk", "tea rusk"]),
  ] }),
  n("Frozen Food", [], { children: [
    n("Ice Cream", ["ice cream", "kulfi", "gelato", "frozen dessert"]),
    n("Frozen Snacks", ["frozen", "nuggets", "french fries", "frozen paratha", "frozen snack", "tikki", "frozen veg"]),
  ] }),
  n("Staples", [], { children: [
    n("Atta & Flours", ["atta", "flour", "maida", "besan", "sooji", "rava", "semolina", "ragi flour", "multigrain atta"]),
    n("Rice", ["basmati", "rice", "sona masoori", "poha rice"]),
    n("Dals & Pulses", ["dal", "pulses", "lentil", "toor dal", "moong dal", "chana dal", "urad dal", "rajma", "chickpeas"]),
    n("Cooking Oils", ["cooking oil", "sunflower oil", "mustard oil", "rice bran oil", "refined oil", "groundnut oil", "coconut oil", "olive oil", "vegetable oil"]),
    n("Sugar & Salt", ["iodised salt", "iodized salt", "table salt", "rock salt", "jaggery", "sugar", "salt"]),
  ] }),
];

export interface Leaf { path: string[]; node: TaxNode; keywords: string[]; negative: string[]; profile?: ScoreProfileId }
function flatten(nodes: TaxNode[], parent: string[] = [], inheritedProfile?: ScoreProfileId): Leaf[] {
  const out: Leaf[] = [];
  for (const nd of nodes) {
    const path = [...parent, nd.name];
    const profile = nd.profile ?? inheritedProfile;
    if (nd.keywords.length) out.push({ path, node: nd, keywords: nd.keywords.map(norm), negative: (nd.negative ?? []).map(norm), profile });
    if (nd.children) out.push(...flatten(nd.children, path, profile));
  }
  return out;
}
export const LEAVES: Leaf[] = flatten(TAXONOMY);
export const DEPARTMENTS = TAXONOMY.map((t) => t.name);

const hasPhrase = (text: string, phrase: string) => phrase.length > 0 && (` ${text} `).includes(` ${phrase} `);

export interface Classification { path: string[]; productType: string; department: string; profile?: ScoreProfileId; matched?: string; confidence: number }

/** Classify from the product NAME (strong signal) and any external category tags (weaker signal). */
export function classify(input: { name: string; brand?: string; tags?: string[] }): Classification {
  const name = norm(input.name);
  const tags = (input.tags ?? []).map((t) => norm(t.replace(/^[a-z]{2}:/, "").replace(/-/g, " "))).join(" | ");
  let best: { leaf: Leaf; len: number; kw: string; inName: boolean } | null = null;
  for (const leaf of LEAVES) {
    if (leaf.negative.some((x) => hasPhrase(name, x) || hasPhrase(tags, x))) continue;
    for (const kw of leaf.keywords) {
      const inName = hasPhrase(name, kw), inTags = hasPhrase(tags, kw);
      if (!inName && !inTags) continue;
      const len = kw.length + (inName ? 100 : 0); // a match in the product name beats one in tags
      if (!best || len > best.len) best = { leaf, len, kw, inName };
    }
  }
  if (!best) return { path: ["Uncategorised"], productType: "Uncategorised", department: "Uncategorised", confidence: 0 };
  const path = best.leaf.path;
  return { path, productType: path[path.length - 1], department: path[0], profile: best.leaf.profile, matched: best.kw, confidence: best.inName ? 0.85 : 0.6 };
}

const SYNONYMS: Record<string, string> = { crisp: "chip", dahi: "yogurt", yoghurt: "yogurt", soda: "soft drink", cola: "soft drink", biscut: "biscuit", mithai: "indian sweet", pickle: "pickle", achar: "pickle", chocolates: "chocolate" };

/**
 * Find taxonomy nodes a search phrase refers to (e.g. "noodles" -> Instant Noodles + Cup Noodles).
 * Only GENERIC category words match. Product-specific keywords (oreo, kurkure, thums up) are deliberately NOT
 * treated as categories, so searching "oreo" finds Oreo products instead of every cream biscuit.
 */
export function findNodesForPhrase(phraseRaw: string): string[][] {
  const stem = (s: string) => norm(s).split(" ").map(stemToken).join(" ");
  let phrase = stem(phraseRaw);
  phrase = SYNONYMS[phrase] ?? phrase;
  if (!phrase) return [];
  const all = [...LEAVES.map((l) => l.path), ...TAXONOMY.map((t) => [t.name])];
  const exact = all.filter((p) => stem(p[p.length - 1]) === phrase);
  if (exact.length) return dedupePaths(exact);
  const contains = all.filter((p) => ` ${stem(p[p.length - 1])} `.includes(` ${phrase} `));
  return dedupePaths(contains);
}
const dedupePaths = (ps: string[][]) => [...new Map(ps.map((p) => [p.join(">"), p])).values()];
