"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PUBLIC_API } from "@/lib/api";
import type { SpecItem, Supplier } from "@/lib/types";
import { nf } from "@/lib/format";

type Mode = "delivery" | "act";

/** Общая форма для прихода на склад и для акта установки: поиск по спецификации + количества. */
export default function LineItemsForm({
  mode,
  projectId,
  specItems,
  suppliers = [],
  stock = {},
}: {
  mode: Mode;
  projectId: string;
  specItems: SpecItem[];
  suppliers?: Supplier[];
  stock?: Record<string, number>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [meta, setMeta] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? specItems.filter((s) => `${s.name} ${s.article ?? ""} ${s.system}`.toLowerCase().includes(q))
      : specItems;
    return list.slice(0, 40);
  }, [query, specItems]);

  const chosen = Object.entries(qty).filter(([, v]) => Number(v) > 0);

  async function submit() {
    if (!chosen.length) {
      setError("Укажите количество хотя бы по одной позиции");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const items = chosen.map(([specItemId, v]) => ({ specItemId, qty: Number(v) }));
      const body =
        mode === "delivery"
          ? { supplierId: meta.supplierId || undefined, number: meta.number, waybill: meta.waybill, note: meta.note, items }
          : { number: meta.number, location: meta.location, system: meta.system || "ПС", items };
      const res = await fetch(`${PUBLIC_API}/api/projects/${projectId}/${mode === "delivery" ? "deliveries" : "acts"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Ошибка ${res.status}`);
      setQty({});
      setMeta({});
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
        {mode === "delivery" ? "+ Приход на склад" : "+ Акт установки"}
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-ink-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="font-medium">{mode === "delivery" ? "Новая поставка" : "Новый акт установки"}</div>
        <button onClick={() => setOpen(false)} className="text-sm text-ink-400 hover:text-ink-900">
          закрыть
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {mode === "delivery" ? (
          <>
            <select
              className="input w-56"
              value={meta.supplierId ?? ""}
              onChange={(e) => setMeta({ ...meta, supplierId: e.target.value })}
            >
              <option value="">Поставщик (необязательно)</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <input
              className="input w-32"
              placeholder="№ поставки"
              value={meta.number ?? ""}
              onChange={(e) => setMeta({ ...meta, number: e.target.value })}
            />
            <input
              className="input w-40"
              placeholder="№ накладной"
              value={meta.waybill ?? ""}
              onChange={(e) => setMeta({ ...meta, waybill: e.target.value })}
            />
          </>
        ) : (
          <>
            <input
              className="input w-32"
              placeholder="№ акта"
              value={meta.number ?? ""}
              onChange={(e) => setMeta({ ...meta, number: e.target.value })}
            />
            <input
              className="input w-64"
              placeholder="Участок / этаж / помещение"
              value={meta.location ?? ""}
              onChange={(e) => setMeta({ ...meta, location: e.target.value })}
            />
            <select
              className="input w-32"
              value={meta.system ?? "ПС"}
              onChange={(e) => setMeta({ ...meta, system: e.target.value })}
            >
              {["ПС", "СОУЭ", "СКС", "СОТ", "СКУД", "АПТ", "ПЕРИМЕТР"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </>
        )}
        <input
          className="input flex-1 min-w-[200px]"
          placeholder="Поиск по спецификации…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-ink-100">
        <table className="w-full text-sm">
          <tbody>
            {filtered.map((s) => {
              const available = stock[s.id] ?? 0;
              const entered = Number(qty[s.id] ?? 0);
              const overStock = mode === "act" && entered > available;
              return (
                <tr key={s.id} className="border-b border-ink-100 last:border-0">
                  <td className="px-3 py-2">
                    <div className="leading-snug">{s.name}</div>
                    <div className="text-xs text-ink-400">
                      {s.system} · {s.article ?? "—"}
                      {mode === "act" ? ` · на складе ${nf.format(available)} ${s.unit}` : ""}
                    </div>
                  </td>
                  <td className="w-36 px-3 py-2">
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={qty[s.id] ?? ""}
                        onChange={(e) => setQty({ ...qty, [s.id]: e.target.value })}
                        className={`input tabular ${overStock ? "border-amber-400" : ""}`}
                      />
                      <span className="text-xs text-ink-400">{s.unit}</span>
                    </div>
                    {overStock ? <div className="mt-0.5 text-[11px] text-amber-600">больше, чем на складе</div> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={submit}
          disabled={busy}
          className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Сохранение…" : mode === "delivery" ? "Оприходовать" : "Создать акт"}
        </button>
        <span className="text-sm text-ink-400">Выбрано позиций: {chosen.length}</span>
      </div>
    </div>
  );
}
