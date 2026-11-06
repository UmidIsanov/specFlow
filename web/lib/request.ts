import type { Request } from "@/lib/types";

/**
 * Как заявка называется на экране: «№ 6450 рев. 2», а без номера — «без номера».
 * Лежит отдельно от компонентов: подпись нужна и серверным страницам, и клиентским.
 */
export function requestLabel(r: Pick<Request, "number" | "revision">): string {
  const base = r.number ? `№ ${r.number}` : "без номера";
  return r.revision > 1 ? `${base} рев. ${r.revision}` : base;
}
