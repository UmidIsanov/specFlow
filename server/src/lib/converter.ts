import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RawRow } from "./xlsx.js";
import { splitPdf } from "./pdfSplit.js";

/**
 * Мост к конвертеру (Go + Gemini): сканы без текстового слоя распознаются там.
 * Конвертер принимает PDF, возвращает job_id, результат забираем опросом.
 */

export type ConverterMode = "spec" | "kp";

type ConverterItem = {
  section?: string;
  pos?: string;
  name: string;
  type_code?: string;
  product_code?: string;
  supplier?: string;
  unit?: string;
  quantity?: number | null;
  note?: string;
  datasheet?: string;
  price?: number | null;
  total?: number | null;
};

type ConverterResult = {
  filename: string;
  mode: string;
  doc_number: string;
  object_name: string;
  system_name: string;
  supplier?: string;
  currency?: string;
  declared_total?: number | null;
  usage?: { model: string; input: number; output: number; total: number } | null;
  items: ConverterItem[];
  error?: string | null;
};

export type ConverterUsage = { model: string; requests: number; input: number; output: number; total: number };

export type ConvertedDocument = {
  docNumber: string;
  objectName: string;
  systemName: string;
  supplier: string;
  currency: string;
  declaredTotal?: number;
  rows: RawRow[];
  /** Что стоит перепроверить глазами: распознавание — не гарантия. */
  warnings: string[];
  /** Сколько токенов ушло на документ — по ним считается цена. */
  usage: ConverterUsage;
};

/**
 * Контроль распознанного КП: строки без цены и расхождение суммы строк с итогом документа.
 * На реальном скане Gemini потерял цену в 2 строках из 71 — итог это сразу показал.
 */
export function checkRecognizedOffer(rows: RawRow[], declaredTotal?: number): string[] {
  const warnings: string[] = [];
  const noPrice = rows.filter((r) => (r.qty ?? 0) > 0 && !(r.price && r.price > 0));
  if (noPrice.length) {
    warnings.push(
      `Не распознана цена в ${noPrice.length} стр.: ${noPrice.map((r) => `№${r.pos ?? "?"}`).slice(0, 8).join(", ")}${noPrice.length > 8 ? "…" : ""}`
    );
  }
  if (declaredTotal && declaredTotal > 0) {
    const sum = rows.reduce((acc, r) => acc + (r.qty ?? 0) * (r.price ?? 0), 0);
    const diff = sum - declaredTotal;
    if (Math.abs(diff) > Math.max(1, declaredTotal * 0.0005)) {
      warnings.push(
        `Сумма строк ${Math.round(sum).toLocaleString("ru-RU")} не сходится с итогом документа ${Math.round(declaredTotal).toLocaleString("ru-RU")} (разница ${Math.round(diff).toLocaleString("ru-RU")})`
      );
    }
  }
  return warnings;
}

const POLL_MS = 1500;
const TIMEOUT_MS = 6 * 60 * 1000;
// страниц в одном запросе к Gemini: больше — выше риск срыва ответа
const CHUNK_PAGES = 5;
// бесплатный тариф Gemini считает запросы в минуту: по умолчанию строго по одному
const PARALLEL = Number(process.env.CONVERTER_PARALLEL ?? 1);
const CHUNK_ATTEMPTS = 2;
// символы вне кириллицы/латиницы/пунктуации — признак «поплывшего» ответа модели
const GARBAGE = /[^\u0000-\u024F\u0400-\u04FF\u2000-\u206F\u20A0-\u20CF\u2100-\u214F\u2190-\u21FF\u2200-\u22FF\u2500-\u25FF\s°±×÷№…«»„“”‘’•·]/u;

// Распознанный документ хранится по хэшу: повторная загрузка того же файла — бесплатно
const CACHE_DIR = process.env.RECOGNITION_CACHE_DIR ?? join(process.cwd(), "data", "recognized");

function cachePath(buf: Buffer, mode: ConverterMode): string {
  return join(CACHE_DIR, `${createHash("sha256").update(buf).digest("hex")}-${mode}.json`);
}

export function converterUrl(): string {
  return (process.env.CONVERTER_URL ?? "http://127.0.0.1:8137").replace(/\/$/, "");
}

