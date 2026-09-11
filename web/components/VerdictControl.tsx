"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PUBLIC_API } from "@/lib/api";
import type { Verdict } from "@/lib/types";

const OPTIONS: { value: Verdict; label: string }[] = [
  { value: "OK", label: "Соответствует" },
  { value: "ANALOG_OK", label: "Аналог — годен" },
  { value: "ANALOG_RISK", label: "Аналог — проверить" },
  { value: "REJECT", label: "Не подходит" },
  { value: "PENDING", label: "Не определено" },
];

/** Решение инженера всегда важнее автоматического вердикта — здесь оно и фиксируется. */
export default function VerdictControl({
  offerItemId,
  verdict,
  comment,
}: {
  offerItemId: string;
  verdict: Verdict;
  comment: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState<Verdict>(verdict);
  const [note, setNote] = useState(comment ?? "");
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  async function save(next: Partial<{ verdict: Verdict; engineerComment: string }>) {
    await fetch(`${PUBLIC_API}/api/offer-items/${offerItemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    setSaved(true);
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-1.5">
      <select
        value={value}
        disabled={pending}
        onChange={(e) => {
          const v = e.target.value as Verdict;
          setValue(v);
          void save({ verdict: v });
        }}
        className="input w-full text-xs"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <input
        value={note}
        placeholder="Комментарий инженера"
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => note !== (comment ?? "") && void save({ engineerComment: note })}
        className="input w-full text-xs"
      />
      {saved ? <div className="text-[11px] text-emerald-600">сохранено</div> : null}
    </div>
  );
}
