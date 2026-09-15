import { api } from "@/lib/api";
import type { Comparison, Offer, Supplier } from "@/lib/types";
import { Card, Empty, Badge, LinkButton } from "@/components/ui";
import UploadForm from "@/components/UploadForm";
import AddSupplierForm from "@/components/AddSupplierForm";
import ComparisonMatrix from "@/components/ComparisonMatrix";
import ExportButton from "@/components/ExportButton";
import { compactMoney, date } from "@/lib/format";

export default async function OffersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [offers, suppliers, comparison] = await Promise.all([
    api<Offer[]>(`/projects/${id}/offers`),
    api<Supplier[]>("/suppliers"),
    api<Comparison>(`/projects/${id}/comparison`),
  ]);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <UploadForm
          action={`/api/projects/${id}/offers/import`}
          pdfAction={`/api/projects/${id}/offers/import-pdf`}
          title="Загрузить КП поставщика"
          hint="Excel или PDF от поставщика — в том числе скан. Позиции сразу сопоставляются со спецификацией, а если в них есть тэги — сверяются с заявкой."
          submitLabel="Загрузить и проанализировать"
          fields={[
            {
              name: "supplierId",
              label: "Поставщик",
              options: [
                { value: "", label: "Поставщик: взять из документа" },
                ...suppliers.map((s) => ({ value: s.id, label: s.name })),
              ],
            },
            { name: "number", label: "№ КП" },
          ]}
        />
        <AddSupplierForm />
      </div>

      {offers.length === 0 ? (
        <Empty title="КП не загружены" hint="Загрузите хотя бы одно предложение, чтобы получить технический анализ" />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {offers.map((o) => (
              <Card key={o.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{o.supplier.name}</div>
                    <div className="text-xs text-ink-400">
                      {o.number ?? "б/н"} · {date(o.date)}
                      {o.deliveryDays ? ` · срок ${o.deliveryDays} дн.` : ""}
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <ExportButton path={`/offers/${o.id}/export.xlsx`} label="Excel" />
                    <LinkButton href={`/projects/${id}/offers/${o.id}`}>Анализ</LinkButton>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge tone="green">точных: {o.stats.exact}</Badge>
                  <Badge tone="blue">аналогов: {o.stats.analog}</Badge>
                  {o.stats.unmatched > 0 ? <Badge tone="gray">вне проекта: {o.stats.unmatched}</Badge> : null}
                  {o.stats.risky > 0 ? <Badge tone="amber">проверить: {o.stats.risky}</Badge> : null}
                </div>
                <div className="mt-3 text-lg font-semibold tabular">{compactMoney(o.stats.total, o.currency)}</div>
              </Card>
            ))}
          </div>

          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold">Сравнение по позициям проекта</h2>
              <ExportButton path={`/projects/${id}/export/comparison.xlsx`} label="Сравнение в Excel" />
            </div>
            <ComparisonMatrix data={comparison} projectId={id} />
          </div>
        </>
      )}
    </div>
  );
}
