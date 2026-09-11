"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PUBLIC_API } from "@/lib/api";

export default function AddSupplierForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await fetch(`${PUBLIC_API}/api/suppliers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(fd.get("name") ?? ""),
          contact: String(fd.get("contact") ?? "") || undefined,
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
      <button onClick={() => setOpen(true)} className="text-sm font-medium text-brand-600 hover:underline">
        + поставщик
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <input name="name" required placeholder="Название поставщика" className="input w-56" />
      <input name="contact" placeholder="Контакт" className="input w-40" />
      <button disabled={busy} className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm text-white disabled:opacity-50">
        Добавить
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-sm text-ink-400">
        отмена
      </button>
    </form>
  );
}
