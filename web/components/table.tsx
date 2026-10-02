"use client";

import { useMemo, useState, type ReactNode } from "react";

/**
 * Общее для всех таблиц платформы: шапка не уезжает при прокрутке,
 * строки чередуются, числа выровнены по разряду, сортировка по клику.
 * Таблицы здесь большие — спецификация бывает на тысячу строк.
 */

/** Прокручиваемая рамка: шапка липнет к её верху, низ ограничен высотой экрана. */
export function TableShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`max-h-[calc(100vh-14rem)] overflow-auto rounded-xl border border-ink-200 bg-white ${className}`}>
      {children}
    </div>
  );
}

export const theadClass =
  "sticky top-0 z-10 border-b border-ink-200 bg-ink-50 text-left text-xs uppercase text-ink-400 shadow-[0_1px_0_var(--color-ink-200)]";

export const rowClass = "border-b border-ink-100 align-top last:border-0 odd:bg-ink-50/40 hover:bg-brand-50";

/** Итоговая строка снизу — тоже липкая, чтобы была видна при прокрутке. */
export const tfootClass =
  "sticky bottom-0 z-10 border-t border-ink-200 bg-ink-100 text-sm font-medium shadow-[0_-1px_0_var(--color-ink-200)]";

export type SortDir = "asc" | "desc";

export function useSort<T>(rows: T[], initial?: { key: string; dir: SortDir }) {
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(initial ?? null);

  const toggle = (key: string) =>
    setSort((s) => (s?.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null));

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const get = (r: T) => (r as Record<string, unknown>)[sort.key];
    const sign = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      if (typeof x === "number" && typeof y === "number") return (x - y) * sign;
      // пустые значения всегда внизу, независимо от направления
      const sx = x === null || x === undefined ? "" : String(x);
      const sy = y === null || y === undefined ? "" : String(y);
      if (!sx) return 1;
      if (!sy) return -1;
      return sx.localeCompare(sy, "ru", { numeric: true }) * sign;
    });
  }, [rows, sort]);

  return { sorted, sort, toggle };
}

/** Заголовок с сортировкой: клик — по возрастанию, ещё клик — по убыванию, третий — сброс. */
export function SortTh({
  label,
  sortKey,
  sort,
  toggle,
  align = "left",
  className = "",
}: {
  label: string;
  sortKey: string;
  sort: { key: string; dir: SortDir } | null;
  toggle: (key: string) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = sort?.key === sortKey;
  return (
    <th className={`px-3 py-2 font-medium ${align === "right" ? "text-right" : "text-left"} ${className}`}>
      <button
        type="button"
        onClick={() => toggle(sortKey)}
        className={`inline-flex items-center gap-1 uppercase hover:text-ink-900 ${active ? "text-ink-900" : ""}`}
        title="Сортировать"
      >
        {label}
        <span className={`text-[10px] leading-none ${active ? "opacity-100" : "opacity-0 group-hover:opacity-40"}`}>
          {active && sort?.dir === "desc" ? "▼" : "▲"}
        </span>
      </button>
    </th>
  );
}

/** Итог по количеству: складывать штуки с метрами нельзя, поэтому — отдельно по каждой единице. */
export function totalsByUnit(rows: { unit: string; qty: number }[]): string {
  const by = new Map<string, number>();
  for (const r of rows) by.set(r.unit, (by.get(r.unit) ?? 0) + r.qty);
  const nf = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
  return [...by.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([unit, qty]) => `${nf.format(qty)} ${unit}`)
    .join(" · ");
}
