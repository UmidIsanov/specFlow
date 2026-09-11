const BASE = process.env.API_URL ?? "http://localhost:4000";
export const PUBLIC_API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Серверный фетч к API. Кэш выключен — данные стройки меняются постоянно. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, { cache: "no-store", ...init });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}
