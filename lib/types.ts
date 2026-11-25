import type { ObjectId } from "mongodb";

/** Where a piece of data came from. Used for provenance everywhere. */
export type Provenance = "openfoodfacts" | "ocr" | "manual" | "ai" | "dataset" | "gemini";
export type ConfidenceLevel = "verified" | "high" | "medium" | "low" | "unknown";
export type CatalogStatus = "active" | "needs_review" | "hidden";
export interface SourceEntry { source: Provenance; name?: string; confidence: number; ref?: string; url?: string; license?: string; fetchedAt: Date }

/** Canonical nutrient keys. Units are fixed (see NUTRIENT_META in nutrition.ts). */
export const NUTRIENT_KEYS = [
  "calories", "protein", "carbohydrates", "sugars", "addedSugars",
  "fat", "saturatedFat", "transFat", "fiber", "sodium", "cholesterol",
] as const;
export type NutrientKey = (typeof NUTRIENT_KEYS)[number];

/** Flexible: any subset of nutrients may be present. Absent != zero. */
export type Nutrition = Partial<Record<NutrientKey, number>>;

export interface FieldMeta {
  confidence: number; // 0..1
  source: Provenance;
  verifiedByUser?: boolean;
}
export type NutritionMeta = Partial<Record<NutrientKey, FieldMeta>>;

export type ScoreProfileId =
  | "default" | "chips_snacks" | "protein_bar" | "cereal" | "beverage" | "biscuits" | "noodles";

export interface Product {
  _id?: ObjectId;
  /** null for products created purely from user photos without a barcode. */
  barcode: string | null;
  name: string;
  brand?: string;
  category: string;
  categoryTags: string[];
  profile: ScoreProfileId;
  quantity?: { value: number; unit: string };
  /** Nutrition is always stored per 100 g (or per 100 ml for beverages). */
  nutritionBasis: { amount: 100; unit: "g" | "ml" };
  nutrition: Nutrition;
  nutritionMeta?: NutritionMeta;
  ingredients: string[];
  ingredientsText?: string;
  allergens: { declared: string[]; traces: string[] };
  images: { front?: string; ingredients?: string; nutrition?: string };
  price?: { value: number; currency: string };
  nova?: number;
  source: { type: Provenance; confidence: number; ref?: string; url?: string; fetchedAt: Date };
  createdAt: Date;
  updatedAt: Date;

  // ---- Catalogue v2 (all optional so older documents stay valid) ----
  brandNorm?: string;
  nameNorm?: string;
  productType?: string;            // leaf of categoryPath, e.g. "Processed Cheese"
  categoryPath?: string[];         // e.g. ["Dairy", "Cheese", "Processed Cheese"]
  identityKey?: string;
  searchTokens?: string[];
  catalogStatus?: CatalogStatus;   // only "active" products appear in search/alternatives
  qualityScore?: number;           // 0..100 completeness of the record
  servingSize?: { value: number; unit: "g" | "ml"; text?: string };
  nutritionPerServing?: Nutrition;
  dietary?: { vegetarian?: boolean | null; vegan?: boolean | null };
  claims?: string[];
  image?: string;                  // canonical front-of-pack image
  imageSmall?: string;
  sources?: SourceEntry[];
  confidence?: { nutrition: ConfidenceLevel; ingredients: ConfidenceLevel; allergens: ConfidenceLevel; overall: ConfidenceLevel };
  purchaseLinks?: { blinkit?: string; zepto?: string; bigbasket?: string };
}

export type RiskLevel = "none" | "low" | "moderate" | "high";

export interface IngredientKnowledge {
  _id?: ObjectId;
  name: string;
  normalizedName: string;
  category: string;
  type: string;
  allergen?: string;
  riskLevel: RiskLevel;
  description: string;
  synonyms: string[];
  eNumber?: string;
}

export interface IngredientInsight {
  name: string;
  category: string;
  type: string;
  riskLevel: RiskLevel;
  explanation: string;
  allergen?: string;
  /** "knowledge_base" ingredients can influence the score; "ai" ones never do. */
  source: "knowledge_base" | "ai" | "unclassified";
  confidence: number;
}

export type AllergenLevel = "contains" | "derived" | "may_contain" | "unknown";
export interface AllergenFinding {
  allergen: string;
  level: AllergenLevel;
  evidence: string[];
}
export interface AllergenReport {
  known: boolean; // false when we have no ingredient list and no declared allergens
  findings: AllergenFinding[];
}

export type RegStatus = "allowed" | "restricted" | "banned" | "unknown";
export interface RegulationRecord {
  _id?: ObjectId;
  ingredientKey: string; // e.g. "e924"
  ingredientId?: ObjectId;
  productId?: ObjectId;
  country: string; // ISO 3166-1 alpha-2
  status: RegStatus;
  reason: string;
  authority: string;
  sourceUrl: string;
  verifiedAt: Date | null;
  verification: "seed-unverified" | "verified";
}
export interface CountryStatus {
  country: string;
  countryName: string;
  status: RegStatus;
  summary: string;
  details: { ingredient: string; status: RegStatus; reason: string; authority: string; sourceUrl: string; verifiedAt: string | null; verification: string }[];
}

export interface ScoreReason { key: string; label: string; points: number; detail: string }
export interface ScoreResult {
  score: number | null;
  scoreVersion: string;
  profile: ScoreProfileId;
  band: "better" | "moderate" | "poor" | "avoid" | "insufficient";
  nutritionScore: number | null;
  ingredientScore: number;
  penalties: ScoreReason[];
  positives: ScoreReason[];
  warnings: ScoreReason[];
  reasons: string[];
  missing: NutrientKey[];
  dataCompleteness: number; // 0..1 share of core nutrients that were available
}

export interface ProductAnalysis extends ScoreResult {
  _id?: ObjectId;
  productId: ObjectId;
  generatedAt: Date;
  ingredientInsights: IngredientInsight[];
  allergenReport: AllergenReport;
  regulatory: CountryStatus[];
}

export type ScanMethod = "barcode" | "search" | "ocr" | "cart_screenshot";
