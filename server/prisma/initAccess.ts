/**
 * Первый пользователь и владельцы объектов.
 *
 * Запуск:  ADMIN_EMAIL=you@mail.com ADMIN_PASSWORD=... npm run access:init --prefix server
 *
 * Скрипт безопасен для повторного запуска: существующему пользователю пароль не меняет,
 * объекты с владельцем не трогает.
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword, suggestPassword } from "../src/lib/password.js";
import { MEMBER_ROLE, USER_ROLE } from "../src/lib/enums.js";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  if (!email) {
    throw new Error("Укажите ADMIN_EMAIL — почту первого пользователя");
  }

  let password = process.env.ADMIN_PASSWORD ?? "";
  let generated = false;
  if (!password) {
    password = suggestPassword();
    generated = true;
  } else if (password.length < 8) {
    throw new Error("ADMIN_PASSWORD короче 8 символов");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  const user = existing
    ? existing
    : await prisma.user.create({
        data: {
          email,
          name: process.env.ADMIN_NAME?.trim() || null,
          passwordHash: await hashPassword(password),
          role: USER_ROLE.ADMIN,
          emailVerifiedAt: new Date(),
        },
      });

  if (existing) {
    console.log(`Пользователь ${email} уже есть — пароль оставлен прежним.`);
    if (existing.role !== USER_ROLE.ADMIN) {
      await prisma.user.update({ where: { id: existing.id }, data: { role: USER_ROLE.ADMIN } });
      console.log("Роль повышена до ADMIN.");
    }
  } else {
    console.log(`Создан пользователь ${email}${generated ? `, пароль: ${password}` : ""}`);
    if (generated) console.log("Запишите пароль — больше он нигде не появится.");
  }

  const orphans = await prisma.project.findMany({ where: { ownerId: null }, select: { id: true, name: true } });
  if (orphans.length > 0) {
    await prisma.project.updateMany({ where: { ownerId: null }, data: { ownerId: user.id } });
    console.log(`Объектов без владельца было ${orphans.length}, теперь они за ${email}:`);
    for (const p of orphans) console.log(`  · ${p.name}`);
  }

  // Владелец должен быть и в участниках — проверки доступа смотрят именно туда.
  const all = await prisma.project.findMany({ select: { id: true, ownerId: true } });
  let added = 0;
  for (const project of all) {
    if (!project.ownerId) continue;
    const member = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: project.id, userId: project.ownerId } },
    });
    if (member) continue;
    await prisma.projectMember.create({
      data: { projectId: project.id, userId: project.ownerId, role: MEMBER_ROLE.OWNER },
    });
    added++;
  }
  if (added > 0) console.log(`Добавлено записей об участии: ${added}`);

  const left = await prisma.project.count({ where: { ownerId: null } });
  console.log(`\nГотово. Объектов всего: ${all.length}, без владельца: ${left}.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
