import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../db.js";
import { ah, HttpError } from "../lib/http.js";
import { parseSpecWorkbook } from "../lib/xlsx.js";
import { matchOfferItem, normalizeArticle, normalizeKey, type Candidate } from "../lib/match.js";
import { expandTagList, findTagsInText } from "../lib/tags.js";
import { parsePdfTable } from "../lib/pdfTable.js";
import { convertPdf } from "../lib/converter.js";
import { createJob, runJob } from "../lib/jobs.js";

export const offersRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const offerItemSchema = z.object({
  rawPos: z.string().optional(),
  rawName: z.string().min(1),
  article: z.string().optional(),
  code: z.string().optional(),
  manufacturer: z.string().optional(),
  unit: z.string().default("шт"),
  qty: z.number().default(0),
  price: z.number().default(0),
});

/** Прогоняет все строки КП через матчер и сохраняет результат. */
async function analyzeOffer(offerId: string) {
  const offer = await prisma.offer.findUnique({ where: { id: offerId }, include: { items: true } });
  if (!offer) throw new HttpError(404, "КП не найдено");

  const spec = await prisma.specItem.findMany({ where: { projectId: offer.projectId } });
  const candidates: Candidate[] = spec.map((s) => ({
    id: s.id,
    name: s.name,
    article: s.article,
    code: s.code,
    manufacturer: s.manufacturer,
    unit: s.unit,
  }));

  await prisma.$transaction(
    offer.items.map((item) => {
      const r = matchOfferItem(
        {
          id: item.id,
          name: item.rawName,
          article: item.article,
          code: item.code,
          manufacturer: item.manufacturer,
          unit: item.unit,
        },
        candidates
      );
      return prisma.offerItem.update({
        where: { id: item.id },
        data: {
          specItemId: r.specItemId,
          matchType: r.matchType,
          matchScore: r.matchScore,
          verdict: r.verdict,
          analysisJson: JSON.stringify({ reasons: r.reasons, paramDiffs: r.paramDiffs }),
        },
      });
    })
  );

  await prisma.offer.update({ where: { id: offerId }, data: { status: "ANALYZED" } });
  return offerFull(offerId);
}

async function offerFull(offerId: string) {
  return prisma.offer.findUnique({
    where: { id: offerId },
    include: { supplier: true, items: { include: { specItem: true } } },
  });
}

