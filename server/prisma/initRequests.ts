/**
 * Разложить старые позиции по заявкам.
 *
 * Запуск:  npm run requests:init --prefix server
 *
 * До этого шага позиции висели прямо на объекте. Теперь у каждой есть заявка,
 * а позиции, загруженные раньше, собираются в одну заявку без номера — её
 * потом можно переименовать в интерфейсе, когда вспомнится настоящий номер.
 *
 * Скрипт безопасен для повторного запуска: позиции с заявкой не трогает.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const orphans = await prisma.specItem.groupBy({
    by: ["projectId"],
    where: { requestId: null },
    _count: { _all: true },
  });

  if (!orphans.length) {
    console.log("Все позиции уже разложены по заявкам — делать нечего.");
    return;
  }

  for (const group of orphans) {
    const project = await prisma.project.findUnique({
      where: { id: group.projectId },
      select: { name: true },
    });

    // Заявка без номера на этот объект может уже существовать — тогда дополняем её.
    const request =
      (await prisma.request.findFirst({
        where: { projectId: group.projectId, number: null, revision: 1 },
      })) ??
      (await prisma.request.create({
        data: { projectId: group.projectId, title: "Загружено до разделения на заявки" },
      }));

    const { count } = await prisma.specItem.updateMany({
      where: { projectId: group.projectId, requestId: null },
      data: { requestId: request.id },
    });

    console.log(`· ${project?.name ?? group.projectId}: ${count} позиций → заявка без номера`);
  }

  const left = await prisma.specItem.count({ where: { requestId: null } });
  console.log(`\nГотово. Позиций без заявки осталось: ${left}.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
