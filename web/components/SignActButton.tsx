"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PUBLIC_API } from "@/lib/api";
import { nf } from "@/lib/format";

type Shortage = { specItemId: string; name: string; unit: string; need: number; available: number };

/** Подписание акта = факт монтажа и автоматическое списание ТМЦ со склада. */
export default function SignActButton({ actId }: { actId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [shortages, setShortages] = useState<Shortage[] | null>(null);

  async function sign() {
    setBusy(true);
    try {
      const res = await fetch(`${PUBLIC_API}/api/acts/${actId}/sign`, { method: "POST" });
      const data = await res.json();
      if (res.ok) setShortages(data.shortages ?? []);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        onClick={sign}
        disabled={busy}
        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {busy ? "Подписание…" : "Подписать и списать со склада"}
      </button>
      {shortages && shortages.length > 0 ? (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
          <div className="font-medium text-amber-800">Списано с превышением остатка — проверьте приход:</div>
          <ul className="mt-1 space-y-0.5 text-amber-700">
            {shortages.map((s) => (
              <li key={s.specItemId}>
                {s.name}: списано {nf.format(s.need)} {s.unit}, на складе было {nf.format(s.available)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