offersRouter.get(
  "/projects/:projectId/offers",
  ah(async (req, res) => {
    const offers = await prisma.offer.findMany({
      where: { projectId: req.params.projectId },
      include: { supplier: true, items: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(
      offers.map((o) => ({
        ...o,
        items: undefined,
        stats: {
          lines: o.items.length,
          exact: o.items.filter((i) => i.matchType === "EXACT").length,
          analog: o.items.filter((i) => i.matchType === "ANALOG").length,
          unmatched: o.items.filter((i) => i.matchType === "NONE").length,
          risky: o.items.filter((i) => i.verdict === "ANALOG_RISK" || i.verdict === "REJECT").length,
          total: o.items.reduce((s, i) => s + i.qty * i.price, 0),
        },
      }))
    );
  })
);

/** Загрузка КП структурой: строки с перечнями тэгов и ссылками на опросные листы. */
offersRouter.post(
  "/projects/:projectId/offers/json",
  ah(async (req, res) => {
    const body = z
      .object({
        supplierId: z.string(),
        number: z.string().optional(),
        currency: z.string().default("RUB"),
        deliveryDays: z.number().int().optional(),
        items: z
          .array(
            z.object({
              pos: z.union([z.string(), z.number()]).optional(),
              name: z.string().min(1),
              article: z.string().optional(),
              code: z.string().optional(),
              datasheet: z.string().optional(),
              section: z.string().optional(),
              tags: z.array(z.string()).default([]),
              unit: z.string().default("шт"),
              qty: z.number().default(0),
              price: z.number().default(0),
            })
          )
          .min(1),
      })
      .parse(req.body);

    const offer = await prisma.offer.create({
      data: {
        projectId: req.params.projectId,
        supplierId: body.supplierId,
        number: body.number,
        currency: body.currency,
        deliveryDays: body.deliveryDays,
        items: {
          create: body.items.map((i) => {
            // тэги приходят перечнем или диапазоном; если их нет — ищем прямо в наименовании
            const tags = i.tags.length ? expandTagList(i.tags) : findTagsInText(i.name);
            return {
              rawPos: i.pos === undefined ? undefined : String(i.pos),
              rawName: i.name,
              article: i.article,
              code: i.code,
              datasheet: i.datasheet,
              section: i.section,
              tagsJson: tags.length ? JSON.stringify(tags) : undefined,
              unit: i.unit,
              qty: i.qty,
              price: i.price,
            };
          }),
        },
      },
    });
    res.status(201).json(await analyzeOffer(offer.id));
  })
);

offersRouter.post(
  "/projects/:projectId/offers",
  ah(async (req, res) => {
    const body = z
      .object({
        supplierId: z.string(),
        number: z.string().optional(),
        currency: z.string().default("UZS"),
        deliveryDays: z.number().int().optional(),
        items: z.array(offerItemSchema).min(1),
      })
      .parse(req.body);

    const offer = await prisma.offer.create({
      data: {
        projectId: req.params.projectId,
        supplierId: body.supplierId,
        number: body.number,
        currency: body.currency,
        deliveryDays: body.deliveryDays,
        items: { create: body.items },
      },
    });
    res.status(201).json(await analyzeOffer(offer.id));
  })
);

/** Импорт КП из Excel + немедленный технический анализ. */
offersRouter.post(
  "/projects/:projectId/offers/import",
  upload.single("file"),
  ah(async (req, res) => {
    if (!req.file) throw new HttpError(400, "Файл не передан");
    const supplierId = String(req.body.supplierId ?? "");
    if (!supplierId) throw new HttpError(400, "Выберите поставщика — из Excel он не определяется");

    const sheet = typeof req.body.sheet === "string" && req.body.sheet ? req.body.sheet : undefined;
    const { rows, sheets, sheet: usedSheet } = parseSpecWorkbook(req.file.buffer, sheet);
    if (!rows.length) {
      throw new HttpError(
        422,
        `Не удалось распознать таблицу КП на листе «${usedSheet}». Листы в файле: ${sheets.join(", ")}`
      );
    }

    const offer = await prisma.offer.create({
      data: {
        projectId: req.params.projectId,
        supplierId,
        number: req.body.number || undefined,
        currency: req.body.currency || "UZS",
        items: {
          create: rows.map((r) => ({
            rawPos: r.pos,
            rawName: r.name,
            article: r.article,
            code: r.code,
            manufacturer: r.manufacturer,
            unit: r.unit ?? "шт",
            qty: r.qty ?? 0,
            price: r.price ?? 0,
          })),
        },
      },
    });
    res.status(201).json(await analyzeOffer(offer.id));
  })
);

/**
 * Импорт КП из PDF — фоновой задачей с прогрессом: текстовый слой — по сетке таблицы,
 * скан — через конвертер в режиме «КП». Тэги вытаскиваются из наименования,
 * поставщик и валюта — из документа, если не заданы.
 */
offersRouter.post(
  "/projects/:projectId/offers/import-pdf",
  upload.single("file"),
  ah(async (req, res) => {
    if (!req.file) throw new HttpError(400, "Файл не передан");
    const projectId = req.params.projectId;
    const { buffer, originalname } = req.file;
    const requestedSupplierId = typeof req.body.supplierId === "string" ? req.body.supplierId : "";
    const requestedNumber = typeof req.body.number === "string" ? req.body.number : "";
    const requestedCurrency = typeof req.body.currency === "string" ? req.body.currency : "";

    const job = createJob("Читаю PDF");
    runJob(job, async (report) => {
      let rows;
      let source: "text" | "converter";
      let detectedSupplier = "";
      let detectedCurrency = "";
      let detectedNumber = "";
      let warnings: string[] = [];
      let usage: unknown = undefined;

      const table = await parsePdfTable(buffer);
      if (table.rows.length) {
        rows = table.rows;
        source = "text";
      } else {
        const converted = await convertPdf(buffer, originalname, "kp", report);
        if (!converted.rows.length) throw new HttpError(422, "Конвертер не нашёл в документе таблицу КП");
        rows = converted.rows;
        source = "converter";
        detectedSupplier = converted.supplier;
        detectedCurrency = converted.currency;
        detectedNumber = converted.docNumber;
        warnings = converted.warnings;
        usage = converted.usage;
      }

      report({ stage: "Сохраняю КП и сопоставляю со спецификацией", done: 1, total: 1 });
      let supplierId = requestedSupplierId;
      if (!supplierId) {
        // распознавание стоит минут — результат не выбрасываем, поставщика можно переименовать потом
        let name = detectedSupplier;
        if (!name) {
          name = detectedNumber ? `Не распознан — ${detectedNumber}` : `Не распознан — ${originalname}`;
          warnings.push("Поставщик в документе не распознан — переименуйте его в списке поставщиков");
        }
        const existing = await prisma.supplier.findFirst({ where: { name } });
        supplierId = existing?.id ?? (await prisma.supplier.create({ data: { name } })).id;
      }

      const offer = await prisma.offer.create({
        data: {
          projectId,
          supplierId,
          number: requestedNumber || detectedNumber || undefined,
          currency: requestedCurrency || detectedCurrency || "UZS",
          items: {
            create: rows.map((r) => {
              // в текстовом PDF тэг может стоять отдельной колонкой, в скане — только внутри наименования
              const tags = r.tag ? expandTagList([r.tag]) : findTagsInText(r.name);
              return {
                rawPos: r.pos,
                rawName: r.name,
                article: r.article,
                code: r.code,
                datasheet: r.datasheet,
                section: r.section,
                tagsJson: tags.length ? JSON.stringify(tags) : undefined,
                manufacturer: r.manufacturer,
                unit: r.unit ?? "шт",
                qty: r.qty ?? 0,
                price: r.price ?? 0,
              };
            }),
          },
        },
      });
      const full = await analyzeOffer(offer.id);
      return { ...full, source, warnings, usage };
    });

    res.status(202).json({ jobId: job.id });
  })
);

offersRouter.get(
  "/offers/:id",
  ah(async (req, res) => {
    const offer = await offerFull(req.params.id);
    if (!offer) throw new HttpError(404, "КП не найдено");
    res.json(offer);
  })
);

offersRouter.post(
  "/offers/:id/analyze",
  ah(async (req, res) => {
    res.json(await analyzeOffer(req.params.id));
  })
);

/** Ручная правка вердикта инженером — последнее слово всегда за человеком. */
offersRouter.patch(
  "/offer-items/:id",
  ah(async (req, res) => {
    const data = z
      .object({
        verdict: z.enum(["PENDING", "OK", "ANALOG_OK", "ANALOG_RISK", "REJECT"]).optional(),
        engineerComment: z.string().optional(),
        specItemId: z.string().nullable().optional(),
      })
      .parse(req.body);
    res.json(await prisma.offerItem.update({ where: { id: req.params.id }, data }));
  })
);

offersRouter.patch(
  "/offers/:id",
  ah(async (req, res) => {
    const data = z
      .object({ status: z.enum(["DRAFT", "ANALYZED", "ACCEPTED", "REJECTED"]).optional() })
      .parse(req.body);
    res.json(await prisma.offer.update({ where: { id: req.params.id }, data }));
  })
);

offersRouter.delete(
  "/offers/:id",
  ah(async (req, res) => {
    await prisma.offer.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

/**
 * Сводная таблица «спецификация × все КП».
 * Позиции сводятся по коду продукции/маркировке: одна и та же железка в разных зданиях —
 * это одна закупочная позиция, и сравнивать КП нужно по суммарному объёму.
 */
offersRouter.get(
  "/projects/:projectId/comparison",
  ah(async (req, res) => {
    const projectId = req.params.projectId;
    const [spec, offers] = await Promise.all([
      prisma.specItem.findMany({ where: { projectId }, orderBy: [{ system: "asc" }, { pos: "asc" }] }),
      prisma.offer.findMany({
        where: { projectId },
        include: { supplier: true, items: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    type Group = {
      key: string;
      ids: Set<string>;
      pos: string | null;
      system: string;
      section: string | null;
      name: string;
      article: string | null;
      code: string | null;
      unit: string;
      qtyPlan: number;
      buildings: { building: string; qtyPlan: number }[];
    };

    const groups = new Map<string, Group>();
    for (const s of spec) {
      const key =
        normalizeArticle(s.code) || normalizeArticle(s.article) || normalizeKey(s.name) || s.id;
      let g = groups.get(key);
      if (!g) {
        g = {
          key,
          ids: new Set(),
          pos: s.pos,
          system: s.system,
          section: s.section,
          name: s.name,
          article: s.article,
          code: s.code,
          unit: s.unit,
          qtyPlan: 0,
          buildings: [],
        };
        groups.set(key, g);
      }
      g.ids.add(s.id);
      g.qtyPlan += s.qtyPlan;
      if (s.building) {
        const b = g.buildings.find((x) => x.building === s.building);
        if (b) b.qtyPlan += s.qtyPlan;
        else g.buildings.push({ building: s.building, qtyPlan: s.qtyPlan });
      }
    }

    const ACCEPTABLE = new Set(["OK", "ANALOG_OK"]);

    const rows = [...groups.values()].map((g) => {
      const cells: Record<string, unknown> = {};
      let bestOfferId: string | null = null;
      let bestUnitPrice = Infinity;

      for (const o of offers) {
        const matched = o.items.filter((i) => i.specItemId && g.ids.has(i.specItemId));
        if (!matched.length) {
          cells[o.id] = null;
          continue;
        }
        const qty = matched.reduce((sum, i) => sum + i.qty, 0);
        const total = matched.reduce((sum, i) => sum + i.qty * i.price, 0);
        const unitPrice = qty > 0 ? total / qty : 0;
        const worst = matched.some((i) => i.verdict === "REJECT")
          ? "REJECT"
          : matched.some((i) => i.verdict === "ANALOG_RISK")
            ? "ANALOG_RISK"
            : matched.some((i) => i.verdict === "PENDING")
              ? "PENDING"
              : matched.every((i) => i.verdict === "OK")
                ? "OK"
                : "ANALOG_OK";

        cells[o.id] = {
          offerItemIds: matched.map((i) => i.id),
          name: matched[0].rawName,
          article: matched[0].article,
          code: matched[0].code,
          manufacturer: matched[0].manufacturer,
          qty,
          unitPrice,
          total,
          verdict: worst,
          matchType: matched.some((i) => i.matchType === "ANALOG") ? "ANALOG" : "EXACT",
          coverage: g.qtyPlan > 0 ? qty / g.qtyPlan : null,
          analysis: matched[0].analysisJson ? JSON.parse(matched[0].analysisJson) : null,
        };

        if (ACCEPTABLE.has(worst) && unitPrice > 0 && unitPrice < bestUnitPrice) {
          bestUnitPrice = unitPrice;
          bestOfferId = o.id;
        }
      }

      return {
        specItem: {
          id: g.key,
          pos: g.pos,
          system: g.system,
          section: g.section,
          name: g.name,
          article: g.article,
          code: g.code,
          unit: g.unit,
          qtyPlan: g.qtyPlan,
        },
        buildings: g.buildings,
        cells,
        recommendedOfferId: bestOfferId,
      };
    });

    const offerSummaries = offers.map((o) => {
      const covered = rows.filter((r) => r.cells[o.id]).length;
      const risky = rows.filter((r) => {
        const c = r.cells[o.id] as { verdict?: string } | null;
        return c && (c.verdict === "ANALOG_RISK" || c.verdict === "REJECT" || c.verdict === "PENDING");
      }).length;
      const shortfall = rows.filter((r) => {
        const c = r.cells[o.id] as { coverage?: number | null } | null;
        return c && c.coverage !== null && c.coverage !== undefined && c.coverage < 0.999;
      }).length;
      return {
        id: o.id,
        supplier: o.supplier.name,
        number: o.number,
        currency: o.currency,
        deliveryDays: o.deliveryDays,
        status: o.status,
        covered,
        missing: rows.length - covered,
        risky,
        shortfall,
        total: o.items.reduce((s, i) => s + i.qty * i.price, 0),
        recommendedCount: rows.filter((r) => r.recommendedOfferId === o.id).length,
      };
    });

    res.json({ offers: offerSummaries, rows, specCount: rows.length, specRowCount: spec.length });
  })
);
