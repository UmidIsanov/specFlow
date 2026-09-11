import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { ah, HttpError } from "../lib/http.js";

export const projectsRouter = Router();

const projectSchema = z.object({
  name: z.string().min(1),
  code: z.string().optional(),
  customer: z.string().optional(),
  address: z.string().optional(),
});

projectsRouter.get(
  "/",
  ah(async (_req, res) => {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { specItems: true, offers: true, deliveries: true, acts: true } } },
    });
    res.json(projects);
  })
);

projectsRouter.post(
  "/",
  ah(async (req, res) => {
    const data = projectSchema.parse(req.body);
    res.status(201).json(await prisma.project.create({ data }));
  })
);

projectsRouter.get(
  "/:id",
  ah(async (req, res) => {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { specItems: true, offers: true, deliveries: true, acts: true, deviations: true } } },
    });
    if (!project) throw new HttpError(404, "Объект не найден");
    res.json(project);
  })
);

projectsRouter.delete(
  "/:id",
  ah(async (req, res) => {
    await prisma.project.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

export const suppliersRouter = Router();

suppliersRouter.get(
  "/",
  ah(async (_req, res) => {
    res.json(await prisma.supplier.findMany({ orderBy: { name: "asc" } }));
  })
);

suppliersRouter.post(
  "/",
  ah(async (req, res) => {
    const data = z
      .object({ name: z.string().min(1), inn: z.string().optional(), contact: z.string().optional() })
      .parse(req.body);
    res.status(201).json(await prisma.supplier.create({ data }));
  })
);
