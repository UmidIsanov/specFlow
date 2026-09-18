import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import type { RawRow } from "./xlsx.js";

const run = promisify(execFile);

/**
 * Локальное распознавание сканов: pdftoppm рисует страницы, движок macOS Vision читает
 * текст с координатами, дальше таблица восстанавливается по колонкам шапки.
 * Бесплатно и офлайн — для КП, счетов и прочих документов поставщиков.
 */

type OcrLine = { text: string; conf: number; x: number; y: number; w: number; h: number };
type OcrPage = { width: number; height: number; lines: OcrLine[] };

export type LocalOcrResult = {
  docNumber: string;
  supplier: string;
  currency: string;
  declaredTotal?: number;
  rows: RawRow[];
  pages: number;
  confidence: number;
  warnings: string[];
};

const OCR_BIN = resolve(process.env.OCR_BIN ?? join(process.cwd(), "..", "converter", "ocr", "ocr"));
const DPI = 220;

export function localOcrAvailable(): { available: boolean; reason?: string } {
  if (process.platform !== "darwin") return { available: false, reason: "локальное распознавание работает только на macOS" };
  if (!existsSync(OCR_BIN)) return { available: false, reason: "распознаватель не собран: npm run build:ocr" };
  return { available: true };
}

async function renderPages(buf: Buffer, report: (done: number, total: number) => void): Promise<{ dir: string; files: string[] }> {
  const dir = mkdtempSync(join(tmpdir(), "specflow-ocr-"));
  const pdf = join(dir, "doc.pdf");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(pdf, buf);
  await run("pdftoppm", ["-r", String(DPI), "-png", pdf, join(dir, "p")]);
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".png"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((f) => join(dir, f));
  report(0, files.length);
  return { dir, files };
}

