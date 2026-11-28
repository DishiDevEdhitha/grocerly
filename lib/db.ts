import { initializeApp, cert, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

/**
 * Grocerly's database layer (Google Cloud Firestore, a NoSQL document database).
 * The rest of the app talks ONLY to the small interface below, never to Firestore directly.
 * That keeps the database swappable and lets the tests run against an in-memory copy (lib/memory-db.ts).
 */
export class DbConfigError extends Error {
  constructor(msg = "Firebase is not configured. Set FIREBASE_SERVICE_ACCOUNT_BASE64 in .env.local (see the guide, Step 2).") { super(msg); this.name = "DbConfigError"; }
}

export type Data = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
/** Write-time helpers: "add 1 to this number" and "add to this list without duplicates". */
export class Inc { constructor(public n: number) {} }
export class ArrayUnion { constructor(public items: unknown[]) {} }
export const increment = (n = 1) => new Inc(n);
export const arrayUnion = (...items: unknown[]) => new ArrayUnion(items);

export interface Snap { id: string; exists: boolean; data(): Data | undefined }
export interface QuerySnap { docs: Snap[]; size: number }
export type Op = "==" | "array-contains" | ">=" | "<";
export interface Query {
  where(field: string, op: Op, value: unknown): Query;
  orderBy(field: string, dir?: "asc" | "desc"): Query;
  limit(n: number): Query;
  get(): Promise<QuerySnap>;
  count(): Promise<number>;
}
export interface Doc {
  id: string;
  get(): Promise<Snap>;
  set(data: Data, opts?: { merge?: boolean }): Promise<void>;
  update(data: Data): Promise<void>;
  delete(): Promise<void>;
  collection(name: string): Coll;
}
export interface Coll extends Query { doc(id?: string): Doc }
export interface DB { name: string; collection(name: string): Coll; getAll(...docs: Doc[]): Promise<Snap[]>; ping(): Promise<void> }

/** Collection names in one place. */
export const C = {
  products: "products", analysis: "product_analysis", ingredients: "ingredients", regulations: "regulations",
  submissions: "submissions", users: "users", rateLimits: "rate_limits", meta: "meta",
} as const;

// ---------------------------------------------------------------------------------------------
// Firestore adapter
// ---------------------------------------------------------------------------------------------
/* eslint-disable @typescript-eslint/no-explicit-any */
function toFs(v: any): any {
  if (v instanceof Inc) return FieldValue.increment(v.n);
  if (v instanceof ArrayUnion) return FieldValue.arrayUnion(...v.items.map(toFs));
  if (Array.isArray(v)) return v.map(toFs);
  if (v instanceof Date || v === null || typeof v !== "object") return v;
  const out: any = {};
  for (const [k, x] of Object.entries(v)) if (x !== undefined) out[k] = toFs(x);
  return out;
}
function fromFs(v: any): any {
  if (v && typeof v.toDate === "function") return v.toDate();      // Firestore Timestamp -> Date
  if (Array.isArray(v)) return v.map(fromFs);
  if (v && typeof v === "object" && !(v instanceof Date)) { const o: any = {}; for (const [k, x] of Object.entries(v)) o[k] = fromFs(x); return o; }
  return v;
}
const wrapSnap = (s: any): Snap => ({ id: s.id, exists: s.exists, data: () => (s.exists ? fromFs(s.data()) : undefined) });
function wrapQuery(q: any): Query {
  return {
    where: (f, o, v) => wrapQuery(q.where(f, o, v)),
    orderBy: (f, d) => wrapQuery(q.orderBy(f, d ?? "asc")),
    limit: (n) => wrapQuery(q.limit(n)),
    get: async () => { const s = await q.get(); return { docs: s.docs.map(wrapSnap), size: s.size }; },
    count: async () => (await q.count().get()).data().count,
  };
}
function wrapDoc(d: any): Doc & { __ref: any } {
  return {
    __ref: d, id: d.id,
    get: async () => wrapSnap(await d.get()),
    set: async (data, opts) => { await d.set(toFs(data), opts ?? {}); },
    update: async (data) => { await d.update(toFs(data)); },
    delete: async () => { await d.delete(); },
    collection: (n) => wrapColl(d.collection(n)),
  };
}
function wrapColl(c: any): Coll { return { ...wrapQuery(c), doc: (id?: string) => wrapDoc(id ? c.doc(id) : c.doc()) }; }

function credential() {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (b64 || raw) {
    let json: any;
    try { json = JSON.parse(b64 ? Buffer.from(b64, "base64").toString("utf8") : (raw as string)); }
    catch { throw new DbConfigError("The Firebase key could not be read. Re-create FIREBASE_SERVICE_ACCOUNT_BASE64 from the downloaded JSON file."); }
    if (!json?.project_id || !json?.client_email || !json?.private_key) throw new DbConfigError("The Firebase key is missing project_id, client_email or private_key.");
    json.private_key = String(json.private_key).replace(/\\n/g, "\n");
    return { cred: cert(json), project: json.project_id as string };
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return { cred: applicationDefault(), project: process.env.FIREBASE_PROJECT_ID };
  throw new DbConfigError();
}

const g = globalThis as unknown as { _grocerlyDb?: DB; _grocerlyTestDb?: DB | null };

/** Tests call setDb(createMemoryDb()) so no real database is needed. */
export function setDb(db: DB | null) { g._grocerlyTestDb = db; }

export async function getDb(): Promise<DB> {
  if (g._grocerlyTestDb) return g._grocerlyTestDb;
  if (g._grocerlyDb) return g._grocerlyDb;
  const { cred, project } = credential();
  const app = getApps()[0] ?? initializeApp({ credential: cred, projectId: project });
  const fs = getFirestore(app);
  try { fs.settings({ ignoreUndefinedProperties: true }); } catch { /* already configured */ }
  const db: DB = {
    name: project ?? app.options.projectId ?? "firestore",
    collection: (n) => wrapColl(fs.collection(n)),
    getAll: async (...docs) => (docs.length ? (await fs.getAll(...docs.map((d) => (d as any).__ref))).map(wrapSnap) : []),
    ping: async () => { await fs.collection(C.meta).doc("ping").get(); },
  };
  g._grocerlyDb = db;
  return db;
}

/** Helper: a snapshot becomes a plain object that also carries its document id as `_id`. */
export function withId<T>(s: Snap): T & { _id: string } { return { ...(s.data() as T), _id: s.id }; }
export const isDocId = (s: unknown): s is string => typeof s === "string" && /^[A-Za-z0-9_-]{4,64}$/.test(s);
