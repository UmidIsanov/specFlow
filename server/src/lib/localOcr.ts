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
type OcrPage = { width: number; height: number; lines: OcrLine[]; hlines?: number[]; vlines?: number[] };

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
  const dir = mkdtempSync(join(tmpdir(), "pozitsiya-ocr-"));
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
  { key: "note", re: /(примеч|коммент|remark|note|comment)/i },
];
const TOTAL_COL = /(сумма|стоимость|total|amount|итого)/i;

type Column = { key: keyof RawRow | "total" | null; x0: number; x1: number; cx: number };

/**
 * Колонки по вертикальным линиям таблицы — это точные границы ячеек.
 * Угадывать по положению слов шапки нельзя: заголовок центрирован, а текст прижат влево.
 */
function columnsFromGrid(page: OcrPage): Column[] | null {
  const v = (page.vlines ?? []).filter((x) => x > 0.005 && x < 0.995).sort((a, b) => a - b);
  // слипшиеся линии — в одну
  const edges: number[] = [];
  for (const x of v) if (!edges.length || x - edges[edges.length - 1] > 0.012) edges.push(x);
  if (edges.length < 4) return null;
  return edges.slice(0, -1).map((x0, i) => ({ key: null, x0, x1: edges[i + 1], cx: (x0 + edges[i + 1]) / 2 }));
}

/** Какие слова шапки попали в колонку — по ним и определяется, что это за колонка. */
function nameColumns(columns: Column[], band: OcrLine[]): void {
  const text = columns.map(() => "");
  for (const w of band) {
    const i = columns.findIndex((c) => w.x + w.w / 2 >= c.x0 && w.x + w.w / 2 < c.x1);
    if (i >= 0) text[i] = `${text[i]} ${w.text}`.trim();
  }
  const used = new Set<string>();
  columns.forEach((c, i) => {
    const t = text[i];
    if (!t) return;
    const hit = COLUMNS.find(({ key, re }) => !used.has(key) && re.test(t));
    if (hit) {
      c.key = hit.key;
      used.add(hit.key);
    } else if (TOTAL_COL.test(t) && !used.has("total")) {
      c.key = "total";
      used.add("total");
    }
  });
}

/**
 * Полосы строк по горизонтальным линиям сетки. Это единственный надёжный способ:
 * номер позиции печатают по центру высокой ячейки, поэтому первые строки наименования
 * оказываются выше номера и по его координате строку определить нельзя.
 */
function bandsFromGrid(page: OcrPage, startY: number): OcrLine[][] | null {
  const h = (page.hlines ?? []).filter((y) => y > startY - 0.01 && y < 0.99).sort((a, b) => a - b);
  const edges: number[] = [];
  for (const y of h) if (!edges.length || y - edges[edges.length - 1] > 0.012) edges.push(y);
  if (edges.length < 2) return null;
  const limits = [...edges, 1];
  const out: OcrLine[][] = limits.slice(0, -1).map(() => []);
  for (const l of page.lines) {
    if (l.y <= startY) continue;
    const i = limits.findIndex((y, k) => l.y + l.h / 2 >= y && l.y + l.h / 2 < limits[k + 1]);
    if (i >= 0) out[i].push(l);
  }
  return out.filter((b) => b.length).map((b) => b.sort((a, c) => a.y - c.y || a.x - c.x));
}

/** Полосы строк по вертикали: слова одной строки таблицы стоят на близких y. */
function bands(lines: OcrLine[]): OcrLine[][] {
  const out: OcrLine[][] = [];
  for (const l of [...lines].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const last = out[out.length - 1];
    if (last && Math.abs(l.y - last[0].y) < Math.min(l.h, last[0].h) * 0.6) last.push(l);
    else out.push([l]);
  }
  return out;
}

