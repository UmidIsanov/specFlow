import { Router } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "../db.js";
import { ah, HttpError } from "../lib/http.js";
import { hashToken, requireOwner } from "../lib/auth.js";
import { MEMBER_ROLE } from "../lib/enums.js";

export const membersRouter = Router();

const INVITE_DAYS = 7;
const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum([MEMBER_ROLE.ENGINEER, MEMBER_ROLE.VIEWER]).default(MEMBER_ROLE.ENGINEER),
});

/** Ссылка, которую владелец пересылает человеку сам — почты у программы пока нет. */
const inviteLink = (token: string) => `${process.env.APP_URL ?? ""}/register?invite=${token}`;

membersRouter.get(
  "/projects/:projectId/members",
  ah(async (req, res) => {
    const { projectId } = req.params;
    const [members, invites] = await Promise.all([
      prisma.projectMember.findMany({
        where: { projectId },
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, email: true, name: true, lastLoginAt: true } } },
      }),
      prisma.invite.findMany({
        where: { projectId, acceptedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
        select: { id: true, email: true, role: true, expiresAt: true },
      }),
    ]);

    res.json({
      members: members.map((m) => ({
        userId: m.user.id,
        email: m.user.email,
        name: m.user.name,
        role: m.role,
        lastLoginAt: m.user.lastLoginAt,
        isYou: m.user.id === req.user!.id,
      })),
      invites,
      canInvite: req.access?.role === MEMBER_ROLE.OWNER,
    });
  })
);

membersRouter.post(
  "/projects/:projectId/invites",
  requireOwner,
  ah(async (req, res) => {
    const { projectId } = req.params;
    const { email, role } = inviteSchema.parse(req.body);
    const address = email.trim().toLowerCase();

    const already = await prisma.user.findUnique({ where: { email: address }, select: { id: true } });
    if (already) {
      const member = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: already.id } },
      });
      if (member) throw new HttpError(400, "Этот человек уже на объекте");
    }

    const token = randomBytes(32).toString("base64url");
    // Старое приглашение на ту же почту заменяем: иначе по объекту копятся мёртвые ссылки.
    await prisma.invite.deleteMany({ where: { projectId, email: address, acceptedAt: null } });
    const invite = await prisma.invite.create({
      data: {
        email: address,
        projectId,
        role,
        tokenHash: hashToken(token),
        invitedById: req.user!.id,
        expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000),
      },
      select: { id: true, email: true, role: true, expiresAt: true },
    });

    res.status(201).json({ ...invite, link: inviteLink(token), knownUser: Boolean(already) });
  })
);

membersRouter.delete(
  "/projects/:projectId/invites/:inviteId",
  requireOwner,
  ah(async (req, res) => {
    await prisma.invite.deleteMany({ where: { id: req.params.inviteId, projectId: req.params.projectId } });
    res.status(204).end();
  })
);

membersRouter.delete(
  "/projects/:projectId/members/:userId",
  requireOwner,
  ah(async (req, res) => {
    const { projectId, userId } = req.params;
    const member = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } });
    if (!member) throw new HttpError(404, "Человек не найден на объекте");
    if (member.role === MEMBER_ROLE.OWNER) throw new HttpError(400, "Владельца объекта убрать нельзя");
    await prisma.projectMember.delete({ where: { id: member.id } });
    res.status(204).end();
  })
);
