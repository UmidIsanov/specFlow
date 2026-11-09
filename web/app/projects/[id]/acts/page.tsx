import Link from "next/link";
import { api } from "@/lib/api";
import type { Deviation, ItdView, PlanFact, SpecItem, WorkAct } from "@/lib/types";
import { Card, Badge, Empty, Stat, Progress } from "@/components/ui";
import LineItemsForm from "@/components/LineItemsForm";
import SignActButton from "@/components/SignActButton";
import DeviationForm from "@/components/DeviationForm";
import UploadForm from "@/components/UploadForm";
import ItdScopes from "@/components/ItdScopes";
import { Abbr, AbbrText } from "@/components/Abbr";
import { acceptedShare, dossierShare } from "@/lib/itd";
import { date, nf, pct } from "@/lib/format";

const KIND_LABEL: Record<Deviation["kind"], string> = {
  REPLACE: "Замена",
  QTY_CHANGE: "Изменение объёма",
  EXCLUDE: "Исключено",
  ADD: "Добавлено",
};

export default async function ActsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [acts, spec, pf, deviations, itd] = await Promise.all([
    api<WorkAct[]>(`/projects/${id}/acts`),
    api<SpecItem[]>(`/projects/${id}/spec`),
    api<PlanFact>(`/projects/${id}/plan-fact`),
    api<Deviation[]>(`/projects/${id}/deviations`),
    api<ItdView>(`/projects/${id}/itd`),
  ]);

  const stock = Object.fromEntries(pf.rows.map((r) => [r.specItemId, r.stock]));
  const signed = acts.filter((a) => a.status === "SIGNED").length;
  // Своих документов обычно немного, поэтому системы берём из них же, а не из справочника.
  const actSystems = [...new Set(acts.map((a) => a.system))].sort();

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Сдача работ заказчику</h2>
          <p className="text-sm text-ink-400">
            Отдельный контур: участок — это «объект + система + вид работы», без привязки к заявке и закупке.
            Кабель и гофра идут по другим заявкам, сопоставлять сданные работы с закупом нельзя.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Stat
            label="Участков в реестре"
            value={itd.total.scopes}
            hint={
              itd.registry
                ? `из файла «${itd.registry.sourceFile ?? "без имени"}», строк ${itd.registry.rows}`
                : "реестр инспекций ещё не загружен"
            }
          />
          <Stat
            label="Работы приняты"
            value={itd.total.accepted}
            tone={itd.total.accepted > 0 ? "good" : "default"}
            hint={
              itd.total.partial || itd.total.remarks
                ? `частично ${itd.total.partial} · замечания ${itd.total.remarks}`
                : "физика принята заказчиком"
            }
          />
          <Stat
            label="Пакет документов сдан"
            value={itd.total.dossierDone}
            tone={itd.total.dossierDone === itd.total.scopes && itd.total.scopes > 0 ? "good" : "warn"}
            hint="входной контроль, сертификаты, трасса по проекту"
          />
        </div>

        {itd.systems.length ? (
          <Card className="divide-y divide-ink-100">
            {itd.systems.map((row) => (
              <div key={row.system} className="grid gap-2 p-4 sm:grid-cols-[10rem_1fr_1fr]">
                <div className="text-sm font-medium">
                  <Abbr term={row.system} />
                  <span className="ml-2 tabular text-ink-400">{row.scopes}</span>
                </div>
                <div>
                  <div className="flex items-baseline justify-between gap-2 text-xs text-ink-600">
                    <span>Работы приняты</span>
                    <span className="tabular">
                      {row.accepted} из {row.scopes} · {pct(acceptedShare(row))}
                    </span>
                  </div>
                  <div className="mt-1">
                    <Progress value={acceptedShare(row)} />
                  </div>
                  {row.partial || row.remarks || row.requested ? (
                    <div className="mt-1 text-xs text-ink-400">
                      {row.partial ? `частично ${row.partial}` : ""}
                      {row.remarks ? `${row.partial ? " · " : ""}замечания ${row.remarks}` : ""}
                      {row.requested ? `${row.partial || row.remarks ? " · " : ""}без статуса ${row.requested}` : ""}
                    </div>
                  ) : null}
                </div>
                <div>
                  <div className="flex items-baseline justify-between gap-2 text-xs text-ink-600">
                    <span>Пакет документов сдан</span>
                    <span className="tabular">
                      {row.dossierDone} из {row.scopes} · {pct(dossierShare(row))}
                    </span>
                  </div>
                  <div className="mt-1">
                    <Progress value={dossierShare(row)} />
                  </div>
                </div>
              </div>
            ))}
          </Card>
        ) : null}

        <UploadForm
          action={`/api/projects/${id}/itd/import`}
          title="Реестр инспекций"
          hint="Файл «Инспекция», который ведёт ПТО. Он обновляется целиком, поэтому прошлые строки заменяются, а отметки о сданных пакетах документов остаются."
          submitLabel="Загрузить реестр"
        />

        <ItdScopes scopes={itd.scopes} />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">
            <AbbrText>Свои документы ИТД</AbbrText>
          </h2>
          <p className="text-sm text-ink-400">
            Документы, которые программа ведёт сама: объёмы уходят в факт, а ТМЦ списываются со склада.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Документов ИТД" value={acts.length} />
          <Stat label="Подписано" value={signed} tone="good" hint="списание со склада выполнено" />
          <Stat
            label="По системам"
            value={actSystems.length}
            hint={
              actSystems.length
                ? actSystems.map((s) => `${s}: ${acts.filter((a) => a.system === s).length}`).join(" · ")
                : "документов пока нет"
            }
          />
        </div>

        <div className="flex flex-wrap items-start gap-3">
          <LineItemsForm mode="act" projectId={id} specItems={spec} stock={stock} />
          <DeviationForm projectId={id} specItems={spec} />
        </div>

        {acts.length === 0 ? (
          <Empty
            title="Своих документов пока нет"
            hint={<AbbrText>Создайте документ ИТД — объёмы уйдут в факт, а ТМЦ спишутся со склада</AbbrText>}
          />
        ) : (
          <div className="space-y-3">
            {acts.map((a) => (
              <Card key={a.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">
                      <AbbrText>Документ ИТД</AbbrText> {a.number ?? "б/н"} · <Abbr term={a.system} />
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
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">
          <AbbrText>Отклонения от проекта (для ИТД)</AbbrText>
        </h2>
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
      </section>
    </div>
  );
}