export async function converterStatus(): Promise<{ available: boolean; keyConfigured: boolean }> {
  try {
    const res = await fetch(`${converterUrl()}/api/health`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return { available: false, keyConfigured: false };
    const data = (await res.json()) as { ok?: boolean; key_configured?: boolean };
    return { available: !!data.ok, keyConfigured: !!data.key_configured };
  } catch {
    return { available: false, keyConfigured: false };
  }
}

const s = (v?: string | null) => {
  const t = (v ?? "").replace(/\s+/g, " ").trim();
  return t || undefined;
};
const n = (v?: number | null) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

function toRows(result: ConverterResult): RawRow[] {
  return result.items
    .filter((i) => i.name && i.name.trim())
    .map((i) => ({
      pos: s(i.pos),
      name: i.name.replace(/\s+/g, " ").trim(),
      article: s(i.type_code),
      code: s(i.product_code),
      manufacturer: s(i.supplier),
      unit: s(i.unit) ?? "шт",
      qty: n(i.quantity),
      price: n(i.price),
      note: s(i.note),
      section: s(i.section),
      datasheet: s(i.datasheet),
      building: s(result.object_name),
      docRef: s(result.doc_number),
      system: s(result.system_name),
    }));
}

/** Ошибки Gemini — в слова, понятные тому, кто нажал «Импортировать». */
function friendlyError(message: string): string {
  if (/prepayment credits|RESOURCE_EXHAUSTED|billing/i.test(message)) {
    return "Закончились средства на ключе Gemini — пополните баланс в Google AI Studio и повторите";
  }
  if (/недоступен после|503|deadline|timeout|Client.Timeout/i.test(message)) {
    return "Gemini сейчас не отвечает (перегружен или недоступен) — повторите через несколько минут";
  }
  if (/API key not valid|API_KEY_INVALID|PERMISSION_DENIED/i.test(message)) {
    return "Ключ Gemini не принят — проверьте GEMINI_API_KEY в converter/.env";
  }
  return message;
}

/** Чем больше строк с числами — тем лучше результат; так выбираем лучший из попыток. */
function score(r: ConverterResult | null): number {
  if (!r) return -1;
  const priced = r.items.filter((i) => (i.quantity ?? 0) > 0 && (i.price ?? 0) > 0).length;
  return priced * 2 + r.items.length;
}

/**
 * Кусок распознан правдоподобно? На плотных сканах модель иногда возвращает одну строку
 * и останавливается — такой результат лучше переспросить, чем принять.
 */
function plausible(result: ConverterResult, pages: number, mode: ConverterMode): boolean {
  const rows = result.items.length;
  if (mode !== "kp") return rows > 0;
  if (rows === 0) return false;
  // таблица на N страниц не может состоять из одной строки — значит, прочиталась не вся
  if (rows < pages) return false;
  // в КП у строки с количеством есть цена; если её нет у половины — колонка не прочитана
  const priced = result.items.filter((i) => (i.quantity ?? 0) > 0 && (i.price ?? 0) > 0).length;
  const withQty = result.items.filter((i) => (i.quantity ?? 0) > 0).length;
  if (withQty > 0 && priced === 0) return false;
  if (withQty >= 3 && priced < withQty * 0.5) return false;
  // номера строк должны идти подряд
  const nums = result.items.map((i) => Number(i.pos)).filter((x) => Number.isInteger(x));
  if (nums.length >= 3) {
    let gaps = 0;
    for (let i = 1; i < nums.length; i++) if (nums[i] - nums[i - 1] > 1) gaps++;
    if (gaps > Math.max(1, nums.length * 0.1)) return false;
  }
  return true;
}

/** Один запрос к конвертеру: отправить PDF, дождаться результата. */
// Первый заход — без «размышлений» (в разы дешевле); если результат неправдоподобен —
// повтор с бюджетом: дороже, но точнее. Токены считаем по всем попыткам.
const RETRY_THINKING = 1024;
// последняя ступень — сильная модель; дорого, поэтому только когда дешёвые не справились,
// только для целых кусков (не постранично) и не больше двух раз на документ
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL ?? "gemini-pro-latest";
const FALLBACK_MAX_PER_DOC = Number(process.env.GEMINI_FALLBACK_MAX ?? 10);
// pro-модель работает только с размышлениями: с нулевым бюджетом отвечает 400
const FALLBACK_THINKING = Number(process.env.GEMINI_FALLBACK_THINKING ?? 4096);
type UsageSink = { requests: number; input: number; output: number; total: number; model: string };

async function convertOne(
  buf: Buffer,
  filename: string,
  mode: ConverterMode,
  thinking?: number,
  sink?: UsageSink,
  model?: string
): Promise<ConverterResult> {
  const base = converterUrl();

  const fd = new FormData();
  fd.append("files", new Blob([new Uint8Array(buf)], { type: "application/pdf" }), filename);
  fd.append("mode", mode);
  if (thinking !== undefined) fd.append("thinking", String(thinking));
  if (model) fd.append("model", model);

  let started: Response;
  try {
    started = await fetch(`${base}/api/convert`, { method: "POST", body: fd });
  } catch {
    throw new Error("Конвертер сканов не запущен. Запустите его: cd converter && bash start.sh");
  }
  const startBody = (await started.json().catch(() => ({}))) as { job_id?: string; detail?: string };
  if (!started.ok || !startBody.job_id) {
    throw new Error(friendlyError(startBody.detail ?? `Конвертер вернул ошибку ${started.status}`));
  }

  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const res = await fetch(`${base}/api/job/${startBody.job_id}`);
    if (!res.ok) throw new Error("Конвертер потерял задачу распознавания");
    const job = (await res.json()) as { status: string; result?: ConverterResult };
    if (job.status !== "done") continue;
    if (!job.result) throw new Error("Конвертер вернул пустой результат");
    if (job.result.usage && sink) {
      sink.requests++;
      sink.input += job.result.usage.input;
      sink.output += job.result.usage.output;
      sink.total += job.result.usage.total;
      sink.model = sink.model || job.result.usage.model;
    }
    if (job.result.error) throw new Error(`Распознавание не удалось: ${friendlyError(job.result.error)}`);
    return job.result;
  }
  throw new Error("Распознавание заняло слишком много времени");
}

