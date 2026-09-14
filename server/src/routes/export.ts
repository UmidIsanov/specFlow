import { Router } from "express";
import type { Response } from "express";
import * as XLSX from "xlsx";
import { prisma } from "../db.js";
import { ah, HttpError } from "../lib/http.js";
import { planFact } from "../lib/analytics.js";

export const exportRouter = Router();

const VERDICT_LABEL: Record<string, string> = {
  OK: "Соответствует",
  ANALOG_OK: "Аналог — годен",
  ANALOG_RISK: "Аналог — проверить",
  REJECT: "Не подходит",
  PENDING: "Нет в проекте",
};

function sendWorkbook(res: Response, wb: XLSX.WorkBook, filename: string) {
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.send(buf);
}

/** Ширина колонок по содержимому — иначе Excel открывает лист с обрезанными ячейками. */
function autoWidth(sheet: XLSX.WorkSheet, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  sheet["!cols"] = keys.map((k) => {
    const longest = rows.reduce((m, r) => Math.max(m, String(r[k] ?? "").length), k.length);
    return { wch: Math.min(60, Math.max(8, longest + 2)) };
  });
}

function addSheet(wb: XLSX.WorkBook, name: string, rows: Record<string, unknown>[]) {
  const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ "—": "нет данных" }]);
  autoWidth(sheet, rows);
  XLSX.utils.book_append_sheet(wb, sheet, name.slice(0, 31));
}

/* -------------------------------- Спецификация -------------------------------- */

exportRouter.get(
  "/projects/:projectId/export/spec.xlsx",
  ah(async (req, res) => {
    const project = await prisma.project.findUnique({ where: { id: req.params.projectId } });
    if (!project) throw new HttpError(404, "Объект не найден");
    const items = await prisma.specItem.findMany({
      where: { projectId: project.id },
      orderBy: [{ building: "asc" }, { section: "asc" }, { pos: "asc" }],
    });

    const wb = XLSX.utils.book_new();
    const hasTags = items.some((i) => i.tag);
    addSheet(
      wb,
      "Спецификация",
      items.map((i) => ({
        "№": i.pos ?? "",
        ...(hasTags ? { "Тэг": i.tag ?? "", "Опросный лист": i.datasheet ?? "" } : {}),
        Наименование: i.name,
        "Тип, марка": i.article ?? "",
        "Код продукции": i.code ?? "",
        Производитель: i.manufacturer ?? "",
        "Ед.": i.unit,
        "Кол-во": i.qtyPlan,
        Система: i.system,
        Раздел: i.section ?? "",
        Здание: i.building ?? "",
        "Шифр документа": i.docRef ?? "",
        Примечание: i.note ?? "",
      }))
    );

    // сводка по наименованиям — как в выгрузке pdf-spec-converter, но без задвоений
    const totals = new Map<string, { name: string; article: string; code: string; unit: string; qty: number; buildings: Set<string> }>();
    for (const i of items) {
      const key = (i.code ?? i.article ?? i.name).toUpperCase().replace(/[^A-ZА-Я0-9]/g, "");
      let t = totals.get(key);
      if (!t) totals.set(key, (t = { name: i.name, article: i.article ?? "", code: i.code ?? "", unit: i.unit, qty: 0, buildings: new Set() }));
      t.qty += i.qtyPlan;
      if (i.building) t.buildings.add(i.building);
    }
    addSheet(
      wb,
      "Итого по наименованиям",
      [...totals.values()].map((t) => ({
        Наименование: t.name,
        "Тип, марка": t.article,
        "Код продукции": t.code,
        "Ед.": t.unit,
        "Итого кол-во": t.qty,
        Зданий: t.buildings.size,
      }))
    );

    sendWorkbook(res, wb, `Спецификация — ${project.name}.xlsx`);
  })
);

/* ----------------------------- Сравнение КП (матрица) ------------------------- */

