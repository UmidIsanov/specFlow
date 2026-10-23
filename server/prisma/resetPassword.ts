/**
 * Сброс пароля: писем программа не шлёт, поэтому «забыли пароль» делается руками.
 *
 * Запуск:  USER_EMAIL=кто@почта.com npm run access:password --prefix server
 *          (NEW_PASSWORD=... — если хотите задать пароль сами, иначе придумает скрипт)
 *
 * Все входы этого человека на всех устройствах слетают: пароль меняют как раз
 * тогда, когда старый мог попасть к чужим.
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword, suggestPassword } from "../src/lib/password.js";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.USER_EMAIL ?? "").trim().toLowerCase();
  if (!email) throw new Error("Укажите USER_EMAIL — чью почту сбрасываем");

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const all = await prisma.user.findMany({ select: { email: true }, orderBy: { createdAt: "asc" } });
    throw new Error(`Нет такого пользователя. Есть: ${all.map((u) => u.email).join(", ") || "никого"}`);
  }

  let password = process.env.NEW_PASSWORD ?? "";
  const generated = !password;
  if (generated) password = suggestPassword();
  else if (password.length < 8) throw new Error("NEW_PASSWORD короче 8 символов");

  const [, sessions] = await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password) } }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
  ]);

  console.log(`Пароль для ${email} заменён${generated ? `: ${password}` : ""}`);
  if (generated) console.log("Запишите его — больше он нигде не появится.");
  if (sessions.count > 0) console.log(`Входов сброшено: ${sessions.count} — придётся войти заново.`);
  console.log("Передайте пароль человеку и попросите сменить его на странице «Вход и пароль».");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
