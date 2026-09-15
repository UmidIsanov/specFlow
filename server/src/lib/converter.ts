import type { RawRow } from "./xlsx.js";

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
  items: ConverterItem[];
  error?: string | null;
};

export type ConvertedDocument = {
  docNumber: string;
  objectName: string;
  systemName: string;
  supplier: string;
  currency: string;
  rows: RawRow[];
};

const POLL_MS = 1500;
const TIMEOUT_MS = 6 * 60 * 1000;

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

/** Отправляет PDF в конвертер и ждёт результат. Бросает понятную ошибку, если конвертер недоступен. */
export async function convertPdf(buf: Buffer, filename: string, mode: ConverterMode): Promise<ConvertedDocument> {
  const base = converterUrl();

  const fd = new FormData();
  fd.append("files", new Blob([new Uint8Array(buf)], { type: "application/pdf" }), filename);
  fd.append("mode", mode);

  let started: Response;
  try {
    started = await fetch(`${base}/api/convert`, { method: "POST", body: fd });
  } catch {
    throw new Error("Конвертер сканов не запущен. Запустите его: cd converter && bash start.sh");
  }
  const startBody = (await started.json().catch(() => ({}))) as { job_id?: string; detail?: string };
  if (!started.ok || !startBody.job_id) {
    throw new Error(startBody.detail ?? `Конвертер вернул ошибку ${started.status}`);
  }

  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const res = await fetch(`${base}/api/job/${startBody.job_id}`);
    if (!res.ok) throw new Error("Конвертер потерял задачу распознавания");
    const job = (await res.json()) as { status: string; result?: ConverterResult };
    if (job.status !== "done") continue;
    if (!job.result) throw new Error("Конвертер вернул пустой результат");
    if (job.result.error) throw new Error(`Распознавание не удалось: ${job.result.error}`);
    return {
      docNumber: job.result.doc_number ?? "",
      objectName: job.result.object_name ?? "",
      systemName: job.result.system_name ?? "",
      supplier: job.result.supplier ?? "",
      currency: job.result.currency ?? "",
      rows: toRows(job.result),
    };
  }
  throw new Error("Распознавание заняло слишком много времени");
}
