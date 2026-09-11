import * as XLSX from "xlsx";

export type RawRow = {
  pos?: string;
  name: string;
  article?: string;
  code?: string;
  manufacturer?: string;
  unit?: string;
  qty?: number;
  price?: number;
  system?: string;
  section?: string;
  building?: string;
  docRef?: string;
  note?: string;
  tag?: string; // теговый номер прибора: 402100-AIT-9001 TG
  datasheet?: string; // опросный лист / ОЛ: MOF3-UN-402100-INS-DAT-9003
};

export type SheetParse = {
  sheet: string;
  sheets: string[];
  headerRow: number;
  columns: Partial<Record<keyof RawRow, number>>;
  rows: RawRow[];
};

// Порядок важен: колонку забирает первое подходящее поле.
// «Тип, марка, обозначение» — это маркировка, а не производитель; «Код продукции» идёт следом.
const HEADER_MAP: Array<{ key: keyof RawRow; patterns: RegExp }> = [
  { key: "building", patterns: /^объект/i },
  { key: "docRef", patterns: /(шифр|№\s*документа)/i },
  { key: "system", patterns: /^система/i },
  { key: "section", patterns: /^раздел/i },
  { key: "pos", patterns: /^(№|n|поз|п\/п|номер)/i },
  { key: "name", patterns: /(наимен|назван|оборуд|товар|материал|описан)/i },
  { key: "article", patterns: /(тип|артикул|маркиров|модель|обозначен)/i },
  { key: "code", patterns: /код/i },
  { key: "manufacturer", patterns: /(поставщик|завод|изготов|производ|бренд|марка|страна)/i },
  { key: "unit", patterns: /(ед\.?\s*изм|единиц|ед\.$|^ед)/i },
  { key: "qty", patterns: /(кол-?во|кол\s*-?\s*в|количест|объем|объём)/i },
  { key: "price", patterns: /(цена|стоим|прайс|price)/i },
  { key: "note", patterns: /(примечан|коммент)/i },
];

const REQUIRED_FOR_HEADER: Array<keyof RawRow> = ["qty", "article", "unit"];

function toNumber(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  const n = parseFloat(String(v).replace(/\s/g, "").replace(/,/g, "."));
  return Number.isFinite(n) ? n : undefined;
}

const s = (v: unknown) => {
  if (v === null || v === undefined) return undefined;
  const t = String(v).replace(/\s+/g, " ").trim();
  return t || undefined;
};

type Grid = unknown[][];

function readGrid(sheet: XLSX.WorkSheet): Grid {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: "" });
}

/**
 * Ищет строку шапки в первых 15 строках — сверху почти всегда штамп объекта и пустые строки.
 * Возвращает раскладку колонок; колонку забирает первое подходящее поле.
 */
function detectHeader(grid: Grid) {
  for (let r = 0; r < Math.min(grid.length, 15); r++) {
    const row = grid[r] ?? [];
    const found: Partial<Record<keyof RawRow, number>> = {};
    const claimed = new Set<number>();
    row.forEach((cell, c) => {
      const text = String(cell ?? "").trim();
      if (!text) return;
      for (const { key, patterns } of HEADER_MAP) {
        if (found[key] === undefined && !claimed.has(c) && patterns.test(text)) {
          found[key] = c;
          claimed.add(c);
          break;
        }
      }
    });
    if (found.name !== undefined && REQUIRED_FOR_HEADER.some((k) => found[k] !== undefined)) {
      return { headerRow: r, columns: found };
    }
  }
  return null;
}

const SERVICE_ROW = /^(итого|всего|total|оборудование|кабели и провода|изделия и материалы)$/i;

function extractRows(grid: Grid, headerRow: number, columns: Partial<Record<keyof RawRow, number>>): RawRow[] {
  const at = (row: unknown[], key: keyof RawRow) =>
    columns[key] !== undefined ? s(row[columns[key]!]) : undefined;

  const rows: RawRow[] = [];
  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const name = at(row, "name");
    if (!name || name.length < 2) continue;
    // строка-разделитель раздела и итоговая строка — не позиции
    if (SERVICE_ROW.test(name)) continue;
    // строка нумерации колонок «1 2 3 4 …», которую печатают под шапкой по ГОСТ
    if (/^\d+$/.test(name)) continue;

    rows.push({
      pos: at(row, "pos"),
      name,
      article: at(row, "article"),
      code: at(row, "code"),
      manufacturer: at(row, "manufacturer"),
      unit: at(row, "unit") ?? "шт",
      qty: columns.qty !== undefined ? toNumber(row[columns.qty]) : undefined,
      price: columns.price !== undefined ? toNumber(row[columns.price]) : undefined,
      system: at(row, "system"),
      section: at(row, "section"),
      building: at(row, "building"),
      docRef: at(row, "docRef"),
      note: at(row, "note"),
    });
  }
  return rows;
}

function parseSheet(wb: XLSX.WorkBook, name: string): Omit<SheetParse, "sheets"> | null {
  const sheet = wb.Sheets[name];
  if (!sheet) return null;
  const grid = readGrid(sheet);
  const detected = detectHeader(grid);
  if (!detected) return null;
  const rows = extractRows(grid, detected.headerRow, detected.columns);
  return { sheet: name, headerRow: detected.headerRow, columns: detected.columns, rows };
}

/** Насколько лист похож на полную спецификацию: и объём строк, и богатство колонок. */
function score(p: Omit<SheetParse, "sheets">): number {
  return p.rows.length * (1 + Object.keys(p.columns).length / 10);
}

/**
 * Разбирает книгу. Без указания листа выбирается самый содержательный:
 * в выгрузке pdf-spec-converter первым идёт лист «Итого по наименованиям»,
 * а нужна «Сводная спецификация» — с объектами, разделами и кодами продукции.
 */
export function parseSpecWorkbook(buf: Buffer, sheetName?: string): SheetParse {
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheets = wb.SheetNames;

  if (sheetName) {
    const parsed = parseSheet(wb, sheetName);
    if (!parsed) return { sheet: sheetName, sheets, headerRow: -1, columns: {}, rows: [] };
    return { ...parsed, sheets };
  }

  let best: Omit<SheetParse, "sheets"> | null = null;
  for (const name of sheets) {
    const parsed = parseSheet(wb, name);
    if (parsed && parsed.rows.length && (!best || score(parsed) > score(best))) best = parsed;
  }
  if (!best) return { sheet: sheets[0] ?? "", sheets, headerRow: -1, columns: {}, rows: [] };
  return { ...best, sheets };
}

/** Перечень листов с краткой сводкой — чтобы инженер выбрал нужный перед импортом. */
export function inspectWorkbook(buf: Buffer) {
  const wb = XLSX.read(buf, { type: "buffer" });
  const best = parseSpecWorkbook(buf);
  return {
    recommended: best.sheet,
    sheets: wb.SheetNames.map((name) => {
      const parsed = parseSheet(wb, name);
      return {
        name,
        rows: parsed?.rows.length ?? 0,
        columns: parsed ? Object.keys(parsed.columns) : [],
        preview: parsed?.rows.slice(0, 3) ?? [],
      };
    }),
  };
}
