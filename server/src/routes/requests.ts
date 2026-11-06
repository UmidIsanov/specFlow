import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { ah, HttpError } from "../lib/http.js";

export const requestsRouter = Router();

const requestSchema = z.object({
  number: z.string().trim().max(60).optional(),
  revision: z.number().int().min(1).max(99).default(1),
  title: z.string().trim().max(200).optional(),
});

/** Пусто вместо «» — иначе заявка без номера хранилась бы двумя разными способами. */
const clean = (v: string | undefined) => (v && v.length ? v : null);

/** Заявки объекта: сначала по номеру, свежая ревизия сверху. */
requestsRouter.get(
  "/projects/:projectId/requests",
  ah(async (req, res) => {
    const rows = await prisma.request.findMany({
      where: { projectId: req.params.projectId },
      include: { _count: { select: { items: true } } },
      orderBy: [{ number: "asc" }, { revision: "desc" }],
    });
    res.json(rows);
  })
);

requestsRouter.post(
  "/projects/:projectId/requests",
  ah(async (req, res) => {
    const data = requestSchema.parse(req.body);
    const projectId = req.params.projectId;
    await assertFree(projectId, clean(data.number), data.revision);
    res.status(201).json(
      await prisma.request.create({
        data: {
          projectId,
          number: clean(data.number),
          revision: data.revision,
          title: clean(data.title),
        },
      })
    );
  })
);

/**
 * Следующая ревизия той же заявки: позиции прежней остаются на месте,
 * новая встаёт рядом — так видно, что менялось от ревизии к ревизии.
 */
requestsRouter.post(
  "/requests/:id/revision",
  ah(async (req, res) => {
    const base = await prisma.request.findUnique({ where: { id: req.params.id } });
    if (!base) throw new HttpError(404, "Заявка не найдена");

    const latest = await prisma.request.findFirst({
      where: { projectId: base.projectId, number: base.number },
      orderBy: { revision: "desc" },
      select: { revision: true },
    });

    res.status(201).json(
      await prisma.request.create({
        data: {
          projectId: base.projectId,
          number: base.number,
          revision: (latest?.revision ?? base.revision) + 1,
          title: base.title,
        },
      })
    );
  })
);

requestsRouter.patch(
  "/requests/:id",
  ah(async (req, res) => {
    const data = requestSchema.partial().parse(req.body);
    const current = await prisma.request.findUnique({ where: { id: req.params.id } });
    if (!current) throw new HttpError(404, "Заявка не найдена");

    const number = data.number === undefined ? current.number : clean(data.number);
    const revision = data.revision ?? current.revision;
    if (number !== current.number || revision !== current.revision) {
      await assertFree(current.projectId, number, revision, current.id);
    }

    res.json(
      await prisma.request.update({
        where: { id: current.id },
        data: {
          number,
          revision,
          title: data.title === undefined ? current.title : clean(data.title),
        },
      })
    );
  })
);

/**
 * Удаление заявки вместе с её позициями. Если по позициям уже есть поставки,
 * акты или склад — отказываем: иначе в них останутся ссылки в никуда.
 */
requestsRouter.delete(
  "/requests/:id",
  ah(async (req, res) => {
    const request = await prisma.request.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { items: true } } },
    });
    if (!request) throw new HttpError(404, "Заявка не найдена");

    const ids = (
      await prisma.specItem.findMany({ where: { requestId: request.id }, select: { id: true } })
    ).map((i) => i.id);

    if (ids.length) {
      const [deliveries, acts, moves] = await Promise.all([
        prisma.deliveryItem.count({ where: { specItemId: { in: ids } } }),
        prisma.workActItem.count({ where: { specItemId: { in: ids } } }),
        prisma.stockMove.count({ where: { specItemId: { in: ids } } }),
      ]);
      const blocking = [
        deliveries && `поставок: ${deliveries}`,
        acts && `актов: ${acts}`,
        moves && `движений склада: ${moves}`,
      ].filter(Boolean);
      if (blocking.length) {
        throw new HttpError(
          409,
          `По позициям этой заявки уже есть ${blocking.join(", ")}. Сначала уберите их, иначе поставки и акты останутся без позиций.`
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      if (ids.length) {
        await tx.offerItem.updateMany({ where: { specItemId: { in: ids } }, data: { specItemId: null } });
        await tx.deviation.deleteMany({ where: { specItemId: { in: ids } } });
        await tx.specItem.deleteMany({ where: { id: { in: ids } } });
      }
      await tx.request.delete({ where: { id: request.id } });
    });

    res.json({ deleted: request._count.items });
  })
);

/** Номер и ревизия вместе уникальны на объекте — иначе две «6450 рев. 2» не различить. */
async function assertFree(projectId: string, number: string | null, revision: number, exceptId?: string) {
  const clash = await prisma.request.findFirst({
    where: { projectId, number, revision, id: exceptId ? { not: exceptId } : undefined },
    select: { id: true },
  });
  if (clash) {
    throw new HttpError(
      409,
      number
        ? `Заявка № ${number} рев. ${revision} на этом объекте уже есть`
        : `Заявка без номера с ревизией ${revision} на этом объекте уже есть`
    );
  }
}
