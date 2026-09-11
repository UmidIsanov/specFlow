import Link from "next/link";
import { api } from "@/lib/api";
import type { Project } from "@/lib/types";
import { Card, PageHeader, Empty } from "@/components/ui";
import CreateProjectForm from "@/components/CreateProjectForm";
import { date } from "@/lib/format";

export default async function Home() {
  const projects = await api<Project[]>("/projects");

  return (
    <>
      <PageHeader
        title="Объекты"
        subtitle="Спецификация → анализ КП → поставки → склад → исполнительная документация"
        actions={<CreateProjectForm />}
      />

      {projects.length === 0 ? (
        <Empty title="Объектов пока нет" hint="Создайте объект и загрузите спецификацию из Excel" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`}>
              <Card className="h-full p-5 transition hover:border-brand-500">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-semibold leading-snug">{p.name}</h2>
                  <span className="whitespace-nowrap text-xs text-ink-400">{date(p.createdAt)}</span>
                </div>
                <p className="mt-1 text-sm text-ink-400">
                  {p.customer ?? "—"}
                  {p.code ? ` · ${p.code}` : ""}
                </p>
                <dl className="mt-4 grid grid-cols-4 gap-2 text-center">
                  {[
                    ["Позиций", p._count?.specItems ?? 0],
                    ["КП", p._count?.offers ?? 0],
                    ["Поставок", p._count?.deliveries ?? 0],
                    ["Актов", p._count?.acts ?? 0],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-lg bg-ink-50 py-2">
                      <dt className="text-[11px] text-ink-400">{label}</dt>
                      <dd className="text-base font-semibold tabular">{value}</dd>
                    </div>
                  ))}
                </dl>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
