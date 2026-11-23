import { MongoClient, type Db, type Collection, type Document } from "mongodb";
import type {
  Product, ProductAnalysis, IngredientKnowledge, RegulationRecord,
} from "./types";

/**
 * MongoDB connection (server-side only).
 * The client is cached on `globalThis` so Next.js hot-reload and serverless
 * invocations reuse one connection pool instead of opening a new one per request.
 */
export class MongoConfigError extends Error {
  constructor(msg = "MONGODB_URI is not set. Copy .env.example to .env.local and add your Atlas connection string.") {
    super(msg);
    this.name = "MongoConfigError";
  }
}

const g = globalThis as unknown as {
  _grocerlyMongo?: Promise<MongoClient>;
  _grocerlyIndexes?: Promise<void>;
};

function getClient(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new MongoConfigError();
  if (!g._grocerlyMongo) {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000, maxPoolSize: 10 });
    g._grocerlyMongo = client.connect().catch((e) => {
      g._grocerlyMongo = undefined; // allow retry on next request
      throw e;
    });
  }
  return g._grocerlyMongo;
}

export async function getDb(): Promise<Db> {
  const client = await getClient();
  const db = client.db(process.env.MONGODB_DB || "grocerly");
  if (!g._grocerlyIndexes) {
    g._grocerlyIndexes = ensureIndexes(db).catch((e) => {
      console.error("[grocerly] ensureIndexes failed:", e);
      g._grocerlyIndexes = undefined;
    });
  }
  await g._grocerlyIndexes;
  return db;
}

export const col = {
  products: (db: Db) => db.collection<Product>("products"),
  analysis: (db: Db) => db.collection<ProductAnalysis>("product_analysis"),
  ingredients: (db: Db) => db.collection<IngredientKnowledge>("ingredients"),
  regulations: (db: Db) => db.collection<RegulationRecord>("regulations"),
  submissions: (db: Db) => db.collection<Document>("submissions"),
  users: (db: Db) => db.collection<Document>("users"),
  history: (db: Db) => db.collection<Document>("scan_history"),
  saved: (db: Db) => db.collection<Document>("saved_products"),
};
export type { Collection };

/** $jsonSchema validator: MongoDB itself rejects malformed product documents. */
export const PRODUCT_VALIDATOR = {
  $jsonSchema: {
    bsonType: "object",
    required: ["name", "nutrition", "ingredients", "source", "createdAt", "updatedAt"],
    properties: {
      barcode: { bsonType: ["string", "null"] },
      name: { bsonType: "string", minLength: 1 },
      nutrition: { bsonType: "object" },
      ingredients: { bsonType: "array", items: { bsonType: "string" } },
      source: {
        bsonType: "object",
        required: ["type", "confidence"],
        properties: {
          type: { enum: ["openfoodfacts", "ocr", "manual", "ai"] },
          confidence: { bsonType: ["double", "int"], minimum: 0, maximum: 1 },
        },
      },
    },
  },
};

/** Creates collections (with validation) and all indexes. Safe to run repeatedly. */
export async function ensureIndexes(db: Db): Promise<void> {
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  if (!existing.has("products")) {
    await db.createCollection("products", { validator: PRODUCT_VALIDATOR, validationLevel: "moderate", validationAction: "error" });
  } else {
    await db.command({ collMod: "products", validator: PRODUCT_VALIDATOR, validationLevel: "moderate", validationAction: "error" }).catch(() => undefined);
  }

  const p = col.products(db);
  await Promise.all([
    // Unique only when barcode is a string, so photo-only products (barcode: null) can coexist.
    p.createIndex({ barcode: 1 }, { unique: true, partialFilterExpression: { barcode: { $type: "string" } }, name: "barcode_unique" }),
    p.createIndex({ name: 1 }, { name: "name_1" }),
    p.createIndex({ brand: 1 }, { name: "brand_1" }),
    p.createIndex({ category: 1 }, { name: "category_1" }),
    p.createIndex({ profile: 1, categoryTags: 1 }, { name: "profile_categoryTags" }),
    p.createIndex({ name: "text", brand: "text", ingredientsText: "text" }, { name: "products_text", weights: { name: 10, brand: 5, ingredientsText: 1 } }),
    col.analysis(db).createIndex({ productId: 1, scoreVersion: 1 }, { unique: true, name: "analysis_product_version" }),
    col.ingredients(db).createIndex({ normalizedName: 1 }, { unique: true, name: "ingredient_name_unique" }),
    col.ingredients(db).createIndex({ eNumber: 1 }, { sparse: true, name: "ingredient_enumber" }),
    col.regulations(db).createIndex({ ingredientKey: 1, country: 1 }, { name: "reg_ingredient_country" }),
    col.submissions(db).createIndex({ submissionId: 1 }, { unique: true, name: "submission_id" }),
    col.users(db).createIndex({ userId: 1 }, { unique: true, name: "user_id" }),
    col.history(db).createIndex({ userId: 1, scannedAt: -1 }, { name: "history_user_time" }),
    col.saved(db).createIndex({ userId: 1, productId: 1 }, { unique: true, name: "saved_user_product" }),
  ]);
}
