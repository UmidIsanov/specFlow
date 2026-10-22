import type { CookieOptions, Request, RequestHandler, Response } from "express";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../db.js";
import { HttpError } from "./http.js";
import { MEMBER_ROLE, USER_ROLE } from "./enums.js";

export const SESSION_COOKIE = "poz_session";
const SESSION_DAYS = 30;
/** Отметку «был в сети» двигаем не чаще раза в час, чтобы не писать в базу на каждый запрос. */
const TOUCH_AFTER_MS = 60 * 60 * 1000;

export type SessionUser = { id: string; email: string; name: string | null; role: string };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
      /** Права на объекте, который трогает запрос — ставит requireProject. */
      access?: { projectId: string; role: string };
    }
  }
}

/** В cookie уходит сам токен, в базе лежит только его хэш: база утечёт — войти по ней нельзя. */
export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

export function cookieOptions(expiresAt: Date): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    // На сервере домен под https; в разработке cookie должна ходить и по http.
    secure: process.env.COOKIE_SECURE === "1",
    path: "/",
    expires: expiresAt,
  };
}

export async function createSession(userId: string, req: Request, res: Response): Promise<Date> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      userAgent: req.get("user-agent")?.slice(0, 200) ?? null,
      ip: req.ip ?? null,
    },
  });
  res.cookie(SESSION_COOKIE, token, cookieOptions(expiresAt));
  return expiresAt;
}

export async function destroySession(req: Request, res: Response): Promise<void> {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  res.clearCookie(SESSION_COOKIE, { ...cookieOptions(new Date(0)), expires: undefined });
}

/** Кто пришёл. Просроченные сессии удаляем на месте, чтобы таблица не росла. */
export async function currentUser(req: Request): Promise<SessionUser | null> {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, email: true, name: true, role: true } } },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  if (Date.now() - session.lastSeenAt.getTime() > TOUCH_AFTER_MS) {
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  return session.user;
}

export const requireAuth: RequestHandler = (req, res, next) => {
  currentUser(req)
    .then((user) => {
      if (!user) throw new HttpError(401, "Нужно войти");
      req.user = user;
      next();
    })
    .catch(next);
};

/**
 * Доступ к объекту: смотрим в участников, а не во владельца — владелец тоже числится
 * участником (см. prisma/initAccess.ts). ADMIN видит всё: это тот, кто ведёт программу.
 */
export async function projectRole(user: SessionUser, projectId: string): Promise<string | null> {
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: user.id } },
    select: { role: true },
  });
  if (member) return member.role;
  if (user.role !== USER_ROLE.ADMIN) return null;
  const exists = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  return exists ? MEMBER_ROLE.OWNER : null;
}

/**
 * Пускает к объекту, чей id лежит в параметре пути. Наблюдателю оставляем только чтение:
 * иначе «только смотрит» означало бы «смотрит и всё удаляет».
 */
export const requireProject =
  (param = "projectId"): RequestHandler =>
  (req, _res, next) => {
    const projectId = req.params[param];
    if (!projectId) return next(new HttpError(400, "Не указан объект"));
    if (!req.user) return next(new HttpError(401, "Нужно войти"));
    projectRole(req.user, projectId)
      .then((role) => {
        // Чужой объект и несуществующий отвечают одинаково: по ответу нельзя перебрать чужие id.
        if (!role) throw new HttpError(404, "Объект не найден");
        if (role === MEMBER_ROLE.VIEWER && req.method !== "GET") {
          throw new HttpError(403, "У вас доступ только на просмотр");
        }
        req.access = { projectId, role };
        next();
      })
      .catch(next);
  };

/** Только владелец объекта (и ADMIN): приглашения, удаление объекта. */
export const requireOwner: RequestHandler = (req, _res, next) => {
  if (req.access?.role === MEMBER_ROLE.OWNER) return next();
  next(new HttpError(403, "Только владелец объекта может это делать"));
};

type Owned = { projectId: string } | null;

/**
 * Для путей вроде /offers/:id — объект берём из самой записи. Запись чужого объекта
 * отвечает «не найдено», как будто её нет.
 */
export const requireProjectOf =
  (find: (id: string) => Promise<Owned>, param = "id"): RequestHandler =>
  (req, _res, next) => {
    const id = req.params[param];
    if (!id) return next(new HttpError(400, "Не указана запись"));
    if (!req.user) return next(new HttpError(401, "Нужно войти"));
    find(id)
      .then(async (row) => {
        if (!row) throw new HttpError(404, "Запись не найдена");
        const role = await projectRole(req.user!, row.projectId);
        if (!role) throw new HttpError(404, "Запись не найдена");
        if (role === MEMBER_ROLE.VIEWER && req.method !== "GET") {
          throw new HttpError(403, "У вас доступ только на просмотр");
        }
        req.access = { projectId: row.projectId, role };
        next();
      })
      .catch(next);
  };

/** Поиск объекта по дочерней записи — по одной строке на сущность. */
export const ownerOf = {
  offer: (id: string) => prisma.offer.findUnique({ where: { id }, select: { projectId: true } }),
  specItem: (id: string) => prisma.specItem.findUnique({ where: { id }, select: { projectId: true } }),
  act: (id: string) => prisma.workAct.findUnique({ where: { id }, select: { projectId: true } }),
  delivery: (id: string) => prisma.delivery.findUnique({ where: { id }, select: { projectId: true } }),
  offerItem: (id: string) =>
    prisma.offerItem
      .findUnique({ where: { id }, select: { offer: { select: { projectId: true } } } })
      .then((row) => (row ? { projectId: row.offer.projectId } : null)),
};
