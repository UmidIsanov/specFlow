import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { ah, HttpError } from "../lib/http.js";
import { planFact, planFactTotals } from "../lib/analytics.js";

export const supplyRouter = Router();

const lineSchema = z.object({ specItemId: z.string(), qty: z.number() });

/* ---------------------------------- Поставки --------------------------------- */

supplyRouter.get(
  "/projects/:projectId/deliveries",
  ah(async (req, res) => {
    res.json(
      await prisma.delivery.findMany({
        where: { projectId: req.params.projectId },
        include: { supplier: true, items: { include: { specItem: true } } },
        orderBy: { date: "desc" },
      })
    );
  })
);

supplyRouter.post(
  "/projects/:projectId/deliveries",
  ah(async (req, res) => {
    const body = z
      .object({
        supplierId: z.string().optional(),
        number: z.string().optional(),
        waybill: z.string().optional(),
        date: z.string().datetime().optional(),
        note: z.string().optional(),
        items: z.array(lineSchema).min(1),
      })
      .parse(req.body);
    const projectId = req.params.projectId;

    const delivery = await prisma.$transaction(async (tx) => {
      const d = await tx.delivery.create({
        data: {
          projectId,
          supplierId: body.supplierId,
          number: body.number,
          waybill: body.waybill,
          date: body.date ? new Date(body.date) : undefined,
          note: body.note,
          items: { create: body.items },
        },
        include: { items: true },
      });
      // приход сразу ложится на склад объекта
      await tx.stockMove.createMany({
        data: d.items.map((i) => ({
          projectId,
          specItemId: i.specItemId,
          qty: i.qty,
          type: "IN",
          refType: "DELIVERY",
          refId: d.id,
        })),
      });
      return d;
    });

    res.status(201).json(delivery);
  })
);

supplyRouter.delete(
  "/deliveries/:id",
  ah(async (req, res) => {
    await prisma.$transaction([
      prisma.stockMove.deleteMany({ where: { refType: "DELIVERY", refId: req.params.id } }),
      prisma.delivery.delete({ where: { id: req.params.id } }),
    ]);
    res.status(204).end();
  })
);

/* ----------------------------------- Склад ----------------------------------- */

supplyRouter.get(
  "/projects/:projectId/stock",
  ah(async (req, res) => {
    const rows = await planFact(req.params.projectId);
    res.json(
      rows.map((r) => ({
        specItemId: r.specItemId,
        system: r.system,
        name: r.name,
        article: r.article,
        unit: r.unit,
        in: r.delivered,
        out: r.installed,
        stock: r.stock,
        needed: r.remaining,
        deficit: Math.max(0, r.remaining - r.stock),
      }))
    );
  })
);

supplyRouter.get(
  "/projects/:projectId/stock-moves",
  ah(async (req, res) => {
    res.json(
      await prisma.stockMove.findMany({
        where: { projectId: req.params.projectId },
        include: { specItem: true },
        orderBy: { createdAt: "desc" },
        take: 300,
      })
    );
  })
);

/* ------------------------------ Акты установки (ИТД) ------------------------- */

supplyRouter.get(
  "/projects/:projectId/acts",
  ah(async (req, res) => {
    res.json(
      await prisma.workAct.findMany({
        where: { projectId: req.params.projectId },
        include: { items: { include: { specItem: true } } },
        orderBy: { date: "desc" },
      })
    );
  })
);

supplyRouter.get(
  "/acts/:id",
  ah(async (req, res) => {
    const act = await prisma.workAct.findUnique({
      where: { id: req.params.id },
      include: { items: { include: { specItem: true } }, project: true },
    });
    if (!act) throw new HttpError(404, "Акт не найден");
    res.json(act);
  })
);

supplyRouter.post(
  "/projects/:projectId/acts",
  ah(async (req, res) => {
    const body = z
      .object({
        number: z.string().optional(),
        date: z.string().datetime().optional(),
        location: z.string().optional(),
        system: z.string().default("ПС"),
        items: z.array(lineSchema).min(1),
      })
      .parse(req.body);

    const act = await prisma.workAct.create({
      data: {
        projectId: req.params.projectId,
        number: body.number,
        date: body.date ? new Date(body.date) : undefined,
        location: body.location,
        system: body.system,
        items: { create: body.items },
      },
      include: { items: { include: { specItem: true } } },
    });
    res.status(201).json(act);
  })
);

/** Подписание акта = факт монтажа + автоматическое списание ТМЦ со склада. */
supplyRouter.post(
  "/acts/:id/sign",
  ah(async (req, res) => {
    const act = await prisma.workAct.findUnique({
      where: { id: req.params.id },
      include: { items: { include: { specItem: true } } },
    });
    if (!act) throw new HttpError(404, "Акт не найден");
    if (act.status === "SIGNED") throw new HttpError(409, "Акт уже подписан");

    const stock = await planFact(act.projectId);
    const stockById = new Map(stock.map((s) => [s.specItemId, s.stock]));
    const shortages = act.items
      .map((i) => ({
        specItemId: i.specItemId,
        name: i.specItem.name,
        unit: i.specItem.unit,
        need: i.qty,
        available: stockById.get(i.specItemId) ?? 0,
      }))
      .filter((s) => s.need > s.available + 1e-6);

    // Списываем даже при нехватке: на стройке факт монтажа первичен,
    // а расхождение уходит инженеру как сигнал разобраться с приходом.
    const signed = await prisma.$transaction(async (tx) => {
      await tx.stockMove.createMany({
        data: act.items.map((i) => ({
          projectId: act.projectId,
          specItemId: i.specItemId,
          qty: -i.qty,
          type: "OUT",
          refType: "ACT",
          refId: act.id,
          comment: `Списание по акту ${act.number ?? act.id.slice(0, 6)}`,
        })),
      });
      return tx.workAct.update({
        where: { id: act.id },
        data: { status: "SIGNED", signedAt: new Date() },
        include: { items: { include: { specItem: true } } },
      });
    });

    res.json({ act: signed, shortages });
  })
);

supplyRouter.delete(
  "/acts/:id",
  ah(async (req, res) => {
    await prisma.$transaction([
      prisma.stockMove.deleteMany({ where: { refType: "ACT", refId: req.params.id } }),
      prisma.workAct.delete({ where: { id: req.params.id } }),
    ]);
    res.status(204).end();
  })
);

/* -------------------------- Отклонения от проекта (ИТД) ---------------------- */

supplyRouter.get(
  "/projects/:projectId/deviations",
  ah(async (req, res) => {
    res.json(
      await prisma.deviation.findMany({
        where: { projectId: req.params.projectId },
        include: { specItem: true },
        orderBy: { date: "desc" },
      })
    );
  })
);

supplyRouter.post(
  "/projects/:projectId/deviations",
  ah(async (req, res) => {
    const body = z
      .object({
        specItemId: z.string().optional(),
        kind: z.enum(["REPLACE", "QTY_CHANGE", "EXCLUDE", "ADD"]),
        description: z.string().min(1),
        approvedBy: z.string().optional(),
      })
      .parse(req.body);
    res.status(201).json(await prisma.deviation.create({ data: { ...body, projectId: req.params.projectId } }));
  })
);

/* ------------------------------- План / факт --------------------------------- */

supplyRouter.get(
  "/projects/:projectId/plan-fact",
  ah(async (req, res) => {
    const rows = await planFact(req.params.projectId);
    res.json({ rows, totals: planFactTotals(rows) });
  })
);
