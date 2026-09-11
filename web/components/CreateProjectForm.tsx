"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PUBLIC_API } from "@/lib/api";

export default function CreateProjectForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${PUBLIC_API}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(fd.get("name") ?? ""),
          code: String(fd.get("code") ?? "") || undefined,
          customer: String(fd.get("customer") ?? "") || undefined,
          address: String(fd.get("address") ?? "") || undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600"
      >
        + Новый объект
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="w-full rounded-xl border border-ink-200 bg-white p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <input name="name" required placeholder="Название объекта" className="input" />
        <input name="code" placeholder="Шифр проекта" className="input" />
        <input name="customer" placeholder="Заказчик" className="input" />
        <input name="address" placeholder="Адрес / площадка" className="input" />
      </div>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      <div className="mt-3 flex gap-2">
        <button disabled={busy} className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          {busy ? "Создание…" : "Создать"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-ink-200 px-3 py-1.5 text-sm">
          Отмена
        </button>
      </div>
    </form>
  );
}
