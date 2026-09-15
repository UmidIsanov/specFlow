import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../db.js";
import { ah, HttpError } from "../lib/http.js";
import { parseSpecWorkbook, inspectWorkbook } from "../lib/xlsx.js";
import { parsePdfTable } from "../lib/pdfTable.js";
import { convertPdf, converterStatus } from "../lib/converter.js";

export const specRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const rowSchema = z.object({
  pos: z.string().optional(),
  system: z.string().default("ПС"),
  name: z.string().min(1),
  article: z.string().optional(),
  code: z.string().optional(),
  manufacturer: z.string().optional(),
  unit: z.string().default("шт"),
  qtyPlan: z.number().default(0),
  pricePlan: z.number().optional(),
  note: z.string().optional(),
  section: z.string().optional(),
  building: z.string().optional(),
  docRef: z.string().optional(),
});

specRouter.get(
  "/projects/:projectId/spec",
  ah(async (req, res) => {
    res.json(
      await prisma.specItem.findMany({
        where: { projectId: req.params.projectId },
        orderBy: [{ system: "asc" }, { pos: "asc" }],
      })
    );
  })
);

/** Пакетная загрузка спецификации (в т.ч. из JSON, который отдаёт pdf-spec-converter). */
specRouter.post(
  "/projects/:projectId/spec",
  ah(async (req, res) => {
    const { items, replace } = z
      .object({ items: z.array(rowSchema).min(1), replace: z.boolean().default(false) })
      .parse(req.body);
    const projectId = req.params.projectId;

    if (replace) await prisma.specItem.deleteMany({ where: { projectId } });
    await prisma.specItem.createMany({ data: items.map((i) => ({ ...i, projectId })) });
    res.status(201).json({ created: items.length });
  })
);

/** Что лежит в книге: листы, распознанные колонки и первые строки — до импорта. */
specRouter.post(
  "/spec/inspect",
  upload.single("file"),
  ah(async (req, res) => {
    if (!req.file) throw new HttpError(400, "Файл не передан");
    res.json(inspectWorkbook(req.file.buffer));
  })
);

/** Импорт спецификации из Excel (выгрузка pdf-spec-converter или лист из AutoCAD). */
specRouter.post(
  "/projects/:projectId/spec/import",
  upload.single("file"),
  ah(async (req, res) => {
    if (!req.file) throw new HttpError(400, "Файл не передан");
    const sheet = typeof req.body.sheet === "string" && req.body.sheet ? req.body.sheet : undefined;
    const fallbackSystem =
      typeof req.body.system === "string" && req.body.system ? req.body.system : "ПС";

    const parsed = parseSpecWorkbook(req.file.buffer, sheet);
    if (!parsed.rows.length) {
      throw new HttpError(
        422,
        `Не удалось распознать таблицу на листе «${parsed.sheet}». Листы в файле: ${parsed.sheets.join(", ")}`
      );
    }

    const projectId = req.params.projectId;
    if (req.body.replace === "true") await prisma.specItem.deleteMany({ where: { projectId } });

    await prisma.specItem.createMany({
      data: parsed.rows.map((r) => ({
        projectId,
        // система берётся из файла, а выбор в форме нужен лишь когда колонки «Система» нет
        system: r.system ?? fallbackSystem,
        pos: r.pos,
        name: r.name,
        article: r.article,
        code: r.code,
        manufacturer: r.manufacturer,
        unit: r.unit ?? "шт",
        qtyPlan: r.qty ?? 0,
        pricePlan: r.price,
        note: r.note,
        section: r.section,
        building: r.building,
        docRef: r.docRef,
      })),
    });

    res.status(201).json({
      created: parsed.rows.length,
      sheet: parsed.sheet,
      sheets: parsed.sheets,
      columns: Object.keys(parsed.columns),
      buildings: [...new Set(parsed.rows.map((r) => r.building).filter(Boolean))],
      preview: parsed.rows.slice(0, 5),
    });
  })
);

/** Конвертер сканов: доступен ли и настроен ли ключ — чтобы интерфейс честно сказал заранее. */
specRouter.get(
  "/converter/status",
  ah(async (_req, res) => {
    res.json(await converterStatus());
  })
);

/**
 * Импорт заявки или спецификации из PDF.
 * Текстовый слой разбираем сами по сетке таблицы; скан отправляем в конвертер (Gemini).
 */
specRouter.post(
  "/projects/:projectId/spec/import-pdf",
  upload.single("file"),
  ah(async (req, res) => {
    if (!req.file) throw new HttpError(400, "Файл не передан");
    const projectId = req.params.projectId;
    const fallbackSystem =
      typeof req.body.system === "string" && req.body.system ? req.body.system : "ПС";

    let rows;
    let source: "text" | "converter";
    let pages: number | undefined;
    const table = await parsePdfTable(req.file.buffer);
    if (table.rows.length) {
      rows = table.rows;
      source = "text";
      pages = table.pages;
    } else {
      const converted = await convertPdf(req.file.buffer, req.file.originalname, "spec");
      if (!converted.rows.length) throw new HttpError(422, "Конвертер не нашёл в документе таблицу спецификации");
      rows = converted.rows;
      source = "converter";
    }

    if (req.body.replace === "true") await prisma.specItem.deleteMany({ where: { projectId } });

    await prisma.specItem.createMany({
      data: rows.map((r) => ({
        projectId,
        system: r.system ?? fallbackSystem,
        pos: r.pos,
        name: r.name,
        article: r.article,
        code: r.code,
        tag: r.tag,
        datasheet: r.datasheet,
        manufacturer: r.manufacturer,
        unit: r.unit ?? "шт",
        qtyPlan: r.qty ?? 0,
        pricePlan: r.price,
        note: r.note,
        section: r.section,
        building: r.building,
        docRef: r.docRef,
      })),
    });

    res.status(201).json({
      created: rows.length,
      source,
      pages,
      columns: source === "text" ? table.columns.filter((c) => c.field).map((c) => ({ field: c.field, title: c.title })) : undefined,
      buildings: [...new Set(rows.map((r) => r.building).filter(Boolean))],
      preview: rows.slice(0, 5),
    });
  })
);

specRouter.patch(
  "/spec-items/:id",
  ah(async (req, res) => {
    const data = rowSchema.partial().parse(req.body);
    res.json(await prisma.specItem.update({ where: { id: req.params.id }, data }));
  })
);

specRouter.delete(
  "/spec-items/:id",
  ah(async (req, res) => {
    await prisma.specItem.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);
