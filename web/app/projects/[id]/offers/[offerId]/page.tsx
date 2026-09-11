import { api } from "@/lib/api";
import type { Analysis, OfferFull, SpecItem } from "@/lib/types";
import { Card, VerdictBadge, Badge, Stat, LinkButton } from "@/components/ui";
import VerdictControl from "@/components/VerdictControl";
import PrintButton from "@/components/PrintButton";
import { money, nf } from "@/lib/format";

export default async function OfferPage({ params }: { params: Promise<{ id: string; offerId: string }> }) {
  const { id, offerId } = await params;
  const [offer, spec] = await Promise.all([
    api<OfferFull>(`/offers/${offerId}`),
    api<SpecItem[]>(`/projects/${id}/spec`),
  ]);

  const coveredSpecIds = new Set(offer.items.map((i) => i.specItem?.id).filter(Boolean));
  const missing = spec.filter((s) => !coveredSpecIds.has(s.id));
  const total = offer.items.reduce((s, i) => s + i.qty * i.price, 0);
  const risky = offer.items.filter((i) => i.verdict === "ANALOG_RISK" || i.verdict === "REJECT").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            Технический анализ КП — {offer.supplier.name}
          </h2>
          <p className="text-sm text-ink-400">
            {offer.number ?? "б/н"}
            {offer.deliveryDays ? ` · срок поставки ${offer.deliveryDays} дн.` : ""}
            {offer.supplier.contact ? ` · ${offer.supplier.contact}` : ""}
          </p>
        </div>
        <div className="no-print flex gap-2">
          <LinkButton href={`/projects/${id}/offers`}>← Все КП</LinkButton>
          <PrintButton />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Сумма КП" value={money(total, offer.currency)} />
        <Stat label="Строк в КП" value={offer.items.length} />
        <Stat
          label="Требует решения инженера"
          value={risky}
          tone={risky > 0 ? "warn" : "good"}
          hint="аналоги с расхождениями"
        />
        <Stat
          label="Не предложено по проекту"
          value={missing.length}
          tone={missing.length > 0 ? "danger" : "good"}
          hint={`из ${spec.length} позиций спецификации`}
        />
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="border-b border-ink-200 bg-ink-50 text-left text-xs uppercase text-ink-400">
            <tr>
              <th className="px-3 py-2 font-medium">Позиция проекта</th>
              <th className="px-3 py-2 font-medium">Предложено поставщиком</th>
              <th className="px-3 py-2 text-right font-medium">Кол-во</th>
              <th className="px-3 py-2 text-right font-medium">Цена</th>
              <th className="px-3 py-2 font-medium">Заключение</th>
              <th className="no-print w-56 px-3 py-2 font-medium">Решение инженера</th>
            </tr>
          </thead>
          <tbody>
            {offer.items.map((item) => {
              const analysis: Analysis | null = item.analysisJson ? JSON.parse(item.analysisJson) : null;
              const s = item.specItem;
              const short = s && s.qtyPlan > item.qty;
              return (
                <tr key={item.id} className="border-b border-ink-100 align-top last:border-0">
                  <td className="px-3 py-3">
                    {s ? (
                      <>
                        <div className="font-medium leading-snug">{s.name}</div>
                        <div className="text-xs text-ink-400">
                          {s.article ?? "—"} · план {nf.format(s.qtyPlan)} {s.unit}
                        </div>
                      </>
                    ) : (
                      <span className="text-xs text-ink-400">нет в спецификации</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="leading-snug">{item.rawName}</div>
                    <div className="text-xs text-ink-400">
                      {item.article ?? "—"}
                      {item.manufacturer ? ` · ${item.manufacturer}` : ""}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular">
                    {nf.format(item.qty)} {item.unit}
                    {short ? (
                      <div className="text-xs font-medium text-amber-600">
                        −{nf.format(s!.qtyPlan - item.qty)}
                      </div>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular">
                    {money(item.price, offer.currency)}
                    <div className="text-xs text-ink-400">{money(item.price * item.qty, offer.currency)}</div>
                  </td>
                  <td className="px-3 py-3">
                    <VerdictBadge verdict={item.verdict} />
                    {analysis?.reasons?.length ? (
                      <ul className="mt-1.5 space-y-0.5 text-[11px] leading-snug text-ink-600">
                        {analysis.reasons.map((r, i) => (
                          <li key={i}>· {r}</li>
                        ))}
                      </ul>
                    ) : null}
                    {item.engineerComment ? (
                      <p className="mt-1.5 text-[11px] italic text-ink-600">Инженер: {item.engineerComment}</p>
                    ) : null}
                  </td>
                  <td className="no-print px-3 py-3">
                    <VerdictControl offerItemId={item.id} verdict={item.verdict} comment={item.engineerComment} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {missing.length > 0 ? (
        <Card className="p-5">
          <h3 className="font-semibold">Не вошло в КП — запросить отдельно</h3>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {missing.map((s) => (
              <li key={s.id} className="flex items-baseline justify-between gap-3 rounded-lg bg-ink-50 px-3 py-2">
                <span className="text-sm">
                  {s.name} <span className="text-ink-400">({s.article ?? "—"})</span>
                </span>
                <span className="whitespace-nowrap text-sm tabular text-ink-600">
                  {nf.format(s.qtyPlan)} {s.unit}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <Badge tone="green">Полное покрытие</Badge>
            <span className="text-sm text-ink-600">Поставщик закрыл все позиции спецификации.</span>
          </div>
        </Card>
      )}
    </div>
  );
}
