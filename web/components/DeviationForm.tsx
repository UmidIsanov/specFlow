"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PUBLIC_API } from "@/lib/api";
import type { SpecItem } from "@/lib/types";

const KINDS = [
  { value: "REPLACE", label: "Замена оборудования" },
  { value: "QTY_CHANGE", label: "Изменение объёма" },
  { value: "EXCLUDE", label: "Исключено из проекта" },
  { value: "ADD", label: "Добавлено сверх проекта" },
];

/** Отклонения от проекта — то, что потом отдельно объясняется в исполнительной. */
export default function DeviationForm({ projectId, specItems }: { projectId: string; specItems: SpecItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await fetch(`${PUBLIC_API}/api/projects/${projectId}/deviations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: String(fd.get("kind")),
          description: String(fd.get("description")),
          approvedBy: String(fd.get("approvedBy") ?? "") || undefined,
          specItemId: String(fd.get("specItemId") ?? "") || undefined,
        }),
      });
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-ink-50">
        + Отклонение от проекта
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-ink-200 bg-white p-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <select name="kind" className="input">
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        <select name="specItemId" className="input" defaultValue="">
          <option value="">Позиция проекта (необязательно)</option>
          {specItems.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <textarea
          name="description"
          required
          rows={2}
          placeholder="Что и почему изменилось относительно проекта"
          className="input sm:col-span-2"
        />
        <input name="approvedBy" placeholder="Кем согласовано (ГИП, заказчик)" className="input sm:col-span-2" />
      </div>
      <div className="mt-3 flex gap-2">
        <button disabled={busy} className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          Зафиксировать
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-ink-200 px-3 py-1.5 text-sm">
          Отмена
        </button>
      </div>
    </form>
  );
}
