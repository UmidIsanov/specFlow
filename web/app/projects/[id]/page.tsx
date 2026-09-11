import { api } from "@/lib/api";
import type { Comparison, PlanFact, WorkAct, Deviation } from "@/lib/types";
import { Card, Stat, Progress, LinkButton, Badge } from "@/components/ui";
import { compactMoney, date, nf, pct } from "@/lib/format";

export default async function ProjectDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [pf, cmp, acts, deviations] = await Promise.all([
    api<PlanFact>(`/projects/${id}/plan-fact`),
    api<Comparison>(`/projects/${id}/comparison`),
    api<WorkAct[]>(`/projects/${id}/acts`),
    api<Deviation[]>(`/projects/${id}/deviations`),
  ]);

  const deficit = pf.rows.filter((r) => r.toOrder > 0).sort((a, b) => b.toOrder - a.toOrder);
  const onSite = pf.rows.filter((r) => r.stock > 0);
  const risky = cmp.offers.reduce((s, o) => s + o.risky, 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Готовность по объекту"
          value={pct(pf.totals.progress)}
          hint={`${pf.totals.positionsDone} из ${pf.totals.positions} позиций закрыто полностью`}
          tone={pf.totals.progress >= 0.999 ? "good" : "default"}
        />
        <Stat
          label="Позиций не довезли"
          value={pf.totals.positionsNotOrdered}
          hint="требуется дозаказ по проекту"
          tone={pf.totals.positionsNotOrdered > 0 ? "warn" : "good"}
        />
        <Stat
          label="Позиций на складе"
          value={onSite.length}
          hint="есть остаток для монтажа"
        />
        <Stat
          label="Спорных позиций в КП"
          value={risky}
          hint="аналоги и непонятные позиции"
          tone={risky > 0 ? "danger" : "good"}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Коммерческие предложения</h2>
            <LinkButton href={`/projects/${id}/offers`}>Сравнить</LinkButton>
          </div>
          {cmp.offers.length === 0 ? (
            <p className="text-sm text-ink-400">КП ещё не загружены.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-ink-400">
                <tr>
                  <th className="pb-2 font-medium">Поставщик</th>
                  <th className="pb-2 text-right font-medium">Покрытие</th>
                  <th className="pb-2 text-right font-medium">Проверить</th>
                  <th className="pb-2 text-right font-medium">Сумма</th>
                </tr>
              </thead>
              <tbody>
                {cmp.offers.map((o) => (
                  <tr key={o.id} className="border-t border-ink-100">
                    <td className="py-2">
                      <div className="font-medium">{o.supplier}</div>
                      <div className="text-xs text-ink-400">{o.number ?? "—"}</div>
                    </td>
                    <td className="py-2 text-right tabular">
                      {o.covered}/{cmp.specCount}
                    </td>
                    <td className="py-2 text-right tabular">
                      {o.risky > 0 ? <Badge tone="amber">{o.risky}</Badge> : <Badge tone="green">0</Badge>}
                    </td>
                    <td className="py-2 text-right tabular">{compactMoney(o.total, o.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Дозаказать по проекту</h2>
            <LinkButton href={`/projects/${id}/supply`}>Склад</LinkButton>
          </div>
          {deficit.length === 0 ? (
            <p className="text-sm text-ink-400">Всё оборудование по проекту законтрактовано и привезено.</p>
          ) : (
            <ul className="space-y-2.5">
              {deficit.slice(0, 7).map((r) => (
                <li key={r.specItemId}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm">{r.name}</span>
                    <span className="whitespace-nowrap text-sm font-semibold tabular text-amber-600">
                      +{nf.format(r.toOrder)} {r.unit}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <Progress value={r.qtyPlan ? r.delivered / r.qtyPlan : 0} />
                    <span className="w-24 shrink-0 text-right text-xs tabular text-ink-400">
                      {nf.format(r.delivered)}/{nf.format(r.qtyPlan)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Последние акты</h2>
            <LinkButton href={`/projects/${id}/acts`}>Все акты</LinkButton>
          </div>
          {acts.length === 0 ? (
            <p className="text-sm text-ink-400">Актов пока нет.</p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {acts.slice(0, 6).map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                  <div>
                    <div className="text-sm font-medium">
                      {a.number ?? "б/н"} · {a.system}
                    </div>
                    <div className="text-xs text-ink-400">{a.location ?? "—"}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-ink-400">{date(a.date)}</span>
                    {a.status === "SIGNED" ? <Badge tone="green">Подписан</Badge> : <Badge tone="amber">Черновик</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 font-semibold">Отклонения от проекта</h2>
          {deviations.length === 0 ? (
            <p className="text-sm text-ink-400">Отклонений не зафиксировано — исполнительная идёт по проекту.</p>
          ) : (
            <ul className="space-y-3">
              {deviations.slice(0, 5).map((d) => (
                <li key={d.id} className="text-sm">
                  <div className="flex items-center gap-2">
                    <Badge tone="blue">
                      {{ REPLACE: "Замена", QTY_CHANGE: "Изменение объёма", EXCLUDE: "Исключено", ADD: "Добавлено" }[d.kind]}
                    </Badge>
                    <span className="text-xs text-ink-400">{date(d.date)}</span>
                  </div>
                  <p className="mt-1 text-ink-600">{d.description}</p>
                  {d.approvedBy ? <p className="mt-0.5 text-xs text-ink-400">Согласовано: {d.approvedBy}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
