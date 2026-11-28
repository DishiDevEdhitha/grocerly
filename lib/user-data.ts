import { C, type DB } from "./db";
import { getProductsByIds, getScores } from "./products";

/** A person's own data lives under users/{userId}/history and users/{userId}/saved (Firestore subcollections). */
export interface ListRow { id: string; name: string; brand?: string; image?: string; score: number | null; scannedAt?: Date; savedAt?: Date; method?: string; category?: string }

async function join(db: DB, rows: { productId: string; [k: string]: unknown }[]): Promise<ListRow[]> {
  const ids = rows.map((r) => r.productId);
  const [products, scores] = await Promise.all([getProductsByIds(db, ids), getScores(db, ids)]);
  const out: ListRow[] = [];
  for (const r of rows) {
    const p = products.get(r.productId); if (!p) continue; // product was deleted: skip
    out.push({ id: p._id, name: p.name, brand: p.brand, image: p.imageSmall ?? p.image ?? p.images?.front, category: p.category, score: scores.get(p._id) ?? null, scannedAt: r.scannedAt as Date | undefined, savedAt: r.savedAt as Date | undefined, method: r.method as string | undefined });
  }
  return out;
}

export async function listHistory(db: DB, userId: string, limit = 100): Promise<ListRow[]> {
  const snap = await db.collection(C.users).doc(userId).collection("history").orderBy("scannedAt", "desc").limit(limit).get();
  return join(db, snap.docs.map((d) => d.data() as never));
}
export async function listSaved(db: DB, userId: string, limit = 200): Promise<ListRow[]> {
  const snap = await db.collection(C.users).doc(userId).collection("saved").orderBy("savedAt", "desc").limit(limit).get();
  return join(db, snap.docs.map((d) => d.data() as never));
}
export async function saveProduct(db: DB, userId: string, productId: string): Promise<void> {
  const ref = db.collection(C.users).doc(userId).collection("saved").doc(productId); // id = productId, so it can never be saved twice
  if (!(await ref.get()).exists) await ref.set({ productId, savedAt: new Date() });
}
export async function unsaveProduct(db: DB, userId: string, productId: string): Promise<void> {
  await db.collection(C.users).doc(userId).collection("saved").doc(productId).delete();
}
export async function isSaved(db: DB, userId: string, productId: string): Promise<boolean> {
  return (await db.collection(C.users).doc(userId).collection("saved").doc(productId).get()).exists;
}
