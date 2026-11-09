import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../db.js";
import { ah, HttpError, originalName } from "../lib/http.js";
import { parseInspectionRegistry, scopeKey, scopeState } from "../lib/inspection.js";
import { ITD_STATE, type ItdState } from "../lib/enums.js";

export const itdRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

/**
 * ИТД объекта: участки «объект + система + вид работы» и сводка по системам.
 * Ни заявки, ни КП тут нет — это отдельный контур, он отвечает на вопрос
 * «что сдано заказчику», а не «что закуплено».
 */
itdRouter.get(
  "/projects/:projectId/itd",
  ah(async (req, res) => {
    const projectId = req.params.projectId;
    const scopes = await prisma.itdScope.findMany({
      where: { projectId },
      include: {
        records: {
          orderBy: [{ inspectedAt: "desc" }],
          select: {
            id: true,
            rowNo: true,
            fcn: true,
            statusText: true,
            state: true,
            inspectionNo: true,
            inspectedAt: true,
            inspectedText: true,
            smrDoneAt: true,
            rawKind: true,
          },
        },
      },
      orderBy: [{ system: "asc" }, { building: "asc" }, { workKind: "asc" }],
    });

    const last = await prisma.itdRecord.findFirst({
      where: { projectId },
      orderBy: { importedAt: "desc" },
      select: { sourceFile: true, importedAt: true },
    });

    res.json({
      scopes,
      systems: summarize(scopes),
      total: summarizeAll(scopes),
      registry: last ? { sourceFile: last.sourceFile, importedAt: last.importedAt, rows: await prisma.itdRecord.count({ where: { projectId } }) } : null,
    });
  })
);

/**
 * Загрузка реестра инспекций. Реестр клиент обновляет целиком раз в неделю,
 * поэтому строки объекта заменяются: иначе прошлые статусы остались бы рядом
 * с новыми и сводка считалась бы дважды. Отметки ПТО о сданных пакетах живут
 * на участке и не стираются.
 */
itdRouter.post(
  "/projects/:projectId/itd/import",
  upload.single("file"),
  ah(async (req, res) => {
    if (!req.file) throw new HttpError(400, "Файл не передан");
    const sheet = typeof req.body.sheet === "string" && req.body.sheet ? req.body.sheet : undefined;

    // Разбор спотыкается о чужой файл, а не о поломку программы: 422, а не 500.
    let parsed;
    try {
      parsed = parseInspectionRegistry(req.file.buffer, sheet);
    } catch (err) {
      throw new HttpError(422, err instanceof Error ? err.message : "Не удалось прочитать файл");
    }
    if (!parsed.rows.length) {
      throw new HttpError(
        422,
        `На листе «${parsed.sheet}» не нашлось ни одной строки инспекции. Листы в файле: ${parsed.sheets.join(", ")}`
      );
    }

    const projectId = req.params.projectId;
    const sourceFile = originalName(req.file);
    const importedAt = new Date();

    // Строки собираем в участки заранее: так обращений к базе столько же,
    // сколько участков, а не сколько строк реестра.
    const groups = new Map<string, typeof parsed.rows>();
    for (const row of parsed.rows) {
      const key = scopeKey(row);
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }

    await prisma.$transaction(async (tx) => {
      await tx.itdRecord.deleteMany({ where: { projectId } });

      for (const rows of groups.values()) {
        const head = rows[0];
        const state = scopeState(rows.map((r) => r.state as ItdState));
        const acceptedAt = rows
          .filter((r) => r.state === ITD_STATE.ACCEPTED && r.inspectedAt)
          .map((r) => r.inspectedAt as Date)
          .sort((a, b) => b.getTime() - a.getTime())[0];

        const scope = await tx.itdScope.upsert({
          where: {
            projectId_building_system_workKind: {
              projectId,
              building: head.building,
              system: head.system,
              workKind: head.workKind,
            },
          },
          create: {
            projectId,
            building: head.building,
            system: head.system,
            workKind: head.workKind,
            workPack: head.workPack,
            state,
            acceptedAt,
          },
          // dossierDone и заметку ПТО не трогаем — их ставил человек, а не файл.
          update: { workPack: head.workPack, state, acceptedAt: acceptedAt ?? null },
          select: { id: true },
        });

        await tx.itdRecord.createMany({
          data: rows.map((r) => ({
            projectId,
            scopeId: scope.id,
            rowNo: r.rowNo,
            fcn: r.fcn,
            statusText: r.statusText,
            state: r.state,
            inspectionNo: r.inspectionNo,
            inspectedAt: r.inspectedAt,
            inspectedText: r.inspectedText,
            smrDoneAt: r.smrDoneAt,
            rawKind: r.rawKind,
            sourceFile,
            importedAt,
          })),
        });
      }

      // Участок, которого в новом реестре нет, уходит вместе со своими строками,
      // но только если ПТО не отметил по нему сданный пакет.
      await tx.itdScope.deleteMany({
        where: { projectId, dossierDone: false, records: { none: {} } },
      });
    });

    const scopes = await prisma.itdScope.findMany({
      where: { projectId },
      select: { system: true, state: true, dossierDone: true },
    });

    res.status(201).json({
      rows: parsed.rows.length,
      scopes: groups.size,
      skipped: parsed.skipped,
      sheet: parsed.sheet,
      sheets: parsed.sheets,
      columns: Object.keys(parsed.columns),
      systems: summarize(scopes),
      preview: parsed.rows.slice(0, 5),
    });
  })
);

