import { Router } from "express";
import * as XLSX from "xlsx";
import { prisma } from "../db.js";
import { ah, HttpError } from "../lib/http.js";
import { tagKey } from "../lib/tags.js";

export const auditRouter = Router();

/** Ключ опросного листа: объект + тип + номер. «MOF-UN-403300-INS-DAT-9041» = «MOF3-UN-403300-INS-DAT-9041». */
export function datasheetKey(raw?: string | null): string {
  if (!raw) return "";
  const m = raw.toUpperCase().match(/(\d{6})\D+(DAT|FGS|OL|ОЛ)\D*(\d{3,4})/);
  return m ? `${m[1]}|${m[2]}|${m[3]}` : raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

type LineVerdict = "MATCH" | "PARTIAL" | "OUTSIDE" | "NO_TAGS";

const VERDICT_LABEL: Record<LineVerdict, string> = {
  MATCH: "По заявке",
  PARTIAL: "Частично вне заявки",
  OUTSIDE: "Вне заявки",
  NO_TAGS: "Тэги не указаны",
};

/**
 * Сверка коммерческого предложения с заявкой по теговым номерам.
 * В заявке одна строка — один тэг, в КП строка укрупнённая и перечисляет тэги списком
 * или диапазоном, поэтому сравнивать наименования бесполезно: сверяем тэги и опросные листы.
 */
auditRouter.get(
  "/projects/:projectId/tag-audit",
  ah(async (req, res) => {
    const projectId = req.params.projectId;
    const offerId = typeof req.query.offerId === "string" ? req.query.offerId : undefined;

    const offer = await prisma.offer.findFirst({
      where: offerId ? { id: offerId, projectId } : { projectId },
      include: { supplier: true, items: { orderBy: { rawPos: "asc" } } },
      orderBy: { createdAt: "desc" },
    });
    if (!offer) throw new HttpError(404, "КП не найдено");

    const spec = await prisma.specItem.findMany({ where: { projectId } });

    // в заявке тэг уникален и задаёт позицию
    const byTag = new Map<string, (typeof spec)[number]>();
    for (const s of spec) {
      const key = tagKey(s.tag);
      if (key && !byTag.has(key)) byTag.set(key, s);
    }
    const untagged = spec.filter((s) => !tagKey(s.tag));

    const offeredCount = new Map<string, number>();
    const offeredBy = new Map<string, string[]>();

    const lines = offer.items.map((item) => {
      const tags: string[] = item.tagsJson ? JSON.parse(item.tagsJson) : [];
      const matched: { tag: string; specItemId: string; name: string; datasheetOk: boolean }[] = [];
      const outside: string[] = [];
      const lineDs = datasheetKey(item.datasheet);

      for (const tag of tags) {
        const key = tagKey(tag);
        offeredCount.set(key, (offeredCount.get(key) ?? 0) + 1);
        offeredBy.set(key, [...(offeredBy.get(key) ?? []), item.rawPos ?? item.id.slice(0, 5)]);

        const hit = byTag.get(key);
        if (!hit) {
          outside.push(tag);
          continue;
        }
        const specDs = datasheetKey(hit.datasheet);
        matched.push({
          tag,
          specItemId: hit.id,
          name: hit.name,
          datasheetOk: !lineDs || !specDs || lineDs === specDs,
        });
      }

      const verdict: LineVerdict = !tags.length
        ? "NO_TAGS"
        : matched.length === 0
          ? "OUTSIDE"
          : outside.length === 0
            ? "MATCH"
            : "PARTIAL";

      return {
        id: item.id,
        pos: item.rawPos,
        name: item.rawName,
        datasheet: item.datasheet,
        qty: item.qty,
        price: item.price,
        total: item.qty * item.price,
        tagsListed: tags.length,
        matchedCount: matched.length,
        outsideCount: outside.length,
        datasheetMismatch: matched.filter((m) => !m.datasheetOk).length,
        qtyVsTags: tags.length ? item.qty - tags.length : null,
        verdict,
        outside: outside.slice(0, 40),
        matchedSample: matched.slice(0, 3).map((m) => m.tag),
      };
    });

    const notOffered = [...byTag.entries()]
      .filter(([key]) => !offeredCount.has(key))
      .map(([, s]) => ({
        specItemId: s.id,
        pos: s.pos,
        tag: s.tag,
        name: s.name,
        qty: s.qtyPlan,
        unit: s.unit,
        datasheet: s.datasheet,
      }));

    const duplicated = [...offeredCount.entries()]
      .filter(([, n]) => n > 1)
      .map(([key, n]) => ({ tag: key, times: n, lines: offeredBy.get(key) ?? [] }));

    const offeredInRequest = [...offeredCount.keys()].filter((k) => byTag.has(k)).length;

    res.json({
      offer: {
        id: offer.id,
        supplier: offer.supplier.name,
        number: offer.number,
        currency: offer.currency,
        deliveryDays: offer.deliveryDays,
        lines: offer.items.length,
        qtyTotal: offer.items.reduce((s, i) => s + i.qty, 0),
        sum: offer.items.reduce((s, i) => s + i.qty * i.price, 0),
      },
      request: {
        positions: spec.length,
        tagged: byTag.size,
        untagged: untagged.length,
        qtyTotal: spec.reduce((s, i) => s + i.qtyPlan, 0),
      },
      summary: {
        tagsOffered: [...offeredCount.keys()].length,
        coveredFromRequest: offeredInRequest,
        notOffered: notOffered.length,
        outsideRequest: lines.reduce((s, l) => s + l.outsideCount, 0),
        linesWithoutTags: lines.filter((l) => l.verdict === "NO_TAGS").length,
        linesOutside: lines.filter((l) => l.verdict === "OUTSIDE").length,
        linesPartial: lines.filter((l) => l.verdict === "PARTIAL").length,
        qtyMismatchLines: lines.filter((l) => l.qtyVsTags !== null && l.qtyVsTags !== 0).length,
        datasheetMismatchLines: lines.filter((l) => l.datasheetMismatch > 0).length,
        duplicatedTags: duplicated.length,
      },
      lines,
      notOffered,
      duplicated,
    });
  })
);

/** Выгрузка сверки в Excel — в таком виде заключение уходит в отдел закупок. */
auditRouter.get(
  "/projects/:projectId/export/tag-audit.xlsx",
  ah(async (req, res) => {
    const base = `${req.protocol}://${req.get("host")}`;
    const url = new URL(`${base}/api/projects/${req.params.projectId}/tag-audit`);
    if (typeof req.query.offerId === "string") url.searchParams.set("offerId", req.query.offerId);
    const audit = (await (await fetch(url)).json()) as {
      error?: string;
      offer: { supplier: string; number: string | null; currency: string };
      lines: {
        pos: string | null;
        name: string;
        datasheet: string | null;
        qty: number;
        price: number;
        total: number;
        tagsListed: number;
        matchedCount: number;
        outsideCount: number;
        datasheetMismatch: number;
        qtyVsTags: number | null;
        verdict: LineVerdict;
        outside: string[];
      }[];
      notOffered: { pos: string | null; tag: string | null; name: string; qty: number; unit: string; datasheet: string | null }[];
      duplicated: { tag: string; times: number; lines: string[] }[];
    };
    if (audit.error) throw new HttpError(404, audit.error);

    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        audit.lines.map((l) => ({
          "№ КП": l.pos ?? "",
          Наименование: l.name,
          "Опросный лист": l.datasheet ?? "",
          "Кол-во": l.qty,
          "Тэгов указано": l.tagsListed,
          "Из них в заявке": l.matchedCount,
          "Вне заявки": l.outsideCount,
          Цена: l.price,
          Сумма: l.total,
          Заключение: VERDICT_LABEL[l.verdict],
          Замечания: [
            l.qtyVsTags ? `кол-во ${l.qty} против ${l.tagsListed} тэгов` : "",
            l.datasheetMismatch ? `опросный лист не совпал: ${l.datasheetMismatch}` : "",
          ]
            .filter(Boolean)
            .join("; "),
          "Тэги вне заявки": l.outside.join(", "),
        }))
      ),
      "Строки КП"
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        audit.notOffered.map((n) => ({
          "Поз. заявки": n.pos ?? "",
          Тэг: n.tag ?? "",
          Наименование: n.name,
          "Опросный лист": n.datasheet ?? "",
          "Кол-во": n.qty,
          "Ед.": n.unit,
        }))
      ),
      "Не предложено по заявке"
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        audit.duplicated.map((d) => ({ Тэг: d.tag, "Раз в КП": d.times, "Строки КП": d.lines.join(", ") }))
      ),
      "Дубли тэгов"
    );

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="tag-audit.xlsx"');
    res.send(buf);
  })
);