exportRouter.get(
  "/projects/:projectId/export/comparison.xlsx",
  ah(async (req, res) => {
    const project = await prisma.project.findUnique({ where: { id: req.params.projectId } });
    if (!project) throw new HttpError(404, "Объект не найден");

    const base = `${req.protocol}://${req.get("host")}`;
    const cmp = (await (await fetch(`${base}/api/projects/${project.id}/comparison`)).json()) as {
      offers: { id: string; supplier: string; number: string | null; currency: string; covered: number; missing: number; risky: number; shortfall: number; total: number }[];
      rows: {
        specItem: { pos: string | null; name: string; article: string | null; code: string | null; unit: string; qtyPlan: number };
        cells: Record<string, { name: string; qty: number; unitPrice: number; total: number; verdict: string } | null>;
        recommendedOfferId: string | null;
      }[];
    };

    const wb = XLSX.utils.book_new();
    addSheet(
      wb,
      "Сводка по КП",
      cmp.offers.map((o) => ({
        Поставщик: o.supplier,
        "№ КП": o.number ?? "",
        Валюта: o.currency,
        "Закрыто позиций": o.covered,
        "Не предложено": o.missing,
        "Требует решения": o.risky,
        Недопоставка: o.shortfall,
        "Сумма КП": o.total,
      }))
    );

    addSheet(
      wb,
      "Сравнение по позициям",
      cmp.rows.map((r) => {
        const row: Record<string, unknown> = {
          "№": r.specItem.pos ?? "",
          Позиция: r.specItem.name,
          "Тип, марка": r.specItem.article ?? "",
          "Код продукции": r.specItem.code ?? "",
          "Ед.": r.specItem.unit,
          План: r.specItem.qtyPlan,
        };
        for (const o of cmp.offers) {
          const c = r.cells[o.id];
          row[`${o.supplier} — предложено`] = c ? c.name : "нет в КП";
          row[`${o.supplier} — кол-во`] = c ? c.qty : "";
          row[`${o.supplier} — цена`] = c ? Math.round(c.unitPrice) : "";
          row[`${o.supplier} — заключение`] = c ? VERDICT_LABEL[c.verdict] ?? c.verdict : "";
        }
        row["Выгоднее"] = cmp.offers.find((o) => o.id === r.recommendedOfferId)?.supplier ?? "";
        return row;
      })
    );

    sendWorkbook(res, wb, `Сравнение КП — ${project.name}.xlsx`);
  })
);

/* ------------------------- Техзаключение по одному КП ------------------------- */

exportRouter.get(
  "/offers/:id/export.xlsx",
  ah(async (req, res) => {
    const offer = await prisma.offer.findUnique({
      where: { id: req.params.id },
      include: { supplier: true, project: true, items: { include: { specItem: true } } },
    });
    if (!offer) throw new HttpError(404, "КП не найдено");

    const spec = await prisma.specItem.findMany({ where: { projectId: offer.projectId } });
    const covered = new Set(offer.items.map((i) => i.specItemId).filter(Boolean));

    const wb = XLSX.utils.book_new();
    addSheet(
      wb,
      "Заключение",
      offer.items.map((i) => {
        const a = i.analysisJson ? (JSON.parse(i.analysisJson) as { reasons?: string[] }) : null;
        return {
          "№ КП": i.rawPos ?? "",
          "Предложено поставщиком": i.rawName,
          "Артикул КП": i.article ?? "",
          "Производитель КП": i.manufacturer ?? "",
          "Кол-во": i.qty,
          "Ед.": i.unit,
          Цена: i.price,
          Сумма: i.qty * i.price,
          "Позиция проекта": i.specItem?.name ?? "",
          "Марка по проекту": i.specItem?.article ?? "",
          "План по проекту": i.specItem?.qtyPlan ?? "",
          Заключение: VERDICT_LABEL[i.verdict] ?? i.verdict,
          Обоснование: a?.reasons?.join("; ") ?? "",
          "Комментарий инженера": i.engineerComment ?? "",
        };
      })
    );
    addSheet(
      wb,
      "Не предложено",
      spec
        .filter((s) => !covered.has(s.id))
        .map((s) => ({
          "№": s.pos ?? "",
          Наименование: s.name,
          "Тип, марка": s.article ?? "",
          "Код продукции": s.code ?? "",
          "Ед.": s.unit,
          "Кол-во": s.qtyPlan,
        }))
    );

    sendWorkbook(res, wb, `Техзаключение — ${offer.supplier.name} — ${offer.project.name}.xlsx`);
  })
);

/* -------------------------------- План / факт ---------------------------------- */

exportRouter.get(
  "/projects/:projectId/export/plan-fact.xlsx",
  ah(async (req, res) => {
    const project = await prisma.project.findUnique({ where: { id: req.params.projectId } });
    if (!project) throw new HttpError(404, "Объект не найден");
    const rows = await planFact(project.id);

    const wb = XLSX.utils.book_new();
    addSheet(
      wb,
      "План-факт",
      rows.map((r) => ({
        "№": r.pos ?? "",
        Система: r.system,
        Наименование: r.name,
        Маркировка: r.article ?? "",
        "Ед.": r.unit,
        План: r.qtyPlan,
        Привезено: r.delivered,
        Смонтировано: r.installed,
        "На складе": r.stock,
        "Осталось смонтировать": r.remaining,
        Дозаказать: r.toOrder,
        "Готовность, %": Math.round(r.progress * 100),
      }))
    );
    addSheet(
      wb,
      "Дозаказать",
      rows.filter((r) => r.toOrder > 0).map((r) => ({
        Наименование: r.name,
        Маркировка: r.article ?? "",
        "Ед.": r.unit,
        План: r.qtyPlan,
        Привезено: r.delivered,
        Дозаказать: r.toOrder,
      }))
    );
    sendWorkbook(res, wb, `План-факт — ${project.name}.xlsx`);
  })
);
