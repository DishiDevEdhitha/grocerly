"use client";
/** Browser helpers: anonymous device id, fetch wrapper, compare tray. */
export function deviceId(): string {
  try {
    let id = localStorage.getItem("grocerly:device");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("grocerly:device", id); }
    return id;
  } catch { return "00000000-0000-4000-8000-000000000000"; }
}

export class ApiError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", "x-grocerly-user": deviceId(), ...(init.headers ?? {}) }, signal: init.signal ?? AbortSignal.timeout(45000) });
  } catch { throw new ApiError(0, "network", "Could not reach Grocerly. Check your connection and try again."); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? "error", data?.error?.message ?? "Something went wrong.");
  return data as T;
}

const TRAY = "grocerly:compare";
export const getTray = (): string[] => { try { return JSON.parse(localStorage.getItem(TRAY) ?? "[]"); } catch { return []; } };
export function addToTray(id: string) { const t = [...new Set([...getTray(), id])].slice(-4); localStorage.setItem(TRAY, JSON.stringify(t)); return t; }
export function removeFromTray(id: string) { const t = getTray().filter((x) => x !== id); localStorage.setItem(TRAY, JSON.stringify(t)); return t; }
