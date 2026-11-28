import { ArrayUnion, Inc, type Coll, type DB, type Data, type Doc, type Op, type Query, type QuerySnap, type Snap } from "./db";

/* eslint-disable @typescript-eslint/no-explicit-any */
/** A tiny in-memory copy of the database interface. Used by the automated tests (no Firebase needed). */
const getPath = (o: any, p: string) => p.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o);
function setPath(o: any, p: string, v: any) { const ks = p.split("."); let cur = o; for (const k of ks.slice(0, -1)) { if (typeof cur[k] !== "object" || cur[k] === null) cur[k] = {}; cur = cur[k]; } if (v === undefined) delete cur[ks[ks.length - 1]]; else cur[ks[ks.length - 1]] = v; }
const plain = (v: any) => v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date) && !(v instanceof Inc) && !(v instanceof ArrayUnion);
const same = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);

function resolve(existing: any, v: any, merge: boolean): any {
  if (v instanceof Inc) return (typeof existing === "number" ? existing : 0) + v.n;
  if (v instanceof ArrayUnion) { const base = Array.isArray(existing) ? [...existing] : []; for (const i of v.items) if (!base.some((x) => same(x, i))) base.push(i); return base; }
  if (Array.isArray(v)) return v.map((x) => resolve(undefined, x, false));
  if (v instanceof Date) return new Date(v.getTime());
  if (plain(v)) {
    const out: any = merge && plain(existing) ? structuredClone(existing) : {};
    for (const [k, x] of Object.entries(v)) { const r = resolve(out[k], x, merge); if (r === undefined) delete out[k]; else out[k] = r; }
    return out;
  }
  return v;
}

export function createMemoryDb(): DB {
  const store = new Map<string, Data>();
  const cmp = (a: any, b: any) => { const x = a instanceof Date ? a.getTime() : a, y = b instanceof Date ? b.getTime() : b; return x < y ? -1 : x > y ? 1 : 0; };
  const snap = (path: string): Snap => { const id = path.split("/").pop()!; const d = store.get(path); return { id, exists: d !== undefined, data: () => (d === undefined ? undefined : structuredClone(d)) }; };
  const rand = () => Array.from({ length: 20 }, () => "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Math.floor(Math.random() * 62)]).join("");

  function query(path: string, filters: { f: string; o: Op; v: unknown }[] = [], orders: { f: string; d: string }[] = [], lim = Infinity): Query {
    const run = (): string[] => {
      let keys = [...store.keys()].filter((k) => k.startsWith(path + "/") && !k.slice(path.length + 1).includes("/"));
      for (const { f, o, v } of filters) keys = keys.filter((k) => {
        const x = getPath(store.get(k), f);
        if (o === "==") return x !== undefined && (x instanceof Date || v instanceof Date ? cmp(x, v) === 0 : same(x, v));
        if (o === "array-contains") return Array.isArray(x) && x.some((i) => same(i, v));
        if (x === undefined || x === null) return false;
        return o === ">=" ? cmp(x, v) >= 0 : cmp(x, v) < 0;
      });
      for (const { f } of orders) keys = keys.filter((k) => getPath(store.get(k), f) !== undefined);
      for (const { f, d } of [...orders].reverse()) keys.sort((a, b) => (d === "desc" ? -1 : 1) * cmp(getPath(store.get(a), f), getPath(store.get(b), f)));
      return keys.slice(0, lim);
    };
    const q: Query = {
      where: (f, o, v) => query(path, [...filters, { f, o, v }], orders, lim),
      orderBy: (f, d = "asc") => query(path, filters, [...orders, { f, d }], lim),
      limit: (n) => query(path, filters, orders, n),
      get: async (): Promise<QuerySnap> => { const docs = run().map(snap); return { docs, size: docs.length }; },
      count: async () => run().length,
    };
    return q;
  }
  function doc(path: string): Doc {
    return {
      id: path.split("/").pop()!,
      get: async () => snap(path),
      set: async (data, opts) => { const ex = store.get(path); store.set(path, resolve(opts?.merge ? ex ?? {} : undefined, data, !!opts?.merge) as Data); },
      update: async (data) => {
        const ex = store.get(path); if (ex === undefined) { const e: any = new Error("NOT_FOUND: no document to update"); e.code = 5; throw e; }
        const next = structuredClone(ex); for (const [k, v] of Object.entries(data)) setPath(next, k, resolve(getPath(next, k), v, false)); store.set(path, next);
      },
      delete: async () => { store.delete(path); },
      collection: (n) => coll(`${path}/${n}`),
    };
  }
  function coll(path: string): Coll { return { ...query(path), doc: (id?: string) => doc(`${path}/${id ?? rand()}`) }; }
  return { name: "memory", collection: (n) => coll(n), getAll: async (...docs) => Promise.all(docs.map((d) => d.get())), ping: async () => undefined };
}
