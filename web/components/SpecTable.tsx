"use client";

import { useMemo, useState } from "react";
import type { SpecItem } from "@/lib/types";
import { Badge } from "@/components/ui";
import { money, nf } from "@/lib/format";

const ALL = "__all__";

function Select({
  value,
  onChange,
  options,
  allLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  allLabel: string;
}) {
  if (options.length < 2) return null;
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="input w-auto">
      <option value={ALL}>{allLabel}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

/** Спецификация объекта с фильтрами по зданию, разделу и системе. */
export default function SpecTable({ items }: { items: SpecItem[] }) {
  const [building, setBuilding] = useState(ALL);
  const [section, setSection] = useState(ALL);
  const [system, setSystem] = useState(ALL);
  const [query, setQuery] = useState("");

  const uniq = (get: (i: SpecItem) => string | null) =>
    [...new Set(items.map(get).filter((v): v is string => !!v))].sort();

  const buildings = useMemo(() => uniq((i) => i.building), [items]);
  const sections = useMemo(() => uniq((i) => i.section), [items]);
  const systems = useMemo(() => uniq((i) => i.system), [items]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (i) =>
        (building === ALL || i.building === building) &&
        (section === ALL || i.section === section) &&
        (system === ALL || i.system === system) &&
        (!q ||
          `${i.name} ${i.article ?? ""} ${i.code ?? ""} ${i.tag ?? ""} ${i.datasheet ?? ""}`
            .toLowerCase()
            .includes(q))
    );
  }, [items, building, section, system, query]);

  const budget = rows.reduce((s, i) => s + (i.pricePlan ?? 0) * i.qtyPlan, 0);
  const showBuilding = buildings.length > 1;
  const showTag = items.some((i) => i.tag);
  const showCode = items.some((i) => i.code);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={building} onChange={setBuilding} options={buildings} allLabel="Все здания" />
        <Select value={section} onChange={setSection} options={sections} allLabel="Все разделы" />
        <Select value={system} onChange={setSystem} options={systems} allLabel="Все системы" />
        <input
          className="input w-56"
          placeholder="Поиск по названию, тэгу, марке, коду…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="text-sm text-ink-400">
          Показано <b className="tabular text-ink-900">{rows.length}</b> из {items.length}
          {budget > 0 ? ` · ${money(budget)}` : ""}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-ink-200 bg-white">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="border-b border-ink-200 bg-ink-50 text-left text-xs uppercase text-ink-400">
            <tr>
              <th className="w-12 px-3 py-2 font-medium">№</th>
              <th className="px-3 py-2 font-medium">Наименование</th>
              {showTag ? <th className="px-3 py-2 font-medium">Тэг / опросный лист</th> : null}
              <th className="px-3 py-2 font-medium">Тип, марка</th>
              {showCode ? <th className="px-3 py-2 font-medium">Код продукции</th> : null}
              <th className="px-3 py-2 font-medium">Поставщик</th>
              {showBuilding ? <th className="px-3 py-2 font-medium">Здание</th> : null}
              <th className="px-3 py-2 text-right font-medium">Кол-во</th>
              <th className="px-3 py-2 font-medium">Примечание</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id} className="border-b border-ink-100 align-top last:border-0 hover:bg-ink-50">
                <td className="px-3 py-2 tabular text-ink-400">{i.pos ?? ""}</td>
                <td className="px-3 py-2">
                  <div className="leading-snug">{i.name}</div>
                  {i.section ? <div className="mt-0.5 text-xs text-ink-400">{i.section}</div> : null}
                </td>
                {showTag ? (
                  <td className="px-3 py-2">
                    <div className="whitespace-nowrap font-medium tabular">{i.tag ?? "—"}</div>
                    {i.datasheet ? <div className="text-xs text-ink-400">{i.datasheet}</div> : null}
                  </td>
                ) : null}
                <td className="px-3 py-2 font-medium">{i.article ?? "—"}</td>
                {showCode ? <td className="px-3 py-2 tabular text-ink-600">{i.code ?? "—"}</td> : null}
                <td className="px-3 py-2 text-ink-600">{i.manufacturer ?? "—"}</td>
                {showBuilding ? (
                  <td className="px-3 py-2 text-xs text-ink-600">{i.building ?? "—"}</td>
                ) : null}
                <td className="whitespace-nowrap px-3 py-2 text-right tabular">
                  {nf.format(i.qtyPlan)} <span className="text-xs text-ink-400">{i.unit}</span>
                </td>
                <td className="px-3 py-2 text-xs text-ink-400">
                  {i.note ? <Badge tone="amber">{i.note}</Badge> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