/**
 * Пакет документов по участку: это второе, отдельное состояние. «Физику»
 * заказчик принимает, чтобы стройка не стояла, а участок считается сданным
 * только после остальных 5–6 документов — входной контроль, сертификаты,
 * трасса по проекту. В реестре инспекций этого нет, ставит ПТО.
 */
itdRouter.patch(
  "/itd-scopes/:id",
  ah(async (req, res) => {
    const data = z
      .object({
        dossierDone: z.boolean().optional(),
        dossierNote: z.string().trim().max(300).optional(),
      })
      .parse(req.body);

    const scope = await prisma.itdScope.findUnique({ where: { id: req.params.id } });
    if (!scope) throw new HttpError(404, "Участок не найден");

    const done = data.dossierDone ?? scope.dossierDone;
    res.json(
      await prisma.itdScope.update({
        where: { id: scope.id },
        data: {
          dossierDone: done,
          dossierAt: done ? (scope.dossierDone ? scope.dossierAt : new Date()) : null,
          dossierNote:
            data.dossierNote === undefined ? scope.dossierNote : data.dossierNote || null,
        },
      })
    );
  })
);

/** Сброс ИТД объекта: уходит и реестр, и отметки ПТО. */
itdRouter.delete(
  "/projects/:projectId/itd",
  ah(async (req, res) => {
    const projectId = req.params.projectId;
    const { count } = await prisma.itdScope.deleteMany({ where: { projectId } });
    await prisma.itdRecord.deleteMany({ where: { projectId } });
    res.json({ deleted: count });
  })
);

type Counted = { system: string; state: string; dossierDone: boolean };

export type ItdSummary = {
  system: string;
  scopes: number;
  accepted: number;
  partial: number;
  remarks: number;
  requested: number;
  dossierDone: number;
};

/** Сводка по системам: «Актов всего» одним числом инженеру ничего не говорит. */
function summarize(scopes: Counted[]): ItdSummary[] {
  const map = new Map<string, ItdSummary>();
  for (const s of scopes) {
    const row =
      map.get(s.system) ??
      { system: s.system, scopes: 0, accepted: 0, partial: 0, remarks: 0, requested: 0, dossierDone: 0 };
    row.scopes++;
    if (s.state === ITD_STATE.ACCEPTED) row.accepted++;
    else if (s.state === ITD_STATE.PARTIAL) row.partial++;
    else if (s.state === ITD_STATE.REMARKS) row.remarks++;
    else row.requested++;
    if (s.dossierDone) row.dossierDone++;
    map.set(s.system, row);
  }
  return [...map.values()].sort((a, b) => b.scopes - a.scopes || a.system.localeCompare(b.system));
}

function summarizeAll(scopes: Counted[]): ItdSummary {
  const all = summarize(scopes);
  return all.reduce(
    (acc, row) => ({
      system: "Всего",
      scopes: acc.scopes + row.scopes,
      accepted: acc.accepted + row.accepted,
      partial: acc.partial + row.partial,
      remarks: acc.remarks + row.remarks,
      requested: acc.requested + row.requested,
      dossierDone: acc.dossierDone + row.dossierDone,
    }),
    { system: "Всего", scopes: 0, accepted: 0, partial: 0, remarks: 0, requested: 0, dossierDone: 0 }
  );
}