const SYSTEM_LABEL = /^(Система|System)\s*(\d+)(.*)$/i;

/**
 * Склейка результатов по кускам.
 * Строка, разрезанная границей страницы, приходит дважды с одним «№» — сливаем.
 * Нумерация блоков «Система N» в каждом куске начинается заново — сдвигаем.
 */
function mergeChunks(parts: ConverterResult[]): ConverterResult {
  const merged: ConverterResult = { ...parts[0], items: [] };
  let systemOffset = 0;
  let lastSystemInPrev = 0;

  for (const part of parts) {
    if (!merged.doc_number && part.doc_number) merged.doc_number = part.doc_number;
    if (!merged.supplier && part.supplier) merged.supplier = part.supplier;
    if (!merged.currency && part.currency) merged.currency = part.currency;
    if (part.declared_total) merged.declared_total = part.declared_total;
    if (!merged.object_name && part.object_name) merged.object_name = part.object_name;
    if (!merged.system_name && part.system_name) merged.system_name = part.system_name;

    // если кусок начинается не с «Hardware», это продолжение системы из прошлого куска
    const first = part.items[0];
    const firstLabel = first?.section?.match(SYSTEM_LABEL);
    const continues = !!firstLabel && !/hardware|аппарат/i.test(firstLabel[3] ?? "");
    systemOffset = continues ? Math.max(0, lastSystemInPrev - 1) : lastSystemInPrev;

    let maxInThisPart = 0;
    for (const item of part.items) {
      const label = item.section?.match(SYSTEM_LABEL);
      if (label) {
        const num = Number(label[2]) + systemOffset;
        maxInThisPart = Math.max(maxInThisPart, num);
        item.section = `Система ${num}${label[3] ?? ""}`;
      }
      const prev = merged.items[merged.items.length - 1];
      if (prev && item.pos && prev.pos === item.pos) {
        // хвост той же строки с соседней страницы
        prev.name = `${prev.name} ${item.name}`.replace(/\s+/g, " ").trim();
        prev.note = [prev.note, item.note].filter(Boolean).join(" ") || prev.note;
        prev.datasheet = prev.datasheet || item.datasheet;
        prev.quantity = prev.quantity ?? item.quantity;
        prev.price = prev.price ?? item.price;
        prev.total = prev.total ?? item.total;
        continue;
      }
      // та же строка пришла из соседнего куска ещё раз — не дублируем
      const twin = item.pos ? merged.items.find((m) => m.pos === item.pos) : undefined;
      if (twin && twin.name.slice(0, 30) === item.name.slice(0, 30)) {
        twin.section = twin.section || item.section;
        twin.datasheet = twin.datasheet || item.datasheet;
        twin.price = twin.price ?? item.price;
        twin.total = twin.total ?? item.total;
        continue;
      }
      merged.items.push(item);
    }
    if (maxInThisPart) lastSystemInPrev = maxInThisPart;
  }
  return merged;
}

const PART_OF: Array<[RegExp, string]> = [
  [/hardware|аппаратн/i, "Hardware"],
  [/software|программн|рабочая станция|workstation|scada|\bПО\b|конфигурац/i, "Software"],
  [/cabinet|шкаф/i, "Cabinet"],
];

