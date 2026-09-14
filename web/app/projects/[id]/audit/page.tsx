import { api } from "@/lib/api";
import type { TagAudit } from "@/lib/types";
import { Card, Stat, Badge, Empty } from "@/components/ui";
import AuditTables from "@/components/AuditTables";
import OfferSwitcher from "@/components/OfferSwitcher";
import ScopeView from "@/components/ScopeView";
import ExportButton from "@/components/ExportButton";
import { nf } from "@/lib/format";

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ offerId?: string }>;
}) {
  const { id } = await params;
  const { offerId } = await searchParams;

  let audit: TagAudit;
  try {
    audit = await api<TagAudit>(`/projects/${id}/tag-audit${offerId ? `?offerId=${offerId}` : ""}`);
  } catch {
    return (
      <Empty
        title="Нечего сверять"
        hint="Загрузите заявку в разделе «Спецификация» и коммерческое предложение в разделе «Анализ КП»"
      />
    );
  }

  const { offer, request, summary } = audit;
  const money = (v: number) => `${nf.format(Math.round(v))} ${offer.currency}`;
  const outsideSum = audit.lines.filter((l) => l.verdict === "OUTSIDE").reduce((s, l) => s + l.total, 0);
  // КП на системы (ПЛК, шкафы) не привязано к тэгам — сверяем по составу
  const byScope = summary.tagsOffered === 0;

  return (
    <div className="space-y-5">
      <OfferSwitcher offers={audit.offers} currentId={offer.id} />

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">
              {byScope ? "Сверка КП с заявкой по составу систем" : "Сверка КП с заявкой по теговым номерам"}
            </h2>
            <p className="mt-0.5 text-sm text-ink-400">
              {offer.supplier} · {offer.number ?? "б/н"} · {offer.lines} строк, {nf.format(offer.qtyTotal)} ед.,{" "}
              {money(offer.sum)}
              {offer.deliveryDays ? ` · срок ${offer.deliveryDays} дн.` : ""}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <ExportButton path={`/projects/${id}/export/tag-audit.xlsx?offerId=${offer.id}`} label="Заключение в Excel" />
            <div className="text-right text-sm text-ink-400">
              Заявка: {nf.format(request.positions)} позиций
              <div>
                {nf.format(request.tagged)} с тэгом · {nf.format(request.untagged)} без тэга
              </div>
            </div>
          </div>
        </div>
      </Card>

      {byScope ? (
        <ScopeView scope={audit.scope} currency={offer.currency} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Тэгов совпало с заявкой"
              value={nf.format(summary.coveredFromRequest)}
              hint={`из ${nf.format(summary.tagsOffered)} предложенных`}
              tone="good"
            />
            <Stat
              label="Предложено вне заявки"
              value={nf.format(summary.outsideRequest)}
              hint={`${summary.linesOutside} строк целиком · ${money(outsideSum)}`}
              tone={summary.outsideRequest > 0 ? "danger" : "good"}
            />
            <Stat
              label="Позиций заявки не закрыто"
              value={nf.format(summary.notOffered)}
              hint={`из ${nf.format(request.tagged)} тэгов заявки`}
              tone={summary.notOffered > 0 ? "warn" : "good"}
            />
            <Stat
              label="Замечаний по строкам"
              value={summary.qtyMismatchLines + summary.datasheetMismatchLines + summary.duplicatedTags}
              hint="кол-во, опросные листы, дубли"
              tone={
                summary.qtyMismatchLines + summary.datasheetMismatchLines + summary.duplicatedTags > 0 ? "warn" : "good"
              }
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge tone="green">совпало полностью: {audit.lines.filter((l) => l.verdict === "MATCH").length}</Badge>
            <Badge tone="amber">частично вне заявки: {summary.linesPartial}</Badge>
            <Badge tone="red">целиком вне заявки: {summary.linesOutside}</Badge>
            <Badge tone="gray">без тэгов, только по ОЛ: {summary.linesWithoutTags}</Badge>
          </div>

          <AuditTables audit={audit} />
        </>
      )}
    </div>
  );
}
