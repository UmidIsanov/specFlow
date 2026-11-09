/**
 * Разбор реестра инспекций — файла «Инспекция», который ПТО ведёт вручную.
 *
 * Это единственный источник статуса ИТД: 20.10.2026 графу ИТД убрали из
 * «Статуса СМР», чтобы данные не расходились. Строка реестра — одна заявка
 * на инспекцию: объект, система, вид работы, изменение проекта и статус
 * приёмки. Позиций заявки тут нет и быть не должно: кабель и гофра идут
 * по другим заявкам, сопоставлять сданные работы с закупкой нельзя.
 *
 * Файл живой, поэтому разбор держится на названиях столбцов, а не на их
 * номерах: в версии от 28.10 вид работы стоит в четвёртом столбце, а в
 * версии от 03.11 — в пятом, потому что рядом появился пустой.
 */
import * as XLSX from "xlsx";
import { ITD_PACK, ITD_STATE, type ItdPack, type ItdState } from "./enums.js";

export type InspectionRow = {
  rowNo?: string;
  building: string;
  system: string;
  /** Вид работы, приведённый к общему виду: «прокладка кабель» → «Прокладка кабеля». */
  workKind: string;
  /** Вид работы ровно как в файле — чтобы инженер узнал свою строку. */
  rawKind?: string;
  workPack: ItdPack;
  fcn?: string;
  statusText?: string;
  state: ItdState;
  inspectionNo?: string;
  inspectedAt?: Date;
  /** Когда в клетке даты стоит заметка, а не дата: «(13.05.2026) 18.05.2026». */
  inspectedText?: string;
  smrDoneAt?: Date;
};

export type InspectionParse = {
  sheet: string;
  sheets: string[];
  headerRow: number;
  columns: Record<string, number>;
  rows: InspectionRow[];
  /** Строк, в которых не нашлось ни объекта, ни системы — их пропустили. */
  skipped: number;
};

type Grid = unknown[][];

const FIELDS = {
  rowNo: /^№$/i,
  building: /(^объект|№\s*объект|здани)/i,
  system: /систем/i,
  workKind: /вид\s*работ/i,
  smrDoneAt: /заверш\w*\s*смр/i,
  fcn: /изменени\w*\s*проект/i,
  status: /(инспекц\w*\s*готов|ожидани|^статус)/i,
  inspectionNo: /номер\s*инспекц/i,
  inspectedAt: /дата\s*инспекц/i,
} as const;

const text = (v: unknown): string => String(v ?? "").replace(/\s+/g, " ").trim();

/** Excel хранит дату числом дней от 1900 года; строкой приходит руками вписанное. */
function toDate(v: unknown): { date?: Date; raw?: string } {
  if (v === null || v === undefined || v === "") return {};
  if (typeof v === "number") {
    if (v < 20000 || v > 60000) return { raw: String(v) };
    const ms = Math.round((v - 25569) * 86400 * 1000);
    return { date: new Date(ms) };
  }
  const raw = text(v);
  const hit = raw.match(/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/);
  if (!hit) return { raw: raw || undefined };
  const d = new Date(Date.UTC(Number(hit[3]), Number(hit[2]) - 1, Number(hit[1])));
  // В клетке бывает и дата, и приписка — тогда оставляем обе.
  return { date: Number.isNaN(d.getTime()) ? undefined : d, raw: raw.length > 10 ? raw : undefined };
}

/**
 * Шапку ищем в первых десяти строках: сверху у файла бывает слитый заголовок.
 * Столбец объекта в реестре подписать забыли, поэтому его ищем отдельно —
 * по шестизначным номерам зданий в данных.
 */
function detectHeader(grid: Grid) {
  for (let r = 0; r < Math.min(grid.length, 10); r++) {
    const row = grid[r] ?? [];
    const columns: Record<string, number> = {};
    row.forEach((cell, c) => {
      const title = text(cell);
      if (!title) return;
      for (const [key, patterns] of Object.entries(FIELDS)) {
        if (columns[key] === undefined && patterns.test(title)) {
          columns[key] = c;
          return;
        }
      }
    });
    if (columns.workKind === undefined || columns.system === undefined) continue;

    if (columns.building === undefined) {
      const guess = guessBuildingColumn(grid, r, columns);
      if (guess !== undefined) columns.building = guess;
    }
    return { headerRow: r, columns };
  }
  return null;
}

