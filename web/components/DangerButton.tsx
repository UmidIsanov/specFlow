"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

/**
 * Кнопка необратимого действия: спрашивает, выполняет, обновляет страницу.
 *
 * Если сервер ответил 409 — значит по данным уже есть следы (приход, акты),
 * и он просит подтвердить ещё раз. Текст ответа показываем как есть: там
 * написано, что именно будет стёрто.
 */
/** Сервер отвечает { error: "..." } — показываем человеку текст, а не JSON. */
async function reason(res: Response): Promise<string> {
  const body = await res.text();
  try {
    const parsed = JSON.parse(body) as { error?: string };
    if (parsed.error) return parsed.error;
  } catch {
    /* не JSON — покажем как есть */
  }
  return body || `Ошибка ${res.status}`;
}

export default function DangerButton({
  confirm: question,
  request,
  children,
  size = "normal",
}: {
  confirm: string;
  request: (force: boolean) => Promise<Response>;
  children: ReactNode;
  size?: "normal" | "small";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!window.confirm(question)) return;
    setBusy(true);
    try {
      let res = await request(false);
      if (res.status === 409) {
        const warning = await reason(res);
        if (!window.confirm(`${warning}\n\nУдалить вместе со всем этим?`)) return;
        res = await request(true);
      }
      if (!res.ok) throw new Error(await reason(res));
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Не получилось");
    } finally {
      setBusy(false);
    }
  }

  const cls =
    size === "small"
      ? "rounded-md border border-ink-200 px-2 py-1 text-xs font-medium text-red-600 hover:border-red-300 hover:bg-red-50 disabled:opacity-50"
      : "rounded-md border border-ink-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:border-red-300 hover:bg-red-50 disabled:opacity-50";

  return (
    <button type="button" onClick={run} disabled={busy} className={cls}>
      {busy ? "Удаляю…" : children}
    </button>
  );
}
