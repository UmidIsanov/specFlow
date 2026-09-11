import { api } from "@/lib/api";
import type { WorkAct } from "@/lib/types";
import PrintButton from "@/components/PrintButton";
import { date, nf } from "@/lib/format";

export default async function ActPrintPage({ params }: { params: Promise<{ actId: string }> }) {
  const { actId } = await params;
  const act = await api<WorkAct>(`/acts/${actId}`);
  const project = act.project;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex justify-end">
        <PrintButton />
      </div>

      <div className="rounded-xl border border-ink-200 bg-white p-10 print:border-0 print:p-0">
        <div className="text-center">
          <div className="text-sm uppercase tracking-wide text-ink-600">Акт освидетельствования</div>
          <h1 className="mt-1 text-lg font-semibold">
            установки оборудования {act.number ? `№ ${act.number}` : ""}
          </h1>
          <div className="mt-1 text-sm text-ink-600">от {date(act.date)}</div>
        </div>

        <dl className="mt-8 space-y-1.5 text-sm">
          <div className="flex gap-2">
            <dt className="w-44 shrink-0 text-ink-400">Объект:</dt>
            <dd className="font-medium">{project?.name ?? "—"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-44 shrink-0 text-ink-400">Заказчик:</dt>
            <dd>{project?.customer ?? "—"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-44 shrink-0 text-ink-400">Шифр проекта:</dt>
            <dd>{project?.code ?? "—"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-44 shrink-0 text-ink-400">Система:</dt>
            <dd>{act.system}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-44 shrink-0 text-ink-400">Участок работ:</dt>
            <dd>{act.location ?? "—"}</dd>
          </div>
        </dl>

        <p className="mt-6 text-sm leading-relaxed">
          Комиссия подтверждает, что на указанном участке смонтировано и предъявлено к приёмке следующее оборудование
          и материалы согласно проектной документации:
        </p>

        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="bg-ink-50">
              <th className="border border-ink-200 px-2 py-1.5 text-left font-medium">№</th>
              <th className="border border-ink-200 px-2 py-1.5 text-left font-medium">Наименование</th>
              <th className="border border-ink-200 px-2 py-1.5 text-left font-medium">Маркировка</th>
              <th className="border border-ink-200 px-2 py-1.5 text-left font-medium">Ед.</th>
              <th className="border border-ink-200 px-2 py-1.5 text-right font-medium">Кол-во</th>
            </tr>
          </thead>
          <tbody>
            {act.items.map((i, idx) => (
              <tr key={i.id}>
                <td className="border border-ink-200 px-2 py-1.5 tabular">{idx + 1}</td>
                <td className="border border-ink-200 px-2 py-1.5">{i.specItem.name}</td>
                <td className="border border-ink-200 px-2 py-1.5">{i.specItem.article ?? "—"}</td>
                <td className="border border-ink-200 px-2 py-1.5">{i.specItem.unit}</td>
                <td className="border border-ink-200 px-2 py-1.5 text-right tabular">{nf.format(i.qty)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="mt-6 text-sm">
          Указанные материально-технические ценности списаны со склада объекта на основании настоящего акта.
          Статус акта: <b>{act.status === "SIGNED" ? "подписан" : "черновик"}</b>.
        </p>

        <div className="mt-12 grid grid-cols-2 gap-10 text-sm">
          {["Представитель подрядчика", "Представитель заказчика"].map((role) => (
            <div key={role}>
              <div className="text-ink-400">{role}</div>
              <div className="mt-8 border-t border-ink-900 pt-1 text-xs text-ink-400">подпись / расшифровка</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
