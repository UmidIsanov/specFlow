import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { ah, HttpError } from "../lib/http.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { createSession, currentUser, destroySession, requireAuth, SESSION_COOKIE, hashToken, readCookie } from "../lib/auth.js";

export const authRouter = Router();

const credentials = z.object({ email: z.string().email(), password: z.string().min(1) });

/**
 * Простой счётчик неудачных входов: адрес открыт всему интернету, а пароли у людей
 * на стройке короткие. Память, а не база — перезапуск сервера счётчик обнуляет, и это нормально.
 */
const ATTEMPTS = new Map<string, { count: number; until: number }>();
const MAX_ATTEMPTS = 10;
const LOCK_MS = 15 * 60 * 1000;

function checkAttempts(key: string) {
  const entry = ATTEMPTS.get(key);
  if (entry && entry.until > Date.now() && entry.count >= MAX_ATTEMPTS) {
    const minutes = Math.ceil((entry.until - Date.now()) / 60000);
    throw new HttpError(429, `Слишком много попыток. Повторите через ${minutes} мин.`);
  }
}

function noteFailure(key: string) {
  const entry = ATTEMPTS.get(key);
  if (!entry || entry.until < Date.now()) ATTEMPTS.set(key, { count: 1, until: Date.now() + LOCK_MS });
  else entry.count++;
}

const publicUser = (u: { id: string; email: string; name: string | null; role: string }) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
});

authRouter.post(
  "/login",
  ah(async (req, res) => {
    const { email, password } = credentials.parse(req.body);
    const key = `${req.ip ?? "?"}:${email.toLowerCase()}`;
    checkAttempts(key);

    const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    const ok = user ? await verifyPassword(password, user.passwordHash) : false;
    if (!user || !ok) {
      noteFailure(key);
      // Один и тот же ответ на чужую почту и на неверный пароль: иначе чужие адреса перебираются.
      throw new HttpError(401, "Неверная почта или пароль");
    }

    ATTEMPTS.delete(key);
    await createSession(user.id, req, res);
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    res.json(publicUser(user));
  })
);

authRouter.post(
  "/logout",
  ah(async (req, res) => {
    await destroySession(req, res);
    res.status(204).end();
  })
);

authRouter.get(
  "/me",
  ah(async (req, res) => {
    const user = await currentUser(req);
    res.json(user ? publicUser(user) : null);
  })
);

authRouter.post(
  "/password",
  requireAuth,
  ah(async (req, res) => {
    const schema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) });
    const { currentPassword, newPassword } = schema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new HttpError(400, "Текущий пароль не подходит");
    }

    const token = readCookie(req, SESSION_COOKIE);
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } }),
      // Остальные устройства разлогиниваем: пароль меняют как раз тогда, когда его увидел чужой.
      prisma.session.deleteMany({
        where: { userId: user.id, ...(token ? { NOT: { tokenHash: hashToken(token) } } : {}) },
      }),
    ]);
    res.status(204).end();
  })
);