/** Номер здания — это 5–7 цифр: 400000, 403104. Берём столбец, где их больше всего. */
function guessBuildingColumn(grid: Grid, headerRow: number, columns: Record<string, number>) {
  const taken = new Set(Object.values(columns));
  const width = Math.max(...grid.map((r) => r.length), 0);
  let best: { column: number; hits: number } | null = null;

  for (let c = 0; c < width; c++) {
    if (taken.has(c)) continue;
    let hits = 0;
    for (let r = headerRow + 1; r < grid.length; r++) {
      if (/^\d{5,7}$/.test(text(grid[r]?.[c]))) hits++;
    }
    if (hits > 3 && (!best || hits > best.hits)) best = { column: c, hits };
  }
  return best?.column;
}

/**
 * Система приходит вместе с номером чертежа: «SVS MOF3-UN-404024-INS-SVS-0003».
 * Нужен только код системы. Русская «А» в «АGS» — опечатка раскладкой, лечим.
 */
function normalizeSystem(raw: string): string {
  const fixed = raw.toUpperCase().replace(/А/g, "A").replace(/С/g, "C").replace(/Е/g, "E").replace(/О/g, "O");
  const hit = fixed.match(/[A-Z]{2,5}/);
  return hit ? hit[0] : fixed.replace(/\s+/g, " ").trim();
}

/** Виды работ ПТО пишет по-разному: «прокладка кабель» и «Прокладка кабеля» — одно и то же. */
// Хвосты слов пишем как [а-яё]*, а не \w*: \w в JS — только латиница и цифры.
const KINDS: Array<{ patterns: RegExp; label: string }> = [
  { patterns: /пайк[а-яё]*\s*вок/i, label: "Пайка ВОК" },
  { patterns: /прокладк[а-яё]*.*вок/i, label: "Прокладка кабеля ВОК" },
  { patterns: /прокладк[а-яё]*.*пассивн/i, label: "Прокладка кабеля и пассивное оборудование" },
  { patterns: /прокладк[а-яё]*.*измерени/i, label: "Прокладка кабеля и измерения" },
  { patterns: /прокладк[а-яё]*\s*кабел/i, label: "Прокладка кабеля" },
  { patterns: /лоток|лотк[ои]/i, label: "Лоток" },
  { patterns: /гофр/i, label: "Монтаж гофры" },
  { patterns: /подключени[а-яё]*.*измерени/i, label: "Подключение и измерения" },
];

function normalizeKind(raw: string): string {
  const clean = raw.replace(/\s+/g, " ").replace(/\.+$/, "").trim();
  // «Кабельная канализация №3» и «№2» — разные трассы, номер оставляем.
  const canal = clean.match(/кабельн[а-яё]*\s*канализаци[а-яё]*\s*(?:№\s*(\d+))?/i);
  if (canal) return canal[1] ? `Кабельная канализация № ${canal[1]}` : "Кабельная канализация";

  for (const { patterns, label } of KINDS) if (patterns.test(clean)) return label;
  return clean ? clean[0].toUpperCase() + clean.slice(1) : clean;
}

/**
 * Пакеты работ, как их считает ПТО: оборудование — один пакет, трассы с
 * кабелем — другой. Кабельное слово главнее: «прокладка кабеля и пассивное
 * оборудование» идёт в кабельный пакет.
 */
function detectPack(kind: string): ItdPack {
  if (/лоток|канализац|гофр|прокладк|вок|трасс|кабел/i.test(kind)) return ITD_PACK.CABLE;
  if (/оборудован|подключен|наладк|монтаж|установк|измерени|испытан|пусков/i.test(kind)) return ITD_PACK.EQUIP;
  return ITD_PACK.OTHER;
}

/**
 * Статус ПТО пишет словами: «Сдано», «Сдано. 3 -этаж частично»,
 * «Идут устранение замечаний». Частичная сдача — не сдача: пока участок
 * закрыт по одному этажу, работа по нему не закончена.
 */
