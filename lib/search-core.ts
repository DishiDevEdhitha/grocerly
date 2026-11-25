import { norm, stemToken } from "./identity";
import { findNodesForPhrase } from "./taxonomy";
import type { Nutrition } from "./types";

/** Pure search logic (no database): query understanding, relevance scoring, chip building. */

// Common misspellings / spelling variants seen in Indian product searches.
const SPELLING: Record<string, string> = { nodles: "noodle", noodels: "noodle", maggie: "maggi", magi: "maggi", chese: "cheese", chees: "cheese", biscut: "biscuit", biscit: "biscuit", bisket: "biscuit", yoghurt: "yogurt", flavored: "flavoured", chocolat: "chocolate", choclate: "chocolate", coke: "cola", crisp: "chip", namkin: "namkeen", nankeen: "namkeen", kurkure: "kurkure" };

export function tokenizeQuery(q: string): string[] {
  return norm(q).split(" ").filter(Boolean).map((t) => stemToken(SPELLING[t] ?? t));
}

export interface SearchIntent {
  raw: string;
  tokens: string[];
  brand?: string;               // normalised brand (as stored in brandNorm)
  nodes: string[][];            // taxonomy paths the query refers to (e.g. noodles -> Instant Noodles, Cup Noodles)
  nodeNames: string[];          // flat list of names to match against product.categoryPath
  freeTokens: string[];         // words that are neither brand nor category: must appear in the product name
}

/**
 * Understand the query:
 *   "maggi"            -> brand=maggi
 *   "maggi noodles"    -> brand=maggi + category nodes for noodles
 *   "cheese"           -> category Cheese (and everything under it)
 *   "processed cheese" -> only Processed Cheese
 *   "oreo"             -> free token (matched against product names)
 */
export function parseIntent(q: string, knownBrands: string[]): SearchIntent {
  const tokens = tokenizeQuery(q);
  const brandSet = new Map(knownBrands.map((b) => [b.split(" ").map(stemToken).join(" "), b]));
  let brand: string | undefined; let used = new Array(tokens.length).fill(false);
  // longest brand phrase anywhere in the query (up to 3 words)
  outer: for (let len = Math.min(3, tokens.length); len >= 1; len--) {
    for (let i = 0; i + len <= tokens.length; i++) {
      const phrase = tokens.slice(i, i + len).join(" ");
      if (brandSet.has(phrase)) { brand = brandSet.get(phrase); for (let k = i; k < i + len; k++) used[k] = true; break outer; }
    }
  }
  let rest = tokens.filter((_, i) => !used[i]);
  // longest category phrase in what remains (up to 3 words)
  let nodes: string[][] = []; used = new Array(rest.length).fill(false);
  outer2: for (let len = Math.min(3, rest.length); len >= 1; len--) {
    for (let i = 0; i + len <= rest.length; i++) {
      const found = findNodesForPhrase(rest.slice(i, i + len).join(" "));
      if (found.length) { nodes = found; for (let k = i; k < i + len; k++) used[k] = true; break outer2; }
    }
  }
  const freeTokens = rest.filter((_, i) => !used[i]);
  // Match on the LAST element of each path: "cheese" -> Cheese (which every cheese type carries in its path), never the parent department.
  const nodeNames = [...new Set(nodes.map((p) => p[p.length - 1]))];
  return { raw: q, tokens, brand, nodes, nodeNames, freeTokens };
}

export interface Candidate {
  id: string; name: string; nameNorm?: string; brandNorm?: string; productType?: string; categoryPath?: string[];
  qualityScore?: number; image?: string; hasNutrition?: boolean;
}

/** Relevance score. Higher is better. Only ordering; filtering has already happened in the database query. */
export function relevance(c: Candidate, intent: SearchIntent): number {
  let s = 0;
  if (intent.brand && c.brandNorm === intent.brand) s += 40;
  if (intent.nodes.length) {
    const path = c.categoryPath ?? [];
    if (intent.nodes.some((p) => c.productType === p[p.length - 1])) s += 35;   // exact product type
    else if (intent.nodes.some((p) => p.every((x) => path.includes(x)))) s += 20; // inside the category
  }
  const nameTokens = new Set((c.nameNorm ?? norm(c.name)).split(" ").map(stemToken));
  for (const t of intent.freeTokens) if (nameTokens.has(t)) s += 12;
  const first = (c.nameNorm ?? norm(c.name)).split(" ")[0];
  if (intent.tokens[0] && stemToken(first) === intent.tokens[0]) s += 4;
  s += (c.qualityScore ?? 0) / 10;           // 0..10, prefers complete records
  if (c.image) s += 3;
  if (c.hasNutrition) s += 3;
  return Math.round(s * 100) / 100;
}

export interface Chip { label: string; count: number }
/** Chips are computed from the products that really matched (never hard-coded). */
export function buildChips(cands: Pick<Candidate, "productType" | "categoryPath">[], max = 8): Chip[] {
  const counts = new Map<string, number>();
  for (const c of cands) { const label = c.productType ?? c.categoryPath?.[c.categoryPath.length - 1]; if (label && label !== "Uncategorised") counts.set(label, (counts.get(label) ?? 0) + 1); }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, max).map(([label, count]) => ({ label, count }));
}

export type SortKey = "relevance" | "score" | "protein" | "sodium" | "sugars";
export const SORTS: { key: SortKey; label: string }[] = [
  { key: "relevance", label: "Best match" }, { key: "score", label: "Highest score" }, { key: "protein", label: "Most protein" },
  { key: "sodium", label: "Lowest sodium" }, { key: "sugars", label: "Lowest sugar" },
];

/** Products with the sort metric missing always go LAST (we never treat missing as zero). */
export function sortCandidates<T extends { relevance: number; score: number | null; nutrition: Nutrition }>(items: T[], sort: SortKey): T[] {
  const get = (x: T): number | null => (sort === "score" ? x.score : sort === "relevance" ? x.relevance : x.nutrition[sort] ?? null);
  const desc = sort === "relevance" || sort === "score" || sort === "protein";
  return [...items].sort((a, b) => {
    const A = get(a), B = get(b);
    if (A == null && B == null) return b.relevance - a.relevance;
    if (A == null) return 1; if (B == null) return -1;
    return (desc ? B - A : A - B) || b.relevance - a.relevance;
  });
}
