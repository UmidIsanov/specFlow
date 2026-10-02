import { api } from "@/lib/api";
import type { Delivery, PlanFact, SpecItem, Supplier } from "@/lib/types";
import { Card, Badge, Empty } from "@/components/ui";
import LineItemsForm from "@/components/LineItemsForm";
import PlanFactTable from "@/components/PlanFactTable";
import ExportButton from "@/components/ExportButton";
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
          <ExportButton path={`/projects/${id}/export/plan-fact.xlsx`} label="План-факт в Excel" />
          <LineItemsForm mode="delivery" projectId={id} specItems={spec} suppliers={suppliers} />
        </div>
      </div>

      <PlanFactTable rows={pf.rows} />

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