/**
 * Блоки систем — по структуре, а не по нумерации модели: она сбивается на кусках.
 * Новая система начинается там, где после другого раздела снова идёт Hardware.
 * Строки после последнего блока без раздела — «Общее» (HMI, услуги, доставка).
 */
export function normalizeSystemBlocks(items: ConverterItem[]): void {
  const partOf = (section?: string) => PART_OF.find(([re]) => re.test(section ?? ""))?.[1];
  // у одиночных страниц заголовков нет — блок узнаём и по повтору первой строки документа
  const head = (items[0]?.name ?? "").slice(0, 30).toLowerCase();
  const isStart = (item: ConverterItem, k: number) =>
    k === 0 ||
    (partOf(item.section) === "Hardware" && partOf(items[k - 1]?.section) !== "Hardware") ||
    (head.length >= 10 && item.name.slice(0, 30).toLowerCase() === head && k > 0);
  const starts = items.filter((i, k) => isStart(i, k)).length;
  if (starts < 2) return;

  // после последнего шкафа идут общие позиции — HMI, услуги, доставка — без своего заголовка,
  // и модель приписывает их к шкафу; отсчитываем от последней настоящей позиции шкафа
  const GENERAL = /\bHMI\b|услуг|services|packing|доставк|delivery|ПНР|commissioning/i;
  let lastCabinet = -1;
  items.forEach((i, k) => {
    if (partOf(i.section) === "Cabinet" && !GENERAL.test(i.name)) lastCabinet = k;
  });

  let system = 0;
  let lastPart: string | undefined;
  let inBlock = false;
  items.forEach((item, k) => {
    if (lastCabinet >= 0 && k > lastCabinet && GENERAL.test(item.name)) {
      item.section = "Общее";
      return;
    }
    let part = partOf(item.section);
    if (isStart(item, k)) {
      system++;
      inBlock = true;
      part = "Hardware";
    }
    if (part) {
      item.section = `Система ${system} · ${part}`;
      lastPart = part;
    } else if (inBlock && (item.section ?? "").trim() === "") {
      // без раздела после блока: продолжение той же части или общие позиции в конце
      item.section = lastPart === "Cabinet" ? "Общее" : `Система ${system} · ${lastPart ?? "Hardware"}`;
      if (lastPart === "Cabinet") inBlock = false;
    } else if (inBlock) {
      // раздел назван как-то по-своему — это всё та же часть текущей системы
      item.section = `Система ${system} · ${lastPart ?? "Hardware"}`;
    } else if (!inBlock && !item.section) {
      item.section = "Общее";
    }
  });
}

/**
 * Отправляет PDF в конвертер и ждёт результат; длинные документы — по кускам.
 * Бросает понятную ошибку, если конвертер недоступен.
 */
export type ProgressReport = (p: { stage: string; done: number; total: number }) => void;

export async function convertPdf(
  buf: Buffer,
  filename: string,
  mode: ConverterMode,
  report: ProgressReport = () => {}
): Promise<ConvertedDocument> {
  const cached = cachePath(buf, mode);
  if (existsSync(cached)) {
    report({ stage: "Файл уже распознавали — беру из кэша", done: 1, total: 1 });
    const doc = JSON.parse(readFileSync(cached, "utf8")) as ConvertedDocument;
    doc.warnings = [...doc.warnings, "Взято из кэша распознавания — токены не тратились"];
    doc.usage = { ...doc.usage, requests: 0, input: 0, output: 0, total: 0 };
    return doc;
  }
  const doc = await convertUncached(buf, filename, mode, report);
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(cached, JSON.stringify(doc));
  } catch {
    // кэш — удобство, не обязанность
  }
  return doc;
}

