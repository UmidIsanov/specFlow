"use client";

import Link from "next/link";
import { useState } from "react";
import type { Comparison } from "@/lib/types";
import { VerdictBadge } from "@/components/ui";
import { compactMoney, nf } from "@/lib/format";

/** Матрица «спецификация × КП»: строка проекта, колонка — что предложил каждый поставщик. */
export default function ComparisonMatrix({ data, projectId }: { data: Comparison; projectId: string }) {
  const [onlyProblems, setOnlyProblems] = useState(false);

  const isProblem = (rowIndex: number) => {
    const row = data.rows[rowIndex];
    return data.offers.some((o) => {
      const c = row.cells[o.id];
      return !c || c.verdict === "ANALOG_RISK" || c.verdict === "REJECT" || (c.coverage !== null && c.coverage < 0.999);
    });
  };

  const rows = data.rows
    .map((row, i) => ({ row, i }))
    .filter(({ i }) => !onlyProblems || isProblem(i));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} />
          Только проблемные позиции (аналоги, недопоставка, отсутствие)
        </label>
        {data.specRowCount > data.specCount ? (
          <span className="text-xs text-ink-400">
            {data.specRowCount} строк спецификации сведены в {data.specCount} закупочных позиций
          </span>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-xl border border-ink-200 bg-white">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink-200 bg-ink-50 text-left text-xs uppercase text-ink-400">
              <th className="sticky left-0 z-10 min-w-[300px] bg-ink-50 px-3 py-2 font-medium">Закупочная позиция</th>
              <th className="px-3 py-2 text-right font-medium">План</th>
              {data.offers.map((o) => (
                <th key={o.id} className="min-w-[240px] border-l border-ink-200 px-3 py-2 font-medium">
                  <Link href={`/projects/${projectId}/offers/${o.id}`} className="text-brand-600 hover:underline">
                    {o.supplier}
                  </Link>
                  <div className="mt-0.5 font-normal normal-case text-ink-400">
                    {o.number ?? "б/н"} · {compactMoney(o.total, o.currency)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ row }) => (
              <tr key={row.specItem.id} className="border-b border-ink-100 last:border-0">
                <td className="sticky left-0 z-10 bg-white px-3 py-2 align-top">
                  <div className="font-medium leading-snug">{row.specItem.name}</div>
                  <div className="text-xs text-ink-400">
                    {row.specItem.article ?? "без маркировки"}
                    {row.specItem.code ? ` · ${row.specItem.code}` : ""}
                  </div>
                  {row.buildings.length > 1 ? (
                    <div className="mt-1 text-[11px] text-ink-400">
                      {row.buildings.map((b) => `${b.building}: ${nf.format(b.qtyPlan)}`).join(" + ")}
                    </div>
                  ) : null}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right align-top tabular">
                  {nf.format(row.specItem.qtyPlan)} {row.specItem.unit}
                </td>
                {data.offers.map((o) => {
                  const c = row.cells[o.id];
                  if (!c) {
                    return (
                      <td key={o.id} className="border-l border-ink-200 bg-red-50/40 px-3 py-2 align-top text-xs text-red-600">
                        нет в КП
                      </td>
                    );
                  }
                  const recommended = row.recommendedOfferId === o.id;
                  const short = c.coverage !== null && c.coverage < 0.999;
                  return (
                    <td
                      key={o.id}
                      className={`border-l border-ink-200 px-3 py-2 align-top ${recommended ? "bg-emerald-50/50" : ""}`}
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <VerdictBadge verdict={c.verdict} />
                        {recommended ? <span className="text-xs font-medium text-emerald-700">выгоднее</span> : null}
                      </div>
                      <div className="mt-1 text-xs leading-snug text-ink-600">{c.name}</div>
                      <div className="mt-1 flex flex-wrap gap-x-3 text-xs tabular text-ink-400">
                        <span className={short ? "font-medium text-amber-600" : ""}>
                          {nf.format(c.qty)} {row.specItem.unit}
                          {short ? ` (−${nf.format(row.specItem.qtyPlan - c.qty)})` : ""}
                        </span>
                        <span>{compactMoney(c.unitPrice, o.currency)}/ед.</span>
                      </div>
                      {c.analysis?.reasons?.length ? (
                        <ul className="mt-1 space-y-0.5 text-[11px] leading-snug text-ink-400">
                          {c.analysis.reasons
                            .filter((r) => !r.startsWith("Наименование"))
                            .slice(0, 3)
                            .map((r, idx) => (
                              <li key={idx}>· {r}</li>
                            ))}
                        </ul>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
