"use client";

import { useState } from "react";
import type { AuditLine, TagAudit } from "@/lib/types";
import { Card, Badge } from "@/components/ui";
import { TableShell, theadClass, rowClass } from "@/components/table";
import { nf } from "@/lib/format";

const VERDICT: Record<AuditLine["verdict"], { label: string; tone: "green" | "amber" | "red" | "gray" }> = {
  MATCH: { label: "По заявке", tone: "green" },
  PARTIAL: { label: "Частично вне заявки", tone: "amber" },
  OUTSIDE: { label: "Вне заявки", tone: "red" },
  NO_TAGS: { label: "Тэги не указаны", tone: "gray" },
};

type Tab = "lines" | "outside" | "issues" | "missing";

const TABS: { key: Tab; label: (a: TagAudit) => string }[] = [
  { key: "lines", label: (a) => `Все строки КП (${a.lines.length})` },
  { key: "outside", label: (a) => `Вне заявки (${a.summary.linesOutside + a.summary.linesPartial})` },
  {
    key: "issues",
    label: (a) =>
      `Замечания (${a.summary.qtyMismatchLines + a.summary.datasheetMismatchLines + a.summary.duplicatedTags})`,
  },
  { key: "missing", label: (a) => `Не предложено по заявке (${a.notOffered.length})` },
];

const MISSING_PAGE = 100;

