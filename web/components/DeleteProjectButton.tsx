"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PUBLIC_API } from "@/lib/api";

/** Удаление объекта со всеми данными — с подтверждением, откатить нельзя. */
export default function DeleteProjectButton({ projectId, name }: { projectId: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!confirm(`Удалить объект «${name}» вместе со спецификацией, КП, поставками и актами?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`${PUBLIC_API}/api/projects/${projectId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Не удалось удалить");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={busy}
      title="Удалить объект"
      aria-label="Удалить объект"
      className="relative z-10 rounded-md p-1 text-ink-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />
      </svg>
    </button>
  );
}
