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

// Каналы модулей ввода-вывода по артикулу: DI5016F → 16 DI, AI5008F-H → 8 AI (SUPCON G5Pro).
const IO_MODULE = /^(DI|DO|AI|AO)50(\d{2})/i;

type SpecRow = { tag: string | null; name: string; qtyPlan: number };
type OfferRow = { section: string | null; article: string | null; rawName: string; qty: number; price: number };

/**
 * Сверка по составу — для КП на системы (ПЛК, шкафы), где строки не привязаны к тэгам.
 * Слева то, чего просит заявка: системные позиции и полевые приборы по объектам.
 * Справа то, что предлагает КП: системы с суммой каналов I/O.
 */
function buildScope(spec: SpecRow[], items: OfferRow[]) {
  // системные позиции заявки: тэг с типом в скобках — 402100-F&G (PLC), 403300-F&G (HMI)
  const systemPositions = spec
    .filter((s) => /\((PLC|HMI|CPU|SCADA|RIO)\)/i.test(s.tag ?? ""))
    .map((s) => ({ tag: s.tag, name: s.name, qty: s.qtyPlan }));

  const byObject = new Map<string, Map<string, number>>();
  for (const s of spec) {
    const m = (s.tag ?? "").toUpperCase().match(/^(\d{4,6})-?([A-Z&]+)/);
    if (!m) continue;
    let fam = byObject.get(m[1]);
    if (!fam) byObject.set(m[1], (fam = new Map()));
    fam.set(m[2], (fam.get(m[2]) ?? 0) + 1);
  }
  const requestObjects = [...byObject.entries()]
    .map(([object, fam]) => ({
      object,
      tags: [...fam.values()].reduce((a, b) => a + b, 0),
      families: [...fam.entries()].sort((a, b) => b[1] - a[1]).map(([family, count]) => ({ family, count })),
    }))
    .sort((a, b) => a.object.localeCompare(b.object));

  // системы КП: раздел до « · » — «Система 1 · Hardware» → «Система 1»
  const systems = new Map<string, { lines: number; qty: number; sum: number; di: number; do: number; ai: number; ao: number; controllers: number }>();
  for (const i of items) {
    const key = (i.section ?? "Без раздела").split(" · ")[0];
    let sys = systems.get(key);
    if (!sys) systems.set(key, (sys = { lines: 0, qty: 0, sum: 0, di: 0, do: 0, ai: 0, ao: 0, controllers: 0 }));
    sys.lines++;
    sys.qty += i.qty;
    sys.sum += i.qty * i.price;
    const m = (i.article ?? "").match(IO_MODULE);
    if (m) sys[m[1].toLowerCase() as "di" | "do" | "ai" | "ao"] += Number(m[2]) * i.qty;
    if (/контроллер|controller/i.test(i.rawName) && !/co-?processor|сопроцессор/i.test(i.rawName)) sys.controllers += i.qty;
  }
  const hmi = items.filter((i) => /\bHMI\b|панель/i.test(i.rawName)).reduce((s, i) => s + i.qty, 0);

  return {
    hasSections: items.some((i) => i.section),
    request: { systemPositions, objects: requestObjects },
    offer: {
      systems: [...systems.entries()]
        .map(([name, v]) => ({ name, ...v }))
        // «Система 1 … Система 8», общие позиции — в конце
        .sort((a, b) => {
          const na = a.name.match(/\d+/);
          const nb = b.name.match(/\d+/);
          if (na && nb) return Number(na[0]) - Number(nb[0]);
          return na ? -1 : nb ? 1 : a.name.localeCompare(b.name);
        }),
      hmi,
    },
  };
}

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
      orderBy: { createdAt: "asc" },
    });
    if (!offer) throw new HttpError(404, "КП не найдено");

    const spec = await prisma.specItem.findMany({ where: { projectId } });
    const offers = await prisma.offer.findMany({
      where: { projectId },
      include: { supplier: true },
      orderBy: { createdAt: "asc" },
    });

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
      offers: offers.map((o) => ({ id: o.id, supplier: o.supplier.name, number: o.number, currency: o.currency })),
      scope: buildScope(spec, offer.items),
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
      summary: { tagsOffered: number };
      scope: ReturnType<typeof buildScope>;
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

    // КП на системы: сверка по составу
    if (audit.summary.tagsOffered === 0) {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet([
          ...audit.scope.request.systemPositions.map((p) => ({ Сторона: "Заявка", Позиция: `${p.tag ?? ""} — ${p.name}`, "Кол-во": p.qty })),
          ...audit.scope.offer.systems.map((sy) => ({
            Сторона: "КП",
            Позиция: sy.name,
            "Кол-во": sy.controllers ? 1 : "",
            Контроллеров: sy.controllers,
            DI: sy.di,
            DO: sy.do,
            AI: sy.ai,
            Сумма: Math.round(sy.sum),
          })),
          { Сторона: "КП", Позиция: "HMI", "Кол-во": audit.scope.offer.hmi },
        ]),
        "Состав систем"
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          audit.scope.request.objects.map((o) => ({
            Объект: o.object,
            Тэгов: o.tags,
            Состав: o.families.map((f) => `${f.family}: ${f.count}`).join("; "),
          }))
        ),
        "Приборы по объектам"
      );
    }

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const filename = `Сверка с заявкой — ${audit.offer.supplier}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(buf);
  })
);
