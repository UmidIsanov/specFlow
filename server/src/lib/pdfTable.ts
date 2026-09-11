import { extractPdf, type PdfLine } from "./pdf.js";
import type { RawRow } from "./xlsx.js";

export type PdfColumn = { from: number; to: number; title: string; field?: keyof RawRow };

export type PdfTable = {
  pages: number;
  columns: PdfColumn[];
  rows: RawRow[];
};

// Заголовки заявок и спецификаций: русские и английские, обычно в две-три строки.
// Порядок важен — колонку забирает первое подходящее поле.
const FIELD_PATTERNS: Array<{ key: keyof RawRow; patterns: RegExp }> = [
  { key: "tag", patterns: /(теговый|тэговый|tag\s*№|позиционное обозначение)/i },
  { key: "datasheet", patterns: /(опросн|datasheet|ол,\s*тт|тт,\s*ту)/i },
  { key: "docRef", patterns: /(проектной документации|technical documents)/i },
  { key: "system", patterns: /(дисциплин|discipline)/i },
  { key: "name", patterns: /(наимен|назван|^\s*name\b)/i },
  { key: "article", patterns: /(тип, марка|type, brand|артикул|маркиров|обозначен)/i },
  { key: "code", patterns: /(код продукции|код оборуд|код изделия)/i },
  { key: "manufacturer", patterns: /(поставщик|завод|изготов|производ|бренд)/i },
  { key: "unit", patterns: /(ед\.?\s*изм|единиц|unit of)/i },
  { key: "qty", patterns: /(кол-?во|количест|quantity)/i },
  { key: "price", patterns: /(цена|стоим|price|сумма)/i },
  { key: "note", patterns: /(примечан|коммент|remark)/i },
];

const MIN_HEADER_COLUMNS = 5;
const INT = /^\d{1,5}$/;

function columnOf(x: number, edges: number[]): number {
  for (let i = 0; i < edges.length - 1; i++) {
    if (x + 1 >= edges[i] && x < edges[i + 1]) return i;
  }
  return x < edges[0] ? 0 : edges.length - 2;
}

/** Строка нумерации колонок «1 2 3 4 …», которую печатают под шапкой по ГОСТ. */
function isNumberingLine(line: PdfLine): boolean {
  const nums = line.cells.map((c) => Number(c.text));
  return (
    nums.length >= 5 &&
    nums.every((n) => Number.isInteger(n)) &&
    nums[0] === 1 &&
    nums[1] === 2 &&
    nums[2] === 3
  );
}

function appendCell(prev: string | undefined, next: string): string {
  if (!prev) return next;
  // «MOF3-UN-402100-INS-DAT-» + «9003» — перенос внутри кода, склеиваем без пробела
  if (/[-–/]$/.test(prev)) return prev + next;
  return `${prev} ${next}`.replace(/\s+/g, " ").trim();
}

function toNumber(v?: string): number | undefined {
  if (!v) return undefined;
  const n = parseFloat(v.replace(/\s/g, "").replace(/,/g, "."));
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Разбирает табличный PDF с текстовым слоем: заявку на закуп, спецификацию, КП.
 * Границы колонок берутся из линий сетки — заголовки центрированы и на них полагаться нельзя.
 * Новая позиция начинается там, где в первой колонке стоит порядковый номер,
 * остальные строки — продолжение многострочных ячеек той же позиции.
 */
export async function parsePdfTable(buf: Buffer): Promise<PdfTable> {
  const { lines, pages, columnEdges, rowEdges } = await extractPdf(buf);
  if (lines.length === 0 || columnEdges.length < 3) return { pages, columns: [], rows: [] };

  const count = columnEdges.length - 1;
  const numberingIdx = lines.findIndex(isNumberingLine);
  const headerLines = (numberingIdx >= 0 ? lines.slice(0, numberingIdx) : lines.slice(0, 40)).filter(
    // шапка занимает почти всю ширину таблицы; штамп и титул сверху — нет
    (l) => new Set(l.cells.map((c) => columnOf(c.x, columnEdges))).size >= MIN_HEADER_COLUMNS
  );
  const dataLines = numberingIdx >= 0 ? lines.slice(numberingIdx + 1) : lines;

  const titles: string[][] = Array.from({ length: count }, () => []);
  for (const l of headerLines) for (const c of l.cells) titles[columnOf(c.x, columnEdges)].push(c.text);

  const columns: PdfColumn[] = Array.from({ length: count }, (_, i) => {
    const title = titles[i].join(" ").replace(/\s+/g, " ").trim();
    return { from: columnEdges[i], to: columnEdges[i + 1], title };
  });

  // одно поле — одна колонка: при нескольких совпадениях берём левую
  for (const { key, patterns } of FIELD_PATTERNS) {
    const hit = columns.find((c) => !c.field && patterns.test(c.title));
    if (hit) hit.field = key;
  }

  const rows: RawRow[] = [];
  const dataByPage = new Map<number, PdfLine[]>();
  for (const l of dataLines) {
    const list = dataByPage.get(l.page);
    if (list) list.push(l);
    else dataByPage.set(l.page, [l]);
  }

  const bandOf = (y: number, edges: number[]) => {
    for (let i = 0; i < edges.length - 1; i++) {
      if (y < edges[i] && y >= edges[i + 1]) return i;
    }
    return -1;
  };

  for (const [page, pageLines] of [...dataByPage.entries()].sort((a, b) => a[0] - b[0])) {
    const edges = rowEdges.get(page) ?? [];
    if (edges.length < 2) continue;

    // ячейка позиции высокая, а её номер стоит по центру — поэтому строку задаёт
    // именно полоса между горизонтальными линиями, а не координата номера
    const bands = new Map<number, Partial<Record<keyof RawRow, string>>>();
    for (const line of pageLines) {
      const band = bandOf(line.y, edges);
      if (band < 0) continue;
      let cell = bands.get(band);
      if (!cell) bands.set(band, (cell = {}));
      for (const c of line.cells) {
        const col = columns[columnOf(c.x, columnEdges)];
        if (!col?.field) continue;
        cell[col.field] = appendCell(cell[col.field], c.text);
      }
      const first = line.cells[0];
      if (first && columnOf(first.x, columnEdges) === 0 && INT.test(first.text)) cell.pos = first.text;
    }

    for (const band of [...bands.keys()].sort((a, b) => a - b)) {
      const cell = bands.get(band)!;
      if (!cell.pos || !cell.name) continue;
      rows.push({
        pos: cell.pos,
        name: cell.name,
        article: cell.article,
        code: cell.code,
        tag: cell.tag,
        datasheet: cell.datasheet,
        manufacturer: cell.manufacturer,
        unit: cell.unit ?? "шт",
        qty: toNumber(cell.qty) ?? 1,
        price: toNumber(cell.price),
        system: cell.system,
        docRef: cell.docRef,
        note: cell.note,
      });
    }
  }

  return { pages, columns, rows };
}
