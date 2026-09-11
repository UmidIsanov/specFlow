/**
 * Теговые номера приборов (402100-AIT-9001 TG, 401200-BIAS(F)-9003).
 * В заявке тэг стоит в отдельной строке, в КП — перечнем или диапазоном
 * внутри наименования: «401200-BIAS(F)-9001 ... 401200-BIAS(F)-9009».
 */

const DASHES = /[–—−]/g;

export function normalizeTag(raw?: string | null): string {
  if (!raw) return "";
  return raw
    .toUpperCase()
    .replace(DASHES, "-")
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*/g, "-")
    .trim();
}

/** Ключ для сверки: пробелы и суффикс исполнения игнорируем, всё остальное значимо. */
export function tagKey(raw?: string | null): string {
  return normalizeTag(raw).replace(/\s/g, "");
}

// «403300-UI-9101G..9105G» — у тэга бывает буквенный суффикс исполнения
const RANGE_SHORT = /^(.*?)(\d+)([A-ZА-Я]*)\.\.(\d+)([A-ZА-Я]*)$/;

function padTo(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

/**
 * Разворачивает диапазон в перечень тэгов.
 * Поддерживает «PREFIX-9001..9009» и «401200-HL-9006 ... 401200-HL-9014».
 */
export function expandTagSpec(spec: string): string[] {
  const value = normalizeTag(spec);
  if (!value) return [];

  const short = value.match(RANGE_SHORT);
  if (short) {
    const [, prefix, fromRaw, suffixA, toRaw, suffixB] = short;
    const from = Number(fromRaw);
    const to = Number(toRaw);
    const suffix = suffixA || suffixB;
    if (Number.isFinite(from) && Number.isFinite(to) && to >= from && to - from < 5000 && suffixA === suffixB) {
      const width = fromRaw.length;
      const out: string[] = [];
      for (let i = from; i <= to; i++) out.push(`${prefix}${padTo(i, width)}${suffix}`);
      return out;
    }
  }

  // «A ... B» — полный тэг с обеих сторон
  const parts = value.split(/\s*(?:\.\.\.|…)\s*/);
  if (parts.length === 2) {
    const a = parts[0].match(/^(.*?)(\d+)$/);
    const b = parts[1].match(/^(.*?)(\d+)$/);
    if (a && b && a[1] === b[1]) {
      const from = Number(a[2]);
      const to = Number(b[2]);
      if (to >= from && to - from < 5000) {
        const width = a[2].length;
        const out: string[] = [];
        for (let i = from; i <= to; i++) out.push(`${a[1]}${padTo(i, width)}`);
        return out;
      }
    }
  }

  return [value];
}

export function expandTagList(specs: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of specs) {
    for (const tag of expandTagSpec(s)) {
      const key = tagKey(tag);
      if (key && !seen.has(key)) {
        seen.add(key);
        out.push(tag);
      }
    }
  }
  return out;
}

// Тэг: объект-тип-номер, например 403300-JBA(F)-9110 или 402100-AIT-9001 TG
const TAG_IN_TEXT = /\b\d{4,6}-[A-ZА-Я][A-ZА-Я0-9]*(?:\([A-ZА-Я]\))?-\d{3,4}[A-ZА-Я]?\b/g;

/** Выбирает теговые номера прямо из наименования — так они записаны в КП. */
export function findTagsInText(text?: string | null): string[] {
  if (!text) return [];
  const value = normalizeTag(text);
  const found = value.match(TAG_IN_TEXT) ?? [];
  const ranges: string[] = [];

  // «401200-BIAS(F)-9001 ... 401200-BIAS(F)-9009» — разворачиваем в перечень
  const rangeRe = new RegExp(`(${TAG_IN_TEXT.source})\\s*(?:\\.\\.\\.|…)\\s*(${TAG_IN_TEXT.source})`, "g");
  for (const m of value.matchAll(rangeRe)) ranges.push(`${m[1]} ... ${m[2]}`);

  return expandTagList([...ranges, ...found]);
}
