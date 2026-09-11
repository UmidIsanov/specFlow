import { prisma } from "../db.js";

export type PlanFactRow = {
  specItemId: string;
  pos: string | null;
  system: string;
  name: string;
  article: string | null;
  unit: string;
  qtyPlan: number;
  delivered: number;  // привезено на объект
  installed: number;  // смонтировано по подписанным актам
  inProgress: number; // в черновиках актов
  stock: number;      // остаток на складе объекта
  toOrder: number;    // ещё дозаказать
  remaining: number;  // осталось смонтировать
  progress: number;   // 0..1
};

export async function planFact(projectId: string): Promise<PlanFactRow[]> {
  const [items, deliveries, actItems] = await Promise.all([
    prisma.specItem.findMany({ where: { projectId }, orderBy: [{ system: "asc" }, { pos: "asc" }] }),
    prisma.deliveryItem.findMany({ where: { delivery: { projectId } }, select: { specItemId: true, qty: true } }),
    prisma.workActItem.findMany({
      where: { act: { projectId } },
      select: { specItemId: true, qty: true, act: { select: { status: true } } },
    }),
  ]);

  const sum = new Map<string, { delivered: number; installed: number; inProgress: number }>();
  const bucket = (id: string) => {
    let b = sum.get(id);
    if (!b) sum.set(id, (b = { delivered: 0, installed: 0, inProgress: 0 }));
    return b;
  };
  for (const d of deliveries) bucket(d.specItemId).delivered += d.qty;
  for (const a of actItems) {
    if (a.act.status === "SIGNED") bucket(a.specItemId).installed += a.qty;
    else bucket(a.specItemId).inProgress += a.qty;
  }

  return items.map((it) => {
    const b = sum.get(it.id) ?? { delivered: 0, installed: 0, inProgress: 0 };
    const round = (n: number) => Math.round(n * 1000) / 1000;
    return {
      specItemId: it.id,
      pos: it.pos,
      system: it.system,
      name: it.name,
      article: it.article,
      unit: it.unit,
      qtyPlan: it.qtyPlan,
      delivered: round(b.delivered),
      installed: round(b.installed),
      inProgress: round(b.inProgress),
      stock: round(b.delivered - b.installed),
      toOrder: round(Math.max(0, it.qtyPlan - b.delivered)),
      remaining: round(Math.max(0, it.qtyPlan - b.installed)),
      progress: it.qtyPlan > 0 ? Math.min(1, b.installed / it.qtyPlan) : 0,
    };
  });
}

export function planFactTotals(rows: PlanFactRow[]) {
  const totalPlan = rows.reduce((s, r) => s + r.qtyPlan, 0);
  const totalInstalled = rows.reduce((s, r) => s + r.installed, 0);
  return {
    positions: rows.length,
    positionsDone: rows.filter((r) => r.qtyPlan > 0 && r.installed >= r.qtyPlan).length,
    positionsNotOrdered: rows.filter((r) => r.toOrder > 0).length,
    progress: totalPlan > 0 ? totalInstalled / totalPlan : 0,
  };
}