async function convertUncached(
  buf: Buffer,
  filename: string,
  mode: ConverterMode,
  report: ProgressReport
): Promise<ConvertedDocument> {
  report({ stage: "Готовлю страницы для распознавания", done: 0, total: 0 });
  const { pages, chunks } = await splitPdf(buf, CHUNK_PAGES);
  const base = filename.replace(/\.pdf$/i, "");
  let finished = 0;
  const label = (n: number) => `${n} ${n === 1 ? "страница" : n < 5 ? "страницы" : "страниц"}`;
  report({ stage: `Распознаю скан: ${label(pages)}, ${chunks.length === 1 ? "один запрос" : `${chunks.length} частей`}`, done: 0, total: chunks.length });

  const usage: UsageSink = { requests: 0, input: 0, output: 0, total: 0, model: "" };

  // кусок: сначала дёшево, потом с размышлениями; возвращаем лучший результат из попыток
  let fallbackUsed = 0;
  const convertWithRetry = async (part: Buffer, name: string, pageCount: number, allowFallback = true): Promise<ConverterResult | null> => {
    let best: ConverterResult | null = null;
    let lastErr: unknown = null;
    // ступени: дёшево → с размышлениями → сильная модель (с лимитом на документ)
    const steps: Array<{ thinking?: number; model?: string }> = [{}, { thinking: RETRY_THINKING }];
    if (allowFallback && FALLBACK_MODEL && fallbackUsed < FALLBACK_MAX_PER_DOC) {
      steps.push({ model: FALLBACK_MODEL, thinking: FALLBACK_THINKING });
    }
    for (const step of steps) {
      if (step.model) fallbackUsed++;
      try {
        const r = await convertOne(part, name, mode, step.thinking, usage, step.model);
        if (score(r) > score(best)) best = r;
        if (plausible(r, pageCount, mode)) return r;
      } catch (err) {
        lastErr = err;
        // деньги или ключ — повторять бессмысленно
        if (err instanceof Error && /Gemini|GEMINI_API_KEY/.test(err.message)) throw err;
      }
    }
    if (best) return best;
    throw lastErr instanceof Error ? lastErr : new Error("Распознавание не удалось");
  };

  const convertChunk = async (i: number): Promise<ConverterResult[]> => {
    const from = i * CHUNK_PAGES + 1;
    const to = Math.min(pages, (i + 1) * CHUNK_PAGES);
    const name = chunks.length > 1 ? `${base} (стр. ${from}-${to}).pdf` : filename;
    const whole = await convertWithRetry(chunks[i], name, to - from + 1).catch((err) => {
      if (to - from < 1) throw err;
      return null;
    });
    const done = () => {
      finished++;
      report({ stage: `Распознаю скан: часть ${finished} из ${chunks.length} готова`, done: finished, total: chunks.length });
    };
    if (whole && plausible(whole, to - from + 1, mode)) {
      done();
      return [whole];
    }
    if (to - from < 1) {
      done();
      return whole ? [whole] : [];
    }

    // кусок так и не прошёл — постранично, но берём то, что лучше: постранично или целиком
    report({ stage: `Страницы ${from}–${to} читаются плохо — разбираю по одной`, done: finished, total: chunks.length });
    const single = await splitPdf(chunks[i], 1);
    const perPage: ConverterResult[] = [];
    for (let j = 0; j < single.chunks.length; j++) {
      const r = await convertWithRetry(single.chunks[j], `${base} (стр. ${from + j}).pdf`, 1).catch(() => null);
      if (r) perPage.push(r);
    }
    done();
    const perPageScore = perPage.reduce((s, r) => s + score(r), 0);
    return whole && score(whole) >= perPageScore ? [whole] : perPage;
  };

  // по несколько кусков разом: конвертер сам переживает 429 с паузой
  const parts: ConverterResult[] = [];
  for (let i = 0; i < chunks.length; i += PARALLEL) {
    const batch = await Promise.all(
      Array.from({ length: Math.min(PARALLEL, chunks.length - i) }, (_, k) => convertChunk(i + k))
    );
    for (const b of batch) parts.push(...b);
  }
  if (process.env.CONVERTER_DEBUG_DIR) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(`${process.env.CONVERTER_DEBUG_DIR}/converter-${Date.now()}.json`, JSON.stringify(parts, null, 1));
  }
  report({ stage: "Собираю результат и проверяю", done: chunks.length, total: chunks.length });
  const result = chunks.length > 1 ? mergeChunks(parts) : parts[0];
  if (mode === "kp") normalizeSystemBlocks(result.items);

  const rows = toRows(result);
  const declaredTotal = n(result.declared_total);
  const warnings = mode === "kp" ? checkRecognizedOffer(rows, declaredTotal) : [];
  const garbage = rows.filter((r) => GARBAGE.test(`${r.name} ${r.unit ?? ""} ${r.article ?? ""}`));
  if (garbage.length) {
    warnings.unshift(`Похоже на сбой распознавания в ${garbage.length} стр.: ${garbage.map((r) => `№${r.pos ?? "?"}`).slice(0, 6).join(", ")} — сверьте с документом`);
  }
  if (pages > 2 && rows.length < pages) {
    warnings.unshift(`Распознано всего ${rows.length} строк на ${pages} страниц — вероятно, часть документа потеряна`);
  }

  return {
    docNumber: result.doc_number ?? "",
    objectName: result.object_name ?? "",
    systemName: result.system_name ?? "",
    supplier: result.supplier ?? "",
    currency: result.currency ?? "",
    declaredTotal,
    rows,
    warnings,
    usage,
  };
}
