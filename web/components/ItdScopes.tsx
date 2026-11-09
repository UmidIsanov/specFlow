"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/clientApi";
import { Badge, Empty } from "@/components/ui";
import { Abbr } from "@/components/Abbr";
import { TableShell, theadClass, rowClass, SortTh, useSort } from "@/components/table";
import { PACK_LABEL, STATE_LABEL, STATE_TONE } from "@/lib/itd";
import type { ItdScope } from "@/lib/types";
import { date } from "@/lib/format";

/**
 * Папка ИТД: участки «объект + система + вид работы» и их два состояния.
 * Позиций заявки и цен тут нет совсем — ПТО сдаёт работы, а не закупает.
 */
export default function ItdScopes({ scopes }: { scopes: ItdScope[] }) {
  const router = useRouter();
  const [system, setSystem] = useState("");
  const [pack, setPack] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const systems = useMemo(() => [...new Set(scopes.map((s) => s.system))].sort(), [scopes]);

  const rows = useMemo(
    () =>
      scopes
        .filter((s) => (system ? s.system === system : true))
        .filter((s) => (pack ? s.workPack === pack : true))
        .filter((s) => (openOnly ? !s.dossierDone : true))
        .map((s) => ({
          ...s,
          // для сортировки: даты и состояния удобнее строками, как их видит человек
          packLabel: PACK_LABEL[s.workPack],
          stateLabel: STATE_LABEL[s.state],
          dossier: s.dossierDone ? "сдан" : "",
          lastInspection: s.records[0]?.inspectionNo ?? "",
        })),
    [scopes, system, pack, openOnly]
  );

  const { sorted, sort, toggle } = useSort(rows, { key: "system", dir: "asc" });

  async function setDossier(scope: ItdScope, done: boolean) {
    setBusy(scope.id);
    setError(null);
    try {
      const res = await apiFetch(`/api/itd-scopes/${scope.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossierDone: done }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Ошибка ${res.status}`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не получилось");
    } finally {
      setBusy(null);
    }
  }

  if (!scopes.length) {
    return (
      <Empty
        title="Реестр инспекций не загружен"
        hint="Загрузите файл «Инспекция» выше — появятся участки, сданные заказчику"
      />
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select value={system} onChange={(e) => setSystem(e.target.value)} className="input w-auto">
          <option value="">Все системы</option>
          {systems.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={pack} onChange={(e) => setPack(e.target.value)} className="input w-auto">
          <option value="">Все пакеты работ</option>
          <option value="CABLE">{PACK_LABEL.CABLE}</option>
          <option value="EQUIP">{PACK_LABEL.EQUIP}</option>
          <option value="OTHER">{PACK_LABEL.OTHER}</option>
        </select>
        <label className="flex cursor-pointer items-center gap-1.5 text-ink-600">
          <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
          только где пакет не сдан
        </label>
        <span className="text-ink-400">
          Участков: <b className="tabular text-ink-600">{sorted.length}</b>
        </span>
      </div>

      {error ? <p className="text-xs text-red-600">{error}</p> : null}

      <TableShell>
        <table className="w-full border-collapse text-sm">
          <thead className={theadClass}>
            <tr>
              <SortTh label="Объект" sortKey="building" sort={sort} toggle={toggle} />
              <SortTh label="Система" sortKey="system" sort={sort} toggle={toggle} />
              <SortTh label="Вид работы" sortKey="workKind" sort={sort} toggle={toggle} />
              <SortTh label="Пакет работ" sortKey="packLabel" sort={sort} toggle={toggle} />
              <SortTh label="Приёмка работ" sortKey="stateLabel" sort={sort} toggle={toggle} />
              <SortTh label="Пакет документов" sortKey="dossier" sort={sort} toggle={toggle} />
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <Fragment key={s.id}>
                <tr className={rowClass}>
                  <td className="px-3 py-2 tabular">{s.building}</td>
                  <td className="px-3 py-2">
                    <Abbr term={s.system} />
                  </td>
                  <td className="px-3 py-2">{s.workKind}</td>
                  <td className="px-3 py-2 text-ink-600">{s.packLabel}</td>
                  <td className="px-3 py-2">
                    <Badge tone={STATE_TONE[s.state]}>{STATE_LABEL[s.state]}</Badge>
                    {s.acceptedAt ? (
                      <div className="mt-0.5 text-xs text-ink-400">инспекция {date(s.acceptedAt)}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    {s.dossierDone ? (
                      <>
                        <Badge tone="green">Сдан</Badge>
                        {s.dossierAt ? (
                          <div className="mt-0.5 text-xs text-ink-400">{date(s.dossierAt)}</div>
                        ) : null}
                        {s.dossierNote ? (
                          <div className="mt-0.5 text-xs text-ink-400">{s.dossierNote}</div>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-xs text-ink-400">не сдан</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => void setDossier(s, !s.dossierDone)}
                      disabled={busy === s.id}
                      className="rounded-md border border-ink-200 px-2 py-1 text-xs font-medium hover:bg-ink-50 disabled:opacity-50"
                    >
                      {s.dossierDone ? "Снять отметку" : "Пакет сдан"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpen(open === s.id ? null : s.id)}
                      className="ml-1 rounded-md px-2 py-1 text-xs text-ink-400 hover:bg-ink-100 hover:text-ink-900"
                    >
                      {open === s.id ? "скрыть" : `инспекции ${s.records.length}`}
                    </button>
                  </td>
                </tr>
                {open === s.id ? (
                  <tr className="border-b border-ink-100 bg-brand-50/40">
                    <td colSpan={7} className="px-3 py-2">
                      <ul className="space-y-1 text-xs text-ink-600">
                        {s.records.map((r) => (
                          <li key={r.id} className="flex flex-wrap items-baseline gap-2">
                            <span className="font-medium text-ink-900">{r.inspectionNo ?? "без номера"}</span>
                            <span>{r.statusText ?? "статуса нет"}</span>
                            {r.inspectedAt ? <span>· инспекция {date(r.inspectedAt)}</span> : null}
                            {r.inspectedText ? <span>· в файле: {r.inspectedText}</span> : null}
                            {r.smrDoneAt ? <span>· СМР закончены {date(r.smrDoneAt)}</span> : null}
                            {r.fcn ? <span>· {r.fcn}</span> : null}
                            {r.rawKind && r.rawKind !== s.workKind ? (
                              <span className="text-ink-400">· в файле: «{r.rawKind}»</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}
