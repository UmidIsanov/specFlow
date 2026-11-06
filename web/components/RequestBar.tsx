"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/clientApi";
import DangerButton from "@/components/DangerButton";
import type { Request } from "@/lib/types";
import { requestLabel } from "@/lib/request";

/**
 * Заявки объекта: переключение между ними и действия над выбранной.
 * Одна заявка обычно покрывает часть объекта, поэтому их тут несколько,
 * а ревизии одной заявки стоят рядом — предыдущая никуда не девается.
 */
export default function RequestBar({
  projectId,
  requests,
  activeId,
  total,
}: {
  projectId: string;
  requests: Request[];
  activeId?: string;
  total: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = requests.find((r) => r.id === activeId);
  const base = `/projects/${projectId}/spec`;

  async function call(path: string, init: RequestInit) {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(path, init);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Ошибка ${res.status}`);
      router.refresh();
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не получилось");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function newRevision() {
    if (!active) return;
    const created = await call(`/api/requests/${active.id}/revision`, { method: "POST" });
    if (created?.id) router.push(`${base}?request=${created.id}`);
  }

  async function save(form: FormData) {
    if (!active) return;
    const number = String(form.get("number") ?? "").trim();
    const revision = Number(form.get("revision") ?? active.revision);
    const title = String(form.get("title") ?? "").trim();
    const saved = await call(`/api/requests/${active.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ number, revision, title }),
    });
    if (saved) setEditing(false);
  }

  return (
    <div className="rounded-xl border border-ink-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-ink-600">Заявки:</span>

        <Link
          href={base}
          className={`rounded-lg border px-2.5 py-1 text-sm transition ${
            activeId ? "border-ink-200 hover:border-ink-400" : "border-brand-500 bg-brand-50 font-medium"
          }`}
        >
          Все позиции <span className="tabular text-ink-400">{total}</span>
        </Link>

        {requests.map((r) => (
          <Link
            key={r.id}
            href={`${base}?request=${r.id}`}
            title={r.title ?? r.sourceFile ?? undefined}
            className={`rounded-lg border px-2.5 py-1 text-sm transition ${
              r.id === activeId ? "border-brand-500 bg-brand-50 font-medium" : "border-ink-200 hover:border-ink-400"
            }`}
          >
            {requestLabel(r)} <span className="tabular text-ink-400">{r._count?.items ?? 0}</span>
          </Link>
        ))}

        {requests.length === 0 ? (
          <span className="text-sm text-ink-400">ещё нет — загрузите файл ниже</span>
        ) : null}
      </div>

      {active && !editing ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3">
          <span className="text-sm text-ink-600">
            {requestLabel(active)}
            {active.title ? ` · ${active.title}` : ""}
            {active.sourceFile ? <span className="text-ink-400"> · из файла {active.sourceFile}</span> : null}
          </span>
          <div className="flex-1" />
          <button type="button" onClick={() => setEditing(true)} disabled={busy} className="rounded-md border border-ink-200 px-2 py-1 text-xs font-medium text-ink-900 hover:bg-ink-50 disabled:opacity-50">
            Изменить номер
          </button>
          <button type="button" onClick={newRevision} disabled={busy} className="rounded-md border border-ink-200 px-2 py-1 text-xs font-medium text-ink-900 hover:bg-ink-50 disabled:opacity-50">
            Новая ревизия
          </button>
          <DangerButton
            size="small"
            confirm={`Удалить заявку ${requestLabel(active)} и её позиции (${active._count?.items ?? 0})? Отменить нельзя.`}
            request={() => apiFetch(`/api/requests/${active.id}`, { method: "DELETE" })}
          >
            Удалить заявку
          </DangerButton>
        </div>
      ) : null}

      {active && editing ? (
        <form
          action={save}
          className="mt-3 flex flex-wrap items-end gap-2 border-t border-ink-100 pt-3"
        >
          <label className="text-xs text-ink-600">
            Номер заявки
            <input name="number" defaultValue={active.number ?? ""} placeholder="6450" className="input mt-0.5 w-32" />
          </label>
          <label className="text-xs text-ink-600">
            Ревизия
            <input name="revision" type="number" min={1} max={99} defaultValue={active.revision} className="input mt-0.5 w-20" />
          </label>
          <label className="text-xs text-ink-600">
            Чем отличается от соседних
            <input name="title" defaultValue={active.title ?? ""} placeholder="Лотки, кабель" className="input mt-0.5 w-52" />
          </label>
          <button type="submit" disabled={busy} className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm text-white disabled:opacity-50">
            {busy ? "Сохраняю…" : "Сохранить"}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="text-sm text-ink-400">
            Отмена
          </button>
        </form>
      ) : null}

      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