export default function AuditTables({ audit }: { audit: TagAudit }) {
  const [tab, setTab] = useState<Tab>("outside");
  const [shown, setShown] = useState(MISSING_PAGE);

  const money = (v: number) => `${nf.format(Math.round(v))} ${audit.offer.currency}`;
  const problems = audit.lines.filter((l) => l.verdict === "OUTSIDE" || l.verdict === "PARTIAL");
  const issues = audit.lines.filter(
    (l) => (l.qtyVsTags !== null && l.qtyVsTags !== 0) || l.datasheetMismatch > 0
  );

  return (
    <div className="space-y-3">
      <nav className="flex flex-wrap gap-1 border-b border-ink-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t.key ? "border-brand-500 text-brand-600" : "border-transparent text-ink-600 hover:text-ink-900"
            }`}
          >
            {t.label(audit)}
          </button>
        ))}
      </nav>

      {(tab === "lines" || tab === "outside") && (
        <TableShell>
          <table className="w-full min-w-[900px] text-sm">
            <thead className={theadClass}>
              <tr>
                <th className="w-16 px-3 py-2 font-medium">№ КП</th>
                <th className="px-3 py-2 font-medium">Позиция КП</th>
                <th className="px-3 py-2 font-medium">Опросный лист</th>
                <th className="px-3 py-2 text-right font-medium">Кол-во</th>
                <th className="px-3 py-2 text-right font-medium">Сумма</th>
                <th className="px-3 py-2 font-medium">Заключение</th>
              </tr>
            </thead>
            <tbody>
              {(tab === "lines" ? audit.lines : problems).map((l) => (
                <tr key={l.id} className={rowClass}>
                  <td className="px-3 py-2 tabular text-ink-400">{l.pos}</td>
                  <td className="max-w-[460px] px-3 py-2">
                    <div className="leading-snug">{l.name}</div>
                    {l.tagsListed > 0 ? (
                      <div className="mt-0.5 text-xs text-ink-400">
                        тэгов {l.tagsListed}: в заявке {l.matchedCount}, вне заявки {l.outsideCount}
                        {l.matchedSample.length ? ` · ${l.matchedSample.join(", ")}…` : ""}
                      </div>
                    ) : null}
                    {l.outside.length ? (
                      <div className="mt-1 text-[11px] leading-snug text-red-600">
                        нет в заявке: {l.outside.slice(0, 8).join(", ")}
                        {l.outside.length > 8 ? ` и ещё ${l.outside.length - 8}` : ""}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-xs text-ink-600">{l.datasheet ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular">
                    {nf.format(l.qty)}
                    {l.qtyVsTags !== null && l.qtyVsTags !== 0 ? (
                      <div className="text-xs font-medium text-amber-600">тэгов {l.tagsListed}</div>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular">{money(l.total)}</td>
                  <td className="px-3 py-2">
                    <Badge tone={VERDICT[l.verdict].tone}>{VERDICT[l.verdict].label}</Badge>
                    {l.datasheetMismatch > 0 ? (
                      <div className="mt-1 text-[11px] text-amber-600">
                        опросный лист не совпал: {l.datasheetMismatch}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      )}

      {tab === "issues" && (
        <div className="space-y-4">
          <Card className="p-5">
            <h3 className="font-semibold">Количество не сходится с числом тэгов</h3>
            {issues.filter((l) => l.qtyVsTags).length === 0 ? (
              <p className="mt-2 text-sm text-ink-400">Расхождений нет.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {issues
                  .filter((l) => l.qtyVsTags)
                  .map((l) => (
                    <li key={l.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-ink-50 px-3 py-2">
                      <span className="text-sm">
                        №{l.pos} {l.name}
                      </span>
                      <span className="whitespace-nowrap text-sm tabular text-amber-700">
                        кол-во {nf.format(l.qty)}, тэгов перечислено {l.tagsListed}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold">Опросный лист в КП не совпал с заявкой</h3>
            {issues.filter((l) => l.datasheetMismatch > 0).length === 0 ? (
              <p className="mt-2 text-sm text-ink-400">Расхождений нет.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {issues
                  .filter((l) => l.datasheetMismatch > 0)
                  .map((l) => (
                    <li key={l.id} className="rounded-lg bg-ink-50 px-3 py-2 text-sm">
                      №{l.pos} {l.name} — {l.datasheet}, расхождений {l.datasheetMismatch}
                    </li>
                  ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold">Один тэг предложен несколько раз</h3>
            {audit.duplicated.length === 0 ? (
              <p className="mt-2 text-sm text-ink-400">Дублей нет.</p>
            ) : (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {audit.duplicated.map((d) => (
                  <li key={d.tag} className="flex items-baseline justify-between gap-2 rounded-lg bg-ink-50 px-3 py-2 text-sm">
                    <span className="tabular">{d.tag}</span>
                    <span className="whitespace-nowrap text-ink-600">
                      ×{d.times} — строки {d.lines.join(", ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {tab === "missing" && (
        <TableShell>
          <table className="w-full min-w-[800px] text-sm">
            <thead className={theadClass}>
              <tr>
                <th className="w-16 px-3 py-2 font-medium">Поз.</th>
                <th className="px-3 py-2 font-medium">Тэг</th>
                <th className="px-3 py-2 font-medium">Наименование по заявке</th>
                <th className="px-3 py-2 font-medium">Опросный лист</th>
                <th className="px-3 py-2 text-right font-medium">Кол-во</th>
              </tr>
            </thead>
            <tbody>
              {audit.notOffered.slice(0, shown).map((n) => (
                <tr key={n.specItemId} className={rowClass}>
                  <td className="px-3 py-2 tabular text-ink-400">{n.pos}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-medium tabular">{n.tag}</td>
                  <td className="px-3 py-2">{n.name}</td>
                  <td className="px-3 py-2 text-xs text-ink-600">{n.datasheet ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular">
                    {nf.format(n.qty)} {n.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown < audit.notOffered.length ? (
            <div className="border-t border-ink-100 p-3 text-center">
              <button
                onClick={() => setShown((v) => v + MISSING_PAGE)}
                className="rounded-lg border border-ink-200 px-3 py-1.5 text-sm font-medium hover:bg-ink-50"
              >
                Показать ещё ({audit.notOffered.length - shown})
              </button>
            </div>
          ) : null}
        </TableShell>
      )}
    </div>
  );
}
