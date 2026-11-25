/**
 * Product-link handling WITHOUT scraping.
 * We never download the retailer's page. We only read the product name that is already inside the URL text
 * (retailers put it there as a readable slug) and look it up in Grocerly's own catalogue.
 * Because the server never fetches the URL, there is no server-side-request-forgery risk.
 */
export type Retailer = "blinkit" | "zepto" | "bigbasket" | "other";
export interface LinkInfo { ok: boolean; reason?: string; retailer?: Retailer; host?: string; query?: string; url?: string }

const RETAILER_HOSTS: Record<string, Retailer> = { "blinkit.com": "blinkit", "zeptonow.com": "zepto", "zepto.com": "zepto", "zeptonow.in": "zepto", "bigbasket.com": "bigbasket" };
const SKIP = new Set(["prn", "pn", "prid", "pvid", "p", "pd", "dp", "product", "products", "buy", "cn", "cid", "category", "search", "s", "ps", "pc", "item"]);
const NOISE = new Set(["online", "buy", "order", "price", "best", "india"]);

const isPrivateHost = (h: string) => h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(":") || !h.includes(".");

export function retailerOf(host: string): Retailer {
  const h = host.replace(/^www\./, "");
  for (const [d, r] of Object.entries(RETAILER_HOSTS)) if (h === d || h.endsWith(`.${d}`)) return r;
  return "other";
}

export function parseProductLink(raw: string): LinkInfo {
  const text = (raw ?? "").trim();
  if (!text || text.length > 600) return { ok: false, reason: "Paste a product link (it looks empty or too long)." };
  let u: URL; try { u = new URL(text); } catch { return { ok: false, reason: "That does not look like a valid link." }; }
  if (u.protocol !== "https:") return { ok: false, reason: "Only secure https:// links are accepted." };
  if (u.username || u.password) return { ok: false, reason: "Links with a username or password are not accepted." };
  if (u.port) return { ok: false, reason: "Links with a custom port are not accepted." };
  const host = u.hostname.toLowerCase();
  if (isPrivateHost(host)) return { ok: false, reason: "That address is not a public website." };
  const segs = u.pathname.split("/").map((s) => { try { return decodeURIComponent(s); } catch { return s; } }).filter(Boolean);
  const cand = segs.filter((s) => !SKIP.has(s.toLowerCase()) && /[a-z]/i.test(s) && !/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(s) && !/^\d+$/.test(s));
  const slug = cand.sort((a, b) => (b.match(/[-_+]/g)?.length ?? 0) - (a.match(/[-_+]/g)?.length ?? 0))[0];
  const query = (slug ?? "").replace(/[-_+]+/g, " ").replace(/\.\w{2,4}$/, "").split(" ").filter((w) => w && !NOISE.has(w.toLowerCase()) && !/^[0-9a-f]{12,}$/i.test(w)).join(" ").trim().slice(0, 100);
  if (query.length < 3) return { ok: false, reason: "Could not find a product name in that link. Try searching by name instead." };
  return { ok: true, retailer: retailerOf(host), host, query, url: `${u.origin}${u.pathname}` };
}

export const PURCHASE_RETAILERS: Retailer[] = ["blinkit", "zepto", "bigbasket"];
