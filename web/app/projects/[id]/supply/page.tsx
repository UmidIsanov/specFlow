import { api, PUBLIC_API } from "@/lib/api";
import type { Delivery, PlanFact, SpecItem, Supplier } from "@/lib/types";
import { Card, Badge, Progress, Empty } from "@/components/ui";
import LineItemsForm from "@/components/LineItemsForm";
import { date, nf, pct } from "@/lib/format";

export default async function SupplyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [pf, deliveries, spec, suppliers] = await Promise.all([
    api<PlanFact>(`/projects/${id}/plan-fact`),
    api<Delivery[]>(`/projects/${id}/deliveries`),
    api<SpecItem[]>(`/projects/${id}/spec`),
    api<Supplier[]>("/suppliers"),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span>
            Готовность: <b className="tabular">{pct(pf.totals.progress)}</b>
          </span>
          <span className="text-ink-400">·</span>
          <span>
            Позиций к дозаказу: <b className="tabular">{pf.totals.positionsNotOrdered}</b>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`${PUBLIC_API}/api/projects/${id}/export/plan-fact.xlsx`}
            className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-ink-50"
          >
            Выгрузить план-факт в Excel
          </a>
          <LineItemsForm mode="delivery" projectId={id} specItems={spec} suppliers={suppliers} />
        </div>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[1050px] text-sm">
          <thead className="border-b border-ink-200 bg-ink-50 text-left text-xs uppercase text-ink-400">
            <tr>
              <th className="px-3 py-2 font-medium">Позиция</th>
              <th className="px-3 py-2 text-right font-medium">План</th>
              <th className="px-3 py-2 text-right font-medium">Привезено</th>
              <th className="px-3 py-2 text-right font-medium">Смонтировано</th>
              <th className="px-3 py-2 text-right font-medium">На складе</th>
              <th className="px-3 py-2 text-right font-medium">Дозаказать</th>
              <th className="w-40 px-3 py-2 font-medium">Готовность</th>
            </tr>
          </thead>
          <tbody>
            {pf.rows.map((r) => (
              <tr key={r.specItemId} className="border-b border-ink-100 last:border-0 hover:bg-ink-50">
                <td className="px-3 py-2">
                  <div className="leading-snug">{r.name}</div>
                  <div className="text-xs text-ink-400">
                    {r.system} · {r.article ?? "—"}
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular">
                  {nf.format(r.qtyPlan)} <span className="text-xs text-ink-400">{r.unit}</span>
                </td>
                <td className="px-3 py-2 text-right tabular">{nf.format(r.delivered)}</td>
                <td className="px-3 py-2 text-right tabular">
                  {nf.format(r.installed)}
                  {r.inProgress > 0 ? (
                    <div className="text-xs text-ink-400">+{nf.format(r.inProgress)} в черновиках</div>
                  ) : null}
                </td>
                <td className={`px-3 py-2 text-right tabular ${r.stock < 0 ? "font-medium text-red-600" : ""}`}>
                  {nf.format(r.stock)}
                </td>
                <td className={`px-3 py-2 text-right tabular ${r.toOrder > 0 ? "font-medium text-amber-600" : "text-ink-400"}`}>
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
        </table>
      </Card>

      <div>
        <h2 className="mb-3 text-base font-semibold">Поставки на объект</h2>
        {deliveries.length === 0 ? (
          <Empty title="Поставок ещё не было" hint="Оприходуйте первую партию, чтобы вести складской учёт" />
        ) : (
          <div className="space-y-3">
            {deliveries.map((d) => (
              <Card key={d.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium">
                    Поставка {d.number ?? "б/н"}
                    {d.waybill ? <span className="text-ink-400"> · накладная {d.waybill}</span> : null}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-ink-400">
                    {d.supplier ? <Badge tone="blue">{d.supplier.name}</Badge> : null}
                    <span>{date(d.date)}</span>
                  </div>
                </div>
                {d.note ? <p className="mt-1 text-sm text-ink-400">{d.note}</p> : null}
                <ul className="mt-3 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {d.items.map((i) => (
                    <li key={i.id} className="flex items-baseline justify-between gap-2 rounded-lg bg-ink-50 px-3 py-1.5 text-sm">
                      <span className="truncate">{i.specItem.name}</span>
                      <span className="whitespace-nowrap tabular text-ink-600">
                        {nf.format(i.qty)} {i.specItem.unit}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
