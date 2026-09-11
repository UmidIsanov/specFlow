import { api } from "@/lib/api";
import type { SpecItem } from "@/lib/types";
import { Empty, Badge } from "@/components/ui";
import UploadForm from "@/components/UploadForm";
import SpecTable from "@/components/SpecTable";

const SYSTEMS = ["ПС", "СОУЭ", "СКС", "СОТ", "СКУД", "АПТ", "ПЕРИМЕТР"];

export default async function SpecPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const items = await api<SpecItem[]>(`/projects/${id}/spec`);

  const sections = [...new Set(items.map((i) => i.section).filter(Boolean))];
  const buildings = [...new Set(items.map((i) => i.building).filter(Boolean))];

  return (
    <div className="space-y-5">
      <UploadForm
        action={`/api/projects/${id}/spec/import`}
        pdfAction={`/api/projects/${id}/spec/import-pdf`}
        title="Импорт спецификации или заявки"
        hint="Excel из pdf-spec-converter либо PDF с текстовым слоем — заявка на закуп читается напрямую по сетке таблицы. Сканы нужно сначала прогнать через конвертер."
        fields={[
          {
            name: "system",
            label: "Система",
            options: SYSTEMS.map((s) => ({ value: s, label: `Система по умолчанию: ${s}` })),
          },
        ]}
      />

      {items.length === 0 ? (
        <Empty title="Спецификация пуста" hint="Загрузите файл выше — позиции появятся здесь" />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink-600">
            <span>
              Позиций: <b className="tabular">{items.length}</b>
            </span>
            {buildings.map((b) => (
              <Badge key={b} tone="blue">
                {b}: {items.filter((i) => i.building === b).length}
              </Badge>
            ))}
            {sections.map((s) => (
              <Badge key={s}>
                {s}: {items.filter((i) => i.section === s).length}
              </Badge>
            ))}
          </div>
          <SpecTable items={items} />
        </>
      )}
    </div>
  );
}