function findHeader(lines: OcrLine[]) {
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
      const seen = new Set<string>();
      const uniq = cols.filter((c) => (seen.has(String(c.key)) ? false : (seen.add(String(c.key)), true)));
      // низ шапки, а не её верх: иначе вторая строка заголовка попадёт в данные
      const bottom = Math.max(...band.map((b) => b.y + b.h));
      return { y: bottom, columns: uniq, band };
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
const INT = /^\d{1,4}\.?$/;
const STOP = /^(итого|всего|total|сумма к оплате|в том числе|ндс)/i;

function toNum(s?: string): number | undefined {
  if (!s) return undefined;
  const t = s.replace(/[  ]/g, "").replace(/,/g, ".");
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : undefined;
}

type CellKey = Exclude<Column["key"], null>;
type Cells = Partial<Record<CellKey, string>>;

function tableFromPage(
  page: OcrPage,
  known: Column[] | null
): { rows: Cells[]; columns: Column[] | null; declaredTotal?: number } {
  let cols = known;
  let startY = -1;

  if (!cols) {
    const header = findHeader(page.lines);
    if (!header) return { rows: [], columns: null };
    startY = header.y;
    const grid = columnsFromGrid(page);
    if (grid) {
      // границы берём из сетки, а названия колонок — из слов шапки
      nameColumns(grid, header.band);
      const named = grid.filter((c) => c.key);
      cols = named.some((c) => c.key === "name") ? grid : header.columns;
    } else {
      cols = header.columns;
    }
  }
  if (!cols) return { rows: [], columns: null };

  const body = page.lines.filter((l) => l.y > startY + 0.002);
  const rows: Cells[] = [];
  let declaredTotal: number | undefined;
  let current: Cells | null = null;
  let pending: Cells = {};
  const posCol = cols.find((c) => c.key === "pos");
  const firstColX = Math.min(...cols.map((c) => c.x0));

  const put = (cell: Cells, key: Column["key"], t: string) => {
    if (!key) return;
    cell[key] = cell[key] ? `${cell[key]} ${t}` : t;
  };

  const gridBands = bandsFromGrid(page, startY);
  for (const band of gridBands ?? bands(body)) {
    const texts = band.map((b) => b.text.trim());
    if (STOP.test(texts.join(" "))) {
      const nums = texts.map(toNum).filter((n): n is number => n !== undefined && n > 0);
      if (nums.length) declaredTotal = Math.max(...nums);
      current = null;
      continue;
    }
    // новая строка — там, где в первой колонке стоит номер: «1», «1.»
    const posWord = band.find((b) => {
      const inPos = posCol ? columnOf(b, cols!).key === "pos" : b.x < firstColX + 0.03;
      return inPos && INT.test(b.text.trim());
    });
    if (gridBands) {
      // ячейка целиком — одна строка таблицы
      current = { pos: posWord?.text.trim().replace(/\.$/, "") };
      rows.push(current);
    } else if (posWord) {
      current = { ...pending, pos: posWord.text.trim().replace(/\.$/, "") };
      pending = {};
      rows.push(current);
    }
    const target = current ?? pending;
    for (const b of band) {
      if (b === posWord) continue;
      const c = columnOf(b, cols);
      if (c.key && c.key !== "pos") put(target, c.key, b.text.trim());
    }
  }
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

/** Текст первой страницы — чтобы понять, что за документ, не распознавая его целиком. */
export async function firstPageText(buf: Buffer): Promise<string> {
  if (!localOcrAvailable().available) return "";
  const dir = mkdtempSync(join(tmpdir(), "pozitsiya-kind-"));
  try {
    const { writeFileSync } = await import("node:fs");
    const pdf = join(dir, "doc.pdf");
    writeFileSync(pdf, buf);
    await run("pdftoppm", ["-r", "150", "-png", "-f", "1", "-l", "1", pdf, join(dir, "p")]);
    const file = readdirSync(dir).find((f) => f.endsWith(".png"));
    if (!file) return "";
    const page = await ocrPage(join(dir, file));
    return page.lines.map((l) => l.text).join(" ");
  } catch {
    return "";
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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
      const t = tableFromPage(p, columns);
      columns = columns ?? t.columns;
      cells.push(...t.rows);
      if (t.declaredTotal) declaredTotal = t.declaredTotal;
    }
    if (!declaredTotal) declaredTotal = findDeclaredTotal(pages);

    const DATASHEET = /\b[A-Z]{3,4}\d?-?UN-\d{6}-[A-Z]{3}-[A-Z]{3}[ -]?\d{3,4}\b/i;
    const rows: RawRow[] = cells
      .filter((c) => c.name)
      .map((c) => ({
        pos: c.pos,
        name: (c.name ?? "").replace(/\s+/g, " ").trim(),
        code: c.code?.trim(),
        article: c.article?.trim(),
        datasheet:
          c.datasheet?.trim() ||
          [c.note, c.article, c.name].map((t) => t?.match(DATASHEET)?.[0]).find(Boolean),
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
