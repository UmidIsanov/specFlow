/**
 * Номер заявки и ревизия из того, что уже есть в файле: имени и шапки документа.
 * Инженер не должен перепечатывать «6450 рев. 2» руками — номер стоит и в названии
 * файла («Заявка 8198_Лотки13.xlsx»), и в шапке таблицы («Заявка № 6450, ревизия 2»).
 */

export type DetectedRequest = { number?: string; revision?: number };

/**
 * Номер с привязкой к слову «заявка» — иначе в номер попадёт любая цифра из шапки.
 * Хвост слова пишем как [а-яё]*, а не \w*: \w в JS — только латиница и цифры.
 */
const NEAR_WORD = /заявк[а-яё]*\s*(?:на\s+[а-яёa-z]+\s*)?(?:№|n|#|no\.?)?\s*[-–—]?\s*(\d{2,8})/i;
/** Обратный порядок: «№ 4783 заявка», «к заявке 4783». */
const NUMBER_THEN_WORD = /(?:№|n|#)\s*(\d{2,8})\s*(?:[-–—]?\s*)?(?:к\s+)?заявк/i;
/** Отдельный номер в шапке: «№ 6450». Дату вида 03.11.2026 сюда не пускаем. */
const PLAIN_NUMBER = /(?:^|[^\d.,])(?:№|n[o°]?\.?)\s*(\d{3,8})(?![\d.,])/i;

const REVISION = /(?:рев(?:изи[яи])?|rev|изм(?:енени[ея])?)\.?\s*[-–—]?\s*(\d{1,2})\b/i;

/** Расширение и служебные подчёркивания мешают разбору — убираем их заранее. */
function normalize(text: string): string {
  return text
    .replace(/\.(xlsx?|xlsm|pdf|csv)$/i, " ")
    .replace(/[_\-–—]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Разбирает один кусок текста. Источники передаются по убыванию доверия:
 * имя файла обычно точнее шапки, где номеров бывает несколько.
 */
export function detectRequestNumber(...sources: (string | undefined | null)[]): DetectedRequest {
  const found: DetectedRequest = {};

  for (const raw of sources) {
    if (!raw) continue;
    const text = normalize(raw);

    if (!found.number) {
      const hit =
        text.match(NEAR_WORD) ?? text.match(NUMBER_THEN_WORD) ?? text.match(PLAIN_NUMBER);
      // Год в шапке («от 2026») за номер заявки не считаем.
      if (hit && !/^(19|20)\d{2}$/.test(hit[1])) found.number = hit[1];
    }

    if (found.revision === undefined) {
      const rev = text.match(REVISION);
      if (rev) {
        const n = Number(rev[1]);
        if (n >= 1 && n <= 99) found.revision = n;
      }
    }

    if (found.number && found.revision !== undefined) break;
  }

  return found;
}
