"use client";

import { useMemo, useState } from "react";
import type { SpecItem } from "@/lib/types";
import { Badge } from "@/components/ui";
import { SortTh, TableShell, theadClass, tfootClass, rowClass, totalsByUnit, useSort } from "@/components/table";
import DangerButton from "@/components/DangerButton";
import { PUBLIC_API } from "@/lib/api";
import { abbrLabel } from "@/lib/abbr";
import { money, nf } from "@/lib/format";

const ALL = "__all__";

function Select({
  value,
  onChange,
  options,
  allLabel,
  /** В выпадающем списке попап не покажешь — там расшифровка идёт текстом. */
  label = (v: string) => v,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  allLabel: string;
  label?: (v: string) => string;
}) {
  if (options.length < 2) return null;
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="input w-auto">
      <option value={ALL}>{allLabel}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {label(o)}
        </option>
      ))}
    </select>
  );
}

/** Заявка объекта: фильтры, поиск, сортировка, итоги по единицам и удаление лишнего. */
export default function SpecTable({ items, projectId }: { items: SpecItem[]; projectId: string }) {
  const [building, setBuilding] = useState(ALL);
  const [section, setSection] = useState(ALL);
  const [system, setSystem] = useState(ALL);
  const [doc, setDoc] = useState(ALL);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const uniq = (get: (i: SpecItem) => string | null) =>
    [...new Set(items.map(get).filter((v): v is string => !!v))].sort();

  const buildings = useMemo(() => uniq((i) => i.building), [items]);
  const sections = useMemo(() => uniq((i) => i.section), [items]);
  const systems = useMemo(() => uniq((i) => i.system), [items]);
  const docs = useMemo(() => uniq((i) => i.docRef), [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (i) =>
        (building === ALL || i.building === building) &&
        (section === ALL || i.section === section) &&
        (system === ALL || i.system === system) &&
        (doc === ALL || i.docRef === doc) &&
        (!q ||
          `${i.name} ${i.article ?? ""} ${i.code ?? ""} ${i.tag ?? ""} ${i.datasheet ?? ""}`
            .toLowerCase()
            .includes(q))
    );
  }, [items, building, section, system, doc, query]);

  const { sorted, sort, toggle } = useSort(filtered);

  const budget = filtered.reduce((s, i) => s + (i.pricePlan ?? 0) * i.qtyPlan, 0);
  const totals = totalsByUnit(filtered.map((i) => ({ unit: i.unit, qty: i.qtyPlan })));
  const showBuilding = buildings.length > 1;
  const showTag = items.some((i) => i.tag);
  const showCode = items.some((i) => i.code);
  const showManufacturer = items.some((i) => i.manufacturer);
  const showNote = items.some((i) => i.note);
  const filterOn = building !== ALL || section !== ALL || system !== ALL || doc !== ALL || !!query.trim();

  // Выделять можно только то, что сейчас на экране: иначе легко удалить
  // спрятанное фильтром и не заметить.
  const shownIds = filtered.map((i) => i.id);
  const pickedShown = shownIds.filter((id) => picked.has(id));
  const allShownPicked = shownIds.length > 0 && pickedShown.length === shownIds.length;

  const toggleOne = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAllShown = () =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (allShownPicked) shownIds.forEach((id) => next.delete(id));
      else shownIds.forEach((id) => next.add(id));
      return next;
    });

  const removeSelected = (force: boolean) =>
    fetch(`${PUBLIC_API}/api/projects/${projectId}/spec`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: pickedShown, force }),
    });

  const columns =
    3 + 1 + (showTag ? 1 : 0) + 1 + (showCode ? 1 : 0) + (showManufacturer ? 1 : 0) + (showBuilding ? 1 : 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={building} onChange={setBuilding} options={buildings} allLabel="Все здания" />
        <Select value={section} onChange={setSection} options={sections} allLabel="Все разделы" />
        <Select value={system} onChange={setSystem} options={systems} allLabel="Все системы" label={abbrLabel} />
        <Select value={doc} onChange={setDoc} options={docs} allLabel="Все документы" />
        <input
          className="input w-56"
          placeholder="Поиск по названию, тэгу, марке, коду…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {filterOn ? (
          <button
            type="button"
            onClick={() => {
              setBuilding(ALL);
              setSection(ALL);
              setSystem(ALL);
              setDoc(ALL);
              setQuery("");
            }}
            className="text-sm text-brand-600 hover:underline"
          >
            сбросить
          </button>
        ) : null}
        <span className="text-sm text-ink-400">
          {filterOn ? (
            <>
              Показано <b className="tabular text-ink-900">{filtered.length}</b> из {items.length}
            </>
          ) : (
            <>
              Позиций: <b className="tabular text-ink-900">{items.length}</b>
            </>
          )}
        </span>
      </div>

      {pickedShown.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm">
          <span>
            Выбрано <b className="tabular">{pickedShown.length}</b>{" "}
            {pickedShown.length === 1 ? "позиция" : "позиций"}
          </span>
          <DangerButton
            size="small"
            confirm={`Удалить ${pickedShown.length} позиций из заявки? Отменить нельзя.`}
            request={removeSelected}
          >
            Удалить выбранное
          </DangerButton>
          <button type="button" onClick={() => setPicked(new Set())} className="text-ink-500 hover:underline">
            снять выделение
          </button>
        </div>
      ) : null}

      <TableShell>
        <table className="w-full min-w-[1000px] text-sm">
          <thead className={theadClass}>
            <tr>
              <th className="w-9 px-3 py-2">
                <input
                  type="checkbox"
                  checked={allShownPicked}
                  onChange={toggleAllShown}
                  aria-label="Выбрать все показанные позиции"
                  title="Выбрать все показанные позиции"
                  className="align-middle"
                />
              </th>
              <th className="w-12 px-3 py-2 text-right font-medium" title="Номер строки на экране">
                #
              </th>
              <SortTh label="Поз." sortKey="pos" sort={sort} toggle={toggle} className="w-16" />
              <SortTh label="Наименование" sortKey="name" sort={sort} toggle={toggle} />
              {showTag ? <SortTh label="Тэг / опросный лист" sortKey="tag" sort={sort} toggle={toggle} /> : null}
              <SortTh label="Тип, марка" sortKey="article" sort={sort} toggle={toggle} />
              {showCode ? <SortTh label="Код продукции" sortKey="code" sort={sort} toggle={toggle} /> : null}
              {showManufacturer ? (
                <SortTh label="Производитель" sortKey="manufacturer" sort={sort} toggle={toggle} />
              ) : null}
              {showBuilding ? <SortTh label="Здание" sortKey="building" sort={sort} toggle={toggle} /> : null}
              <SortTh label="Кол-во" sortKey="qtyPlan" sort={sort} toggle={toggle} align="right" />
              {showNote ? <th className="px-3 py-2 font-medium">Примечание</th> : null}
            </tr>
          </thead>
          <tbody>
            {sorted.map((i, idx) => (
              <tr key={i.id} className={rowClass}>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={picked.has(i.id)}
                    onChange={() => toggleOne(i.id)}
                    aria-label={`Выбрать: ${i.name}`}
                    className="align-middle"
                  />
                </td>
                <td className="px-3 py-2 text-right tabular text-ink-400">{idx + 1}</td>
                <td className="px-3 py-2 tabular text-ink-600">{i.pos ?? "—"}</td>
                <td className="max-w-[420px] px-3 py-2">
                  <div className="leading-snug">{i.name}</div>
                  {i.section ? <div className="mt-0.5 text-xs text-ink-400">{i.section}</div> : null}
                </td>
                {showTag ? (
                  <td className="px-3 py-2">
                    <div className="whitespace-nowrap font-medium tabular">{i.tag ?? "—"}</div>
                    {i.datasheet ? <div className="text-xs text-ink-400">{i.datasheet}</div> : null}
                  </td>
                ) : null}
                <td className="max-w-[200px] px-3 py-2 font-medium">{i.article ?? "—"}</td>
                {showCode ? <td className="px-3 py-2 tabular text-ink-600">{i.code ?? "—"}</td> : null}
                {showManufacturer ? (
                  <td className="max-w-[180px] px-3 py-2 text-ink-600">{i.manufacturer ?? "—"}</td>
                ) : null}
                {showBuilding ? (
                  <td className="max-w-[160px] px-3 py-2 text-xs text-ink-600">{i.building ?? "—"}</td>
                ) : null}
                <td className="whitespace-nowrap px-3 py-2 text-right tabular font-medium">
                  {nf.format(i.qtyPlan)} <span className="text-xs font-normal text-ink-400">{i.unit}</span>
                </td>
                {showNote ? (
                  <td className="max-w-[160px] px-3 py-2 text-xs text-ink-400">
                    {i.note ? <Badge tone="amber">{i.note}</Badge> : null}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
          <tfoot className={tfootClass}>
            <tr>
              <td colSpan={columns} className="px-3 py-2">
                Итого: {filtered.length} позиций
                {budget > 0 ? ` · ${money(budget)}` : ""}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right tabular">{totals}</td>
              {showNote ? <td /> : null}
            </tr>
          </tfoot>
        </table>
      </TableShell>
    </div>
  );
}
