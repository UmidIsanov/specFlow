import type { AuditScope } from "@/lib/types";
import { Card, Badge } from "@/components/ui";
import { nf } from "@/lib/format";

/**
 * Сверка по составу — для КП на системы (ПЛК, шкафы), где строки не привязаны к тэгам.
 * Слева запрос заявки, справа предложение; вывод о достаточности делает инженер.
 */
export default function ScopeView({ scope, currency }: { scope: AuditScope; currency: string }) {
  const plc = scope.request.systemPositions.filter((p) => /PLC|CPU/i.test(p.tag ?? ""));
  const hmi = scope.request.systemPositions.filter((p) => /HMI/i.test(p.tag ?? ""));
  const systems = scope.offer.systems.filter((s) => s.controllers > 0);
  const other = scope.offer.systems.filter((s) => s.controllers === 0);
  const sumIo = (k: "di" | "do" | "ai") => systems.reduce((s, x) => s + x[k], 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <h3 className="font-semibold">Заявка просит</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone="blue">шкафов ПЛК: {plc.reduce((s, p) => s + p.qty, 0)}</Badge>
            <Badge tone="blue">панелей HMI: {hmi.reduce((s, p) => s + p.qty, 0)}</Badge>
          </div>
          <ul className="mt-3 space-y-1.5">
            {scope.request.systemPositions.map((p) => (
              <li key={`${p.tag}-${p.name}`} className="flex items-baseline justify-between gap-2 text-sm">
                <span>
                  <span className="font-medium tabular">{p.tag}</span>
                  <span className="text-ink-600"> — {p.name}</span>
                </span>
                <span className="whitespace-nowrap tabular text-ink-400">{nf.format(p.qty)} шт</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold">КП предлагает</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone={systems.length === plc.reduce((s, p) => s + p.qty, 0) ? "green" : "amber"}>
              систем ПЛК: {systems.length}
            </Badge>
            <Badge tone={scope.offer.hmi === hmi.reduce((s, p) => s + p.qty, 0) ? "green" : "amber"}>
              HMI: {scope.offer.hmi}
            </Badge>
            <Badge>
              каналов всего: DI {nf.format(sumIo("di"))} · DO {nf.format(sumIo("do"))} · AI {nf.format(sumIo("ai"))}
            </Badge>
          </div>
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400">
              <tr>
                <th className="pb-1 font-medium">Система</th>
                <th className="pb-1 text-right font-medium">DI</th>
                <th className="pb-1 text-right font-medium">DO</th>
                <th className="pb-1 text-right font-medium">AI</th>
                <th className="pb-1 text-right font-medium">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {systems.map((s) => (
                <tr key={s.name} className="border-t border-ink-100">
                  <td className="py-1">
                    {s.name} <span className="text-xs text-ink-400">({s.lines} стр.)</span>
                  </td>
                  <td className="py-1 text-right tabular">{s.di || "—"}</td>
                  <td className="py-1 text-right tabular">{s.do || "—"}</td>
                  <td className="py-1 text-right tabular">{s.ai || "—"}</td>
                  <td className="py-1 text-right tabular">
                    {nf.format(Math.round(s.sum))} {currency}
                  </td>
                </tr>
              ))}
              {other.map((s) => (
                <tr key={s.name} className="border-t border-ink-100 text-ink-600">
                  <td className="py-1">{s.name}</td>
                  <td colSpan={3} />
                  <td className="py-1 text-right tabular">
                    {nf.format(Math.round(s.sum))} {currency}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="font-semibold">Полевые приборы по объектам заявки</h3>
        <p className="mt-0.5 text-xs text-ink-400">
          Для оценки достаточности каналов: газоанализаторы (AIT) — аналоговые входы, посты и табло (UI, UL, HL,
          BIAS, BIAL) — дискретные выходы.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="text-left text-xs uppercase text-ink-400">
              <tr>
                <th className="pb-1 font-medium">Объект</th>
                <th className="pb-1 text-right font-medium">Тэгов</th>
                <th className="pb-1 font-medium">Состав</th>
              </tr>
            </thead>
            <tbody>
              {scope.request.objects.map((o) => (
                <tr key={o.object} className="border-t border-ink-100">
                  <td className="py-1.5 font-medium tabular">{o.object}</td>
                  <td className="py-1.5 text-right tabular">{o.tags}</td>
                  <td className="py-1.5 text-ink-600">
                    {o.families.map((f) => `${f.family}: ${f.count}`).join(" · ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
