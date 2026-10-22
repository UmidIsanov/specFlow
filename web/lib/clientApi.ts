/**
 * Запросы из браузера. Отдельно от lib/api.ts: тот читает cookie через next/headers
 * и в клиентские компоненты не импортируется.
 */
export const PUBLIC_API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Путь к приложению на сервере: в работе оно живёт под /pozitsiya. */
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * credentials: "include" нужен всегда — в разработке интерфейс на 3001, а API на 4000,
 * и без этого cookie входа не уедет. Просроченную сессию уводим на страницу входа.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${PUBLIC_API}${path}`, { credentials: "include", ...init });
  if (res.status === 401 && typeof window !== "undefined") {
    const next = encodeURIComponent(window.location.pathname.replace(BASE_PATH, "") || "/");
    window.location.href = `${BASE_PATH}/login?next=${next}`;
  }
  return res;
}
