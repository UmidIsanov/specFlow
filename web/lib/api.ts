import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const BASE = process.env.API_URL ?? "http://localhost:4000";

export type SessionUser = { id: string; email: string; name: string | null; role: string };

/**
 * Серверный фетч к API. Кэш выключен — данные стройки меняются постоянно.
 * Cookie входа прокидываем руками: серверный компонент ходит в API сам, браузер в этом не участвует.
 */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const jar = await cookies();
  const res = await fetch(`${BASE}/api${path}`, {
    cache: "no-store",
    ...init,
    headers: { ...(init?.headers as Record<string, string> | undefined), cookie: jar.toString() },
  });
  // Сессия кончилась посреди работы — уводим на вход, а не показываем ошибку API.
  if (res.status === 401) redirect("/login");
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

/** Кто вошёл. Без редиректа: вызывается в том числе на самой странице входа. */
export async function me(): Promise<SessionUser | null> {
  const jar = await cookies();
  try {
    const res = await fetch(`${BASE}/api/auth/me`, {
      cache: "no-store",
      headers: { cookie: jar.toString() },
    });
    if (!res.ok) return null;
    return (await res.json()) as SessionUser | null;
  } catch {
    return null;
  }
}
