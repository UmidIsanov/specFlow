import { api } from "@/lib/api";
import type { Request, SpecItem } from "@/lib/types";
import { Empty, Badge } from "@/components/ui";
import UploadForm from "@/components/UploadForm";
import SpecTable from "@/components/SpecTable";
import ExportButton from "@/components/ExportButton";
import ClearSpecButton from "@/components/ClearSpecButton";
import RequestBar from "@/components/RequestBar";
import { requestLabel } from "@/lib/request";
import { SYSTEMS, abbrLabel } from "@/lib/abbr";

export default async function SpecPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ request?: string }>;
}) {
  const { id } = await params;
  const { request } = await searchParams;

  const [requests, all] = await Promise.all([
    api<Request[]>(`/projects/${id}/requests`),
    api<SpecItem[]>(`/projects/${id}/spec`),
  ]);

  // Выбранной может не оказаться: заявку удалили, а ссылка осталась в закладке.
  const active = requests.find((r) => r.id === request);
  const items = active ? all.filter((i) => i.requestId === active.id) : all;

  const sections = [...new Set(items.map((i) => i.section).filter(Boolean))];
  const buildings = [...new Set(items.map((i) => i.building).filter(Boolean))];

  return (
    <div className="space-y-5">
      <RequestBar projectId={id} requests={requests} activeId={active?.id} total={all.length} />

      <UploadForm
        action={`/api/projects/${id}/spec/import`}
        pdfAction={`/api/projects/${id}/spec/import-pdf`}
        title={active ? `Импорт в заявку ${requestLabel(active)}` : "Импорт заявки"}
        hint={
          active
            ? "Позиции добавятся к выбранной заявке. Excel из конвертера или любой PDF: с текстовым слоем читается сразу, скан распознаётся через Gemini — до пары минут."
            : "Номер заявки можно не вводить — он берётся из имени файла и шапки таблицы. Excel из конвертера или любой PDF: с текстовым слоем читается сразу, скан распознаётся через Gemini — до пары минут."
        }
        allowReplace
        hidden={active ? { requestId: active.id } : {}}
        fields={[
          {
            name: "system",
            label: "Система",
            options: SYSTEMS.map((s) => ({ value: s, label: `Система по умолчанию: ${abbrLabel(s)}` })),
          },
          ...(active ? [] : [{ name: "number", label: "Номер заявки" }, { name: "revision", label: "Ревизия" }]),
        ]}
      />

      {items.length === 0 ? (
        <Empty
          title={active ? `В заявке ${requestLabel(active)} пока пусто` : "Заявка пуста"}
          hint="Загрузите файл выше — позиции появятся здесь"
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink-600">
            <ExportButton
              path={`/projects/${id}/export/spec.xlsx${active ? `?requestId=${active.id}` : ""}`}
              label={active ? `Заявка ${requestLabel(active)} в Excel` : "Заявка в Excel"}
            />
            {active ? null : <ClearSpecButton projectId={id} count={items.length} />}
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
          <SpecTable items={items} projectId={id} />
        </>
      )}
    </div>
  );
}
