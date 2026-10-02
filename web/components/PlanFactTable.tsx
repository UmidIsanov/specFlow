"use client";

import { useMemo, useState } from "react";
import type { PlanFactRow } from "@/lib/types";
import { Progress } from "@/components/ui";
import { SortTh, TableShell, theadClass, tfootClass, rowClass, useSort } from "@/components/table";
import { nf, pct } from "@/lib/format";

/**
 * План/факт по объекту. Складывать штуки с метрами нельзя, поэтому внизу — не сумма
 * количеств, а то, что действительно считается: сколько позиций закрыто и сколько ждёт заказа.
 */
export default function PlanFactTable({ rows }: { rows: PlanFactRow[] }) {
  const [query, setQuery] = useState("");
  const [only, setOnly] = useState<"all" | "order" | "stock" | "deficit">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (only === "order" && r.toOrder <= 0) return false;
      if (only === "stock" && r.stock <= 0) return false;
      if (only === "deficit" && r.stock >= 0) return false;
      return !q || `${r.name} ${r.article ?? ""} ${r.system}`.toLowerCase().includes(q);
    });
  }, [rows, query, only]);

  const { sorted, sort, toggle } = useSort(filtered);

  const done = filtered.filter((r) => r.qtyPlan > 0 && r.installed >= r.qtyPlan).length;
  const toOrder = filtered.filter((r) => r.toOrder > 0).length;
  const deficit = filtered.filter((r) => r.stock < 0).length;

  const tabs: { key: typeof only; label: string; count: number }[] = [
    { key: "all", label: "Все позиции", count: rows.length },
    { key: "order", label: "Нужно дозаказать", count: rows.filter((r) => r.toOrder > 0).length },
    { key: "stock", label: "Есть на складе", count: rows.filter((r) => r.stock > 0).length },
    { key: "deficit", label: "Списано больше прихода", count: rows.filter((r) => r.stock < 0).length },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-lg bg-ink-100 p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setOnly(t.key)}
              disabled={t.count === 0 && t.key !== "all"}
              className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-40 ${
                only === t.key ? "bg-white text-ink-900 shadow-sm" : "text-ink-600 hover:text-ink-900"
              }`}
            >
              {t.label} <span className="tabular text-ink-400">{t.count}</span>
            </button>
          ))}
        </div>
        <input
          className="input w-56"
          placeholder="Поиск по названию или марке…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <TableShell>
        <table className="w-full min-w-[1050px] text-sm">
          <thead className={theadClass}>
            <tr>
              <th className="w-12 px-3 py-2 text-right font-medium">#</th>
              <SortTh label="Позиция" sortKey="name" sort={sort} toggle={toggle} />
              <SortTh label="План" sortKey="qtyPlan" sort={sort} toggle={toggle} align="right" />
              <SortTh label="Привезено" sortKey="delivered" sort={sort} toggle={toggle} align="right" />
              <SortTh label="Смонтировано" sortKey="installed" sort={sort} toggle={toggle} align="right" />
              <SortTh label="На складе" sortKey="stock" sort={sort} toggle={toggle} align="right" />
              <SortTh label="Дозаказать" sortKey="toOrder" sort={sort} toggle={toggle} align="right" />
              <SortTh label="Готовность" sortKey="progress" sort={sort} toggle={toggle} className="w-40" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, idx) => (
              <tr key={r.specItemId} className={rowClass}>
                <td className="px-3 py-2 text-right tabular text-ink-400">{idx + 1}</td>
                <td className="max-w-[420px] px-3 py-2">
                  <div className="leading-snug">{r.name}</div>
                  <div className="text-xs text-ink-400">
                    {r.system} · {r.article ?? "без марки"}
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular">
                  {nf.format(r.qtyPlan)} <span className="text-xs text-ink-400">{r.unit}</span>
                </td>
                <td className="px-3 py-2 text-right tabular">{nf.format(r.delivered)}</td>
                <td className="px-3 py-2 text-right tabular">
                  {nf.format(r.installed)}
                  {r.inProgress > 0 ? (
                    <div className="text-xs text-ink-400">+{nf.format(r.inProgress)} в черновиках</div>
                  ) : null}
                </td>
                <td className={`px-3 py-2 text-right tabular ${r.stock < 0 ? "font-semibold text-red-600" : ""}`}>
                  {nf.format(r.stock)}
                </td>
                <td
                  className={`px-3 py-2 text-right tabular ${
                    r.toOrder > 0 ? "font-semibold text-amber-600" : "text-ink-400"
                  }`}
                >
                  {r.toOrder > 0 ? nf.format(r.toOrder) : "—"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Progress value={r.progress} />
                    <span className="w-10 shrink-0 text-right text-xs tabular text-ink-400">{pct(r.progress)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className={tfootClass}>
            <tr>
              <td colSpan={8} className="px-3 py-2">
                <span className="mr-4">Показано позиций: {filtered.length}</span>
                <span className="mr-4 text-emerald-700">закрыто полностью: {done}</span>
                <span className="mr-4 text-amber-700">нужно дозаказать: {toOrder}</span>
                {deficit > 0 ? <span className="text-red-700">списано больше прихода: {deficit}</span> : null}
              </td>
            </tr>
          </tfoot>
        </table>
      </TableShell>
    </div>
  );
}
