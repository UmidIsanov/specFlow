import Link from "next/link";
import { api } from "@/lib/api";
import type { Deviation, PlanFact, SpecItem, WorkAct } from "@/lib/types";
import { Card, Badge, Empty, Stat } from "@/components/ui";
import LineItemsForm from "@/components/LineItemsForm";
import SignActButton from "@/components/SignActButton";
import DeviationForm from "@/components/DeviationForm";
import { date, nf } from "@/lib/format";

const KIND_LABEL: Record<Deviation["kind"], string> = {
  REPLACE: "Замена",
  QTY_CHANGE: "Изменение объёма",
  EXCLUDE: "Исключено",
  ADD: "Добавлено",
};

export default async function ActsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [acts, spec, pf, deviations] = await Promise.all([
    api<WorkAct[]>(`/projects/${id}/acts`),
    api<SpecItem[]>(`/projects/${id}/spec`),
    api<PlanFact>(`/projects/${id}/plan-fact`),
    api<Deviation[]>(`/projects/${id}/deviations`),
  ]);

  const stock = Object.fromEntries(pf.rows.map((r) => [r.specItemId, r.stock]));
  const signed = acts.filter((a) => a.status === "SIGNED").length;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Актов всего" value={acts.length} />
        <Stat label="Подписано" value={signed} tone="good" hint="списание со склада выполнено" />
        <Stat
          label="Черновиков"
          value={acts.length - signed}
          tone={acts.length - signed > 0 ? "warn" : "default"}
          hint="объёмы ещё не в факте"
        />
      </div>

      <div className="flex flex-wrap items-start gap-3">
        <LineItemsForm mode="act" projectId={id} specItems={spec} stock={stock} />
        <DeviationForm projectId={id} specItems={spec} />
      </div>

      {acts.length === 0 ? (
        <Empty title="Актов пока нет" hint="Создайте акт установки — объёмы уйдут в факт, а ТМЦ спишутся со склада" />
      ) : (
        <div className="space-y-3">
          {acts.map((a) => (
            <Card key={a.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-medium">
                    Акт {a.number ?? "б/н"} · {a.system}
                  </div>
                  <div className="text-sm text-ink-400">
                    {a.location ?? "участок не указан"} · {date(a.date)}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {a.status === "SIGNED" ? (
                    <Badge tone="green">Подписан {a.signedAt ? date(a.signedAt) : ""}</Badge>
                  ) : (
                    <SignActButton actId={a.id} />
                  )}
                  <Link
                    href={`/projects/${id}/acts/${a.id}/print`}
                    className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-ink-50"
                  >
                    Печатная форма
                  </Link>
                </div>
              </div>
              <ul className="mt-3 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {a.items.map((i) => (
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

      <div>
        <h2 className="mb-3 text-base font-semibold">Отклонения от проекта (для ИТД)</h2>
        {deviations.length === 0 ? (
          <Empty title="Отклонений нет" hint="Исполнительная формируется строго по проекту" />
        ) : (
          <Card className="divide-y divide-ink-100">
            {deviations.map((d) => (
              <div key={d.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="blue">{KIND_LABEL[d.kind]}</Badge>
                  {d.specItem ? <span className="text-sm font-medium">{d.specItem.name}</span> : null}
                  <span className="text-xs text-ink-400">{date(d.date)}</span>
                </div>
                <p className="mt-1.5 text-sm text-ink-600">{d.description}</p>
                {d.approvedBy ? <p className="mt-1 text-xs text-ink-400">Согласовано: {d.approvedBy}</p> : null}
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