async function ocrPage(file: string): Promise<OcrPage> {
  const { stdout } = await run(OCR_BIN, [file], { maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(stdout) as OcrPage;
}

/* ------------------------------ восстановление таблицы ------------------------------ */

// Колонки КП и счетов: шапка на русском или английском
const COLUMNS: Array<{ key: keyof RawRow; re: RegExp }> = [
  { key: "pos", re: /^(№|n[°º]?|#|поз|п\/п|item)$/i },
  { key: "code", re: /^(код|артикул|article|part|sku)/i },
  { key: "name", re: /(наимен|назван|описан|товар|description|name)/i },
  { key: "article", re: /(тип|марка|модель|model|type)/i },
  { key: "datasheet", re: /(опросн|ол\b|datasheet|документ)/i },
  { key: "qty", re: /(кол|количест|qty|quantity|q-ty)/i },
  { key: "unit", re: /^(ед|единиц|unit)/i },
  { key: "price", re: /(цена|price)/i },
  { key: "note", re: /(примеч|remark|note)/i },
];
const TOTAL_COL = /(сумма|стоимость|total|amount|итого)/i;

type Column = { key: keyof RawRow | "total"; x0: number; x1: number; cx: number };

function findHeader(lines: OcrLine[]): { y: number; h: number; columns: Column[] } | null {
  // группируем по y и ищем полосу, где ≥3 слова похожи на заголовки колонок
  const sorted = [...lines].sort((a, b) => a.y - b.y);
  for (let i = 0; i < sorted.length; i++) {
    // шапка бывает в 2–3 строки и на двух языках — берём полосу в три высоты строки
    const band = sorted.filter((l) => Math.abs(l.y - sorted[i].y) < Math.max(sorted[i].h, 0.006) * 3);
    const cols: Column[] = [];
    for (const l of band) {
      const t = l.text.trim();
      const hit = COLUMNS.find((c) => c.re.test(t));
      if (hit) cols.push({ key: hit.key, x0: l.x, x1: l.x + l.w, cx: l.x + l.w / 2 });
      else if (TOTAL_COL.test(t)) cols.push({ key: "total", x0: l.x, x1: l.x + l.w, cx: l.x + l.w / 2 });
    }
    const keys = new Set(cols.map((c) => c.key));
    if (keys.has("name") && keys.size >= 3) {
      cols.sort((a, b) => a.cx - b.cx);
      // одинаковые ключи — оставляем левый
      const seen = new Set<string>();
      const uniq = cols.filter((c) => (seen.has(c.key) ? false : (seen.add(c.key), true)));
      return { y: sorted[i].y, h: Math.max(...band.map((b) => b.h)), columns: uniq };
    }
  }
  return null;
}

/** Слово попадает в колонку, чью полосу оно перекрывает; иначе — в ближайшую по центру. */
function columnOf(l: OcrLine, columns: Column[]): Column {
  const x0 = l.x;
  const x1 = l.x + l.w;
  let best: Column | null = null;
  let bestOverlap = 0;
  for (const c of columns) {
    const ov = Math.min(x1, c.x1 + 0.01) - Math.max(x0, c.x0 - 0.01);
    if (ov > bestOverlap) {
      bestOverlap = ov;
      best = c;
    }
  }
  if (best) return best;
  const cx = l.x + l.w / 2;
  return columns.reduce((a, b) => (Math.abs(a.cx - cx) <= Math.abs(b.cx - cx) ? a : b));
}

const NUM = /^-?\d{1,3}(?:[  ]\d{3})*(?:[.,]\d+)?$|^-?\d+(?:[.,]\d+)?$/;
const INT = /^\d{1,4}$/;
const STOP = /^(итого|всего|total|сумма к оплате|в том числе|ндс)/i;

function toNum(s?: string): number | undefined {
  if (!s) return undefined;
  const t = s.replace(/[  ]/g, "").replace(/,/g, ".");
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : undefined;
}

type Cells = Partial<Record<Column["key"], string>>;

function tableFromPage(page: OcrPage, columns: Column[] | null, headerY: number): { rows: Cells[]; columns: Column[] | null; declaredTotal?: number } {
  const header = columns ? null : findHeader(page.lines);
  const cols = columns ?? header?.columns ?? null;
  if (!cols) return { rows: [], columns: null };
  const startY = columns ? -1 : (header?.y ?? headerY) + (header?.h ?? 0);

  const body = page.lines.filter((l) => l.y > startY + 0.002).sort((a, b) => a.y - b.y || a.x - b.x);

  // полосы по y
  const bands: OcrLine[][] = [];
  for (const l of body) {
    const last = bands[bands.length - 1];
    if (last && Math.abs(l.y - last[0].y) < Math.min(l.h, last[0].h) * 0.6) last.push(l);
    else bands.push([l]);
  }

  const rows: Cells[] = [];
  let declaredTotal: number | undefined;
  let current: Cells | null = null;
  // в таблицах с высокими ячейками номер стоит по центру: первые строки наименования идут выше него
  let pending: Cells = {};
  const posCol = cols.find((c) => c.key === "pos");

  const put = (cell: Cells, c: Column, t: string) => {
    cell[c.key] = cell[c.key] ? `${cell[c.key]} ${t}` : t;
  };

  for (const band of bands) {
    const texts = band.map((b) => b.text.trim());
    const joined = texts.join(" ");
    if (STOP.test(joined)) {
      const nums = texts.map(toNum).filter((n): n is number => n !== undefined && n > 0);
      if (nums.length) declaredTotal = Math.max(...nums);
      current = null;
      continue;
    }
    // новая строка — там, где в колонке № стоит число; без колонки № — число у левого края
    const firstColX = Math.min(...cols.map((c) => c.x0));
    const posWord = posCol
      ? band.find((b) => columnOf(b, cols).key === "pos" && INT.test(b.text.trim()))
      : band.find((b) => b.x < firstColX - 0.01 && /^\d{1,3}\.?$/.test(b.text.trim()));
    if (posWord) {
      current = { ...pending, pos: posWord.text.trim() };
      pending = {};
      rows.push(current);
      for (const b of band) {
        if (b === posWord) continue;
        const c = columnOf(b, cols);
        if (c.key !== "pos") put(current, c, b.text.trim());
      }
      continue;
    }
    // строка без номера — продолжение текущей; до первой строки с номером копим в pending
    const words = band.map((b) => ({ b, c: columnOf(b, cols) }));
    const target = current ?? pending;
    for (const w of words) if (w.c.key !== "pos") put(target, w.c, w.b.text.trim());
  }
  // хвост без номера в конце страницы — к последней строке
  if (current && Object.keys(pending).length) for (const [k, v] of Object.entries(pending)) put(current, { key: k } as Column, v as string);
  return { rows, columns: cols, declaredTotal };
}

const CURRENCY: Array<[RegExp, string]> = [
  [/\bKZT\b|тенге|₸|казахстан/i, "KZT"],
  [/\bUSD\b|\$|долл/i, "USD"],
  [/\bEUR\b|€|евро/i, "EUR"],
  [/\bUZS\b|сум\b|узбекистан/i, "UZS"],
  [/\bRUB\b|руб|₽/i, "RUB"],
];

function docMeta(pages: OcrPage[]): { docNumber: string; supplier: string; currency: string } {
  const text = pages.flatMap((p) => [...p.lines].sort((a, b) => a.y - b.y || a.x - b.x).map((l) => l.text)).join("\n");
  const docNumber =
    text.match(/(?:счет(?:-фактура)? на оплату|спецификация|specification|коммерческое предложение|кп)\s*№?\s*([^\n]{2,60})/i)?.[1]?.trim() ??
    "";
  let supplier = text.match(/поставщик:\s*(?:бин|иин|инн)?[^\n]*?((?:ТОО|ООО|АО|ИП|LLC|LLP|Ltd)[^\n,]{2,60})/i)?.[1]?.trim() ?? "";
  if (!supplier) supplier = text.match(/((?:ТОО|ООО|АО|LLC|LLP)\s*[«"“][^»"”\n]{2,60}[»"”])/)?.[1]?.trim() ?? "";
  const currency = CURRENCY.find(([re]) => re.test(text))?.[1] ?? "";
  return { docNumber, supplier, currency };
}

/** «Итого» / «Всего к оплате» и ближайшее число справа или строкой ниже. */
function findDeclaredTotal(pages: OcrPage[]): number | undefined {
  for (const p of pages) {
    const lines = [...p.lines].sort((a, b) => a.y - b.y || a.x - b.x);
    for (let i = 0; i < lines.length; i++) {
      if (!/^(итого|всего|total|сумма к оплате)/i.test(lines[i].text.trim())) continue;
      const inline = toNum(lines[i].text.replace(/^[^\d]+/, ""));
      if (inline && inline > 0) return inline;
      const near = lines
        .filter((l) => l !== lines[i] && Math.abs(l.y - lines[i].y) < lines[i].h * 2.5 && l.x > lines[i].x)
        .map((l) => toNum(l.text.trim()))
        .filter((n): n is number => n !== undefined && n > 0);
      if (near.length) return Math.max(...near);
    }
  }
  return undefined;
}

export async function recognizeLocally(
  buf: Buffer,
  report: (p: { stage: string; done: number; total: number }) => void = () => {}
): Promise<LocalOcrResult> {
  const avail = localOcrAvailable();
  if (!avail.available) throw new Error(avail.reason);

  report({ stage: "Готовлю страницы для распознавания", done: 0, total: 0 });
  const { dir, files } = await renderPages(buf, () => {});
  try {
    const pages: OcrPage[] = [];
    for (let i = 0; i < files.length; i++) {
      report({ stage: `Распознаю страницу ${i + 1} из ${files.length} — локально, бесплатно`, done: i, total: files.length });
      pages.push(await ocrPage(files[i]));
    }
    report({ stage: "Собираю таблицу", done: files.length, total: files.length });

    let columns: Column[] | null = null;
    const cells: Cells[] = [];
    let declaredTotal: number | undefined;
    for (const p of pages) {
      const t = tableFromPage(p, columns, 0);
      columns = columns ?? t.columns;
      cells.push(...t.rows);
      if (t.declaredTotal) declaredTotal = t.declaredTotal;
    }
    if (!declaredTotal) declaredTotal = findDeclaredTotal(pages);

    const rows: RawRow[] = cells
      .filter((c) => c.name)
      .map((c) => ({
        pos: c.pos,
        name: (c.name ?? "").replace(/\s+/g, " ").trim(),
        code: c.code?.trim(),
        article: c.article?.trim(),
        datasheet: c.datasheet?.trim(),
        unit: c.unit?.trim() || "шт",
        qty: toNum(c.qty),
        price: toNum(c.price),
        note: c.note?.trim(),
      }));

    const allLines = pages.flatMap((p) => p.lines);
    const confidence = allLines.length ? allLines.reduce((s, l) => s + l.conf, 0) / allLines.length : 0;
    const warnings: string[] = [];
    if (!columns) warnings.push("Не нашёл шапку таблицы — проверьте, что в документе есть колонки «Наименование» и «Кол-во»");
    const noQty = rows.filter((r) => r.qty === undefined).length;
    if (noQty) warnings.push(`Не прочитано количество в ${noQty} стр.`);
    const noPrice = rows.filter((r) => !r.price).length;
    if (noPrice && rows.length) warnings.push(`Не прочитана цена в ${noPrice} стр.`);
    if (declaredTotal) {
      const sum = rows.reduce((s, r) => s + (r.qty ?? 0) * (r.price ?? 0), 0);
      if (Math.abs(sum - declaredTotal) > Math.max(1, declaredTotal * 0.001)) {
        warnings.push(`Сумма строк ${Math.round(sum).toLocaleString("ru-RU")} не сходится с итогом документа ${Math.round(declaredTotal).toLocaleString("ru-RU")}`);
      }
    }
    if (confidence < 0.6) warnings.push(`Скан читается плохо (уверенность ${Math.round(confidence * 100)} %) — сверьте с оригиналом`);

    return { ...docMeta(pages), declaredTotal, rows, pages: pages.length, confidence, warnings };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