function detectState(status: string): ItdState {
  if (!status) return ITD_STATE.REQUESTED;
  if (/замечани|устранени|переде/i.test(status)) return ITD_STATE.REMARKS;
  if (/частичн|этаж|участк/i.test(status)) return ITD_STATE.PARTIAL;
  if (/сдан|принят|готов|закрыт/i.test(status)) return ITD_STATE.ACCEPTED;
  return ITD_STATE.REQUESTED;
}

export function parseInspectionRegistry(buf: Buffer, sheetName?: string): InspectionParse {
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheets = wb.SheetNames;
  const sheet = sheetName && sheets.includes(sheetName) ? sheetName : sheets[0];
  if (!sheet) throw new Error("В файле нет листов");

  const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet], {
    header: 1,
    blankrows: false,
    defval: "",
  });

  const head = detectHeader(grid);
  if (!head) {
    throw new Error(
      "Не нашёл шапку реестра: нужны столбцы «Система/Номер черчежа» и «Вид работы». Это точно файл «Инспекция»?"
    );
  }

  const { headerRow, columns } = head;
  const cell = (row: unknown[], key: keyof typeof FIELDS) => {
    const c = columns[key];
    return c === undefined ? "" : row[c];
  };

  const rows: InspectionRow[] = [];
  let skipped = 0;
  // Клетки объекта и системы в файле слиты по вертикали: в нижних строках
  // блока они пустые, значение надо тянуть сверху.
  let lastBuilding = "";
  let lastSystem = "";
  let lastKind = "";

  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const building = text(cell(row, "building")) || lastBuilding;
    const systemRaw = text(cell(row, "system"));
    const kindRaw = text(cell(row, "workKind"));
    const system = systemRaw ? normalizeSystem(systemRaw) : lastSystem;
    const kind = kindRaw ? normalizeKind(kindRaw) : lastKind;

    const statusText = text(cell(row, "status"));
    const inspectionNo = text(cell(row, "inspectionNo"));

    // Пустая строка-подложка от слитых клеток: ничего своего в ней нет.
    if (!statusText && !inspectionNo && !systemRaw && !kindRaw && !text(cell(row, "fcn"))) continue;

    if (!building || !system || !kind) {
      skipped++;
      continue;
    }

    lastBuilding = building;
    lastSystem = system;
    lastKind = kind;

    const inspected = toDate(cell(row, "inspectedAt"));
    const smr = toDate(cell(row, "smrDoneAt"));

    rows.push({
      rowNo: text(cell(row, "rowNo")) || undefined,
      building,
      system,
      workKind: kind,
      rawKind: kindRaw || undefined,
      workPack: detectPack(kind),
      fcn: text(cell(row, "fcn")) || undefined,
      statusText: statusText || undefined,
      state: detectState(statusText),
      inspectionNo: inspectionNo || undefined,
      inspectedAt: inspected.date,
      inspectedText: inspected.raw,
      smrDoneAt: smr.date,
    });
  }

  return { sheet, sheets, headerRow, columns, rows, skipped };
}

/** Участок ИТД: ключ, по которому строки реестра собираются в пару «объект + система + вид работы». */
export const scopeKey = (row: { building: string; system: string; workKind: string }) =>
  `${row.building}\u0000${row.system}\u0000${row.workKind}`;

/**
 * Состояние участка по его строкам. Сдан участок только тогда, когда сдана
 * каждая инспекция: одна строка с замечаниями оставляет участок незакрытым.
 */
export function scopeState(states: ItdState[]): ItdState {
  if (!states.length) return ITD_STATE.REQUESTED;
  if (states.some((s) => s === ITD_STATE.REMARKS)) return ITD_STATE.REMARKS;
  if (states.every((s) => s === ITD_STATE.ACCEPTED)) return ITD_STATE.ACCEPTED;
  if (states.some((s) => s === ITD_STATE.ACCEPTED || s === ITD_STATE.PARTIAL)) return ITD_STATE.PARTIAL;
  return ITD_STATE.REQUESTED;
}
