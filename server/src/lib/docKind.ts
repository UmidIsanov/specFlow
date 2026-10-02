import type { RawRow } from "./xlsx.js";

/**
 * Что за документ принесли. Заявка и проектная спецификация — это «что нужно», без денег;
 * коммерческое предложение — «что предлагают и почём». Если их перепутать, цены поставщика
 * попадут в проект как план и объект будет испорчен, поэтому тип определяем до разбора.
 */
export type DocKind = "spec" | "kp" | "unknown";

// КП: договорные обороты и денежные колонки
const KP_MARKERS: Array<[RegExp, string]> = [
  [/продавец обязуется передать|seller agrees to transfer/i, "«Продавец обязуется передать»"],
  [/приложение\s*№?\s*\d+\s*(?:от|к)\s|appendix\s*№?\s*\d+/i, "«Приложение № … к контракту»"],
  [/к\s*контракту\s*№|to\s*(?:the\s*)?contract\s*no/i, "ссылка на контракт"],
  [/цена\s*за\s*(?:шт|ед)|unit\s*price/i, "колонка «Цена за ед.»"],
  [/сумма\s*\(?\s*ндс|total\s*amount|итого,?\s*руб/i, "колонка «Сумма»"],
  [/счет на оплату|счёт на оплату|инвойс|invoice/i, "счёт на оплату"],
];

// Заявка и проектная спецификация: проектные обороты, денег нет
const SPEC_MARKERS: Array<[RegExp, string]> = [
  [/заявка\s*(?:на|№)|requisition/i, "«Заявка»"],
  [/теговый\s*номер|тэговый\s*номер|tag\s*№/i, "колонка «Теговый номер»"],
  [/наименование\s*и\s*техническая\s*характеристика/i, "«Наименование и техническая характеристика»"],
  [/спецификация\s*оборудования|ведомость\s*(?:материалов|оборудования)/i, "«Спецификация оборудования»"],
  [/№\s*проектной\s*документации|код\s*продукции/i, "проектные колонки"],
];

export type KindGuess = { kind: DocKind; reasons: string[] };

/** По тексту документа. Надёжнее всего — первая страница, там шапка и заголовок. */
export function classifyText(text: string): KindGuess {
  if (!text || text.length < 40) return { kind: "unknown", reasons: [] };
  const kp = KP_MARKERS.filter(([re]) => re.test(text));
  const spec = SPEC_MARKERS.filter(([re]) => re.test(text));
  if (kp.length > spec.length && kp.length >= 2) return { kind: "kp", reasons: kp.map(([, r]) => r) };
  if (spec.length > kp.length && spec.length >= 1) return { kind: "spec", reasons: spec.map(([, r]) => r) };
  return { kind: "unknown", reasons: [] };
}

/** По уже разобранным строкам: в заявке и спецификации цен нет, в КП они почти у каждой строки. */
export function classifyRows(rows: RawRow[]): { kind: DocKind; priced: number; total: number } {
  const total = rows.length;
  const priced = rows.filter((r) => (r.price ?? 0) > 0).length;
  return { kind: total >= 3 && priced >= total * 0.6 ? "kp" : "spec", priced, total };
}
