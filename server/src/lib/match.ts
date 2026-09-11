/**
 * Сопоставление позиций КП со спецификацией.
 * Задача: понять, что поставщик предложил — ровно то же, аналог или вообще не то.
 */

// Кириллические буквы, визуально совпадающие с латиницей: в артикулах их путают постоянно.
const LOOKALIKE: Record<string, string> = {
  А: "A", В: "B", Е: "E", К: "K", М: "M", Н: "H", О: "O",
  Р: "P", С: "C", Т: "T", У: "Y", Х: "X", І: "I", Ѕ: "S",
};

export function normalizeArticle(raw?: string | null): string {
  if (!raw) return "";
  const upper = raw.toUpperCase().trim();
  let out = "";
  for (const ch of upper) out += LOOKALIKE[ch] ?? ch;
  // артикул сравниваем без разделителей: ИП-212/3СУ == ИП212 3СУ
  return out.replace(/[^A-Z0-9А-ЯЁ]/g, "");
}

const STOP = new Set([
  "шт", "штук", "компл", "комплект", "для", "с", "и", "на", "в", "от", "до",
  "тип", "серия", "модель", "арт", "артикул", "производитель",
]);

export function normalizeName(raw?: string | null): string {
  if (!raw) return "";
  return raw
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9.,\-\/ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Ключ для сведения одинаковых позиций закупки, когда нет ни кода, ни артикула.
 * Убираем все разделители: в выгрузке из PDF у одного и того же товара
 * гуляют пробелы вокруг дефисов («Дюбель-гвоздь» и «Дюбель -гвоздь»).
 */
export function normalizeKey(raw?: string | null): string {
  return normalizeName(raw).replace(/[^a-zа-я0-9]/g, "");
}

export function tokenize(raw?: string | null): string[] {
  return normalizeName(raw)
    .split(/[\s,\/]+/)
    .map((t) => t.replace(/^[.\-]+|[.\-]+$/g, ""))
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/** Коэффициент Дайса по множествам токенов: 0..1 */
export function diceTokens(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter++;
  return (2 * inter) / (setA.size + setB.size);
}

// Организационно-правовые формы: в спецификации пишут «ООО "КБ Пожарной Автоматики"»,
// в КП — просто «КБ Пожарной Автоматики». Это одна и та же фирма.
const LEGAL_FORMS = new Set([
  "ооо", "оао", "зао", "пао", "ао", "ип", "нпо", "нпк", "гк", "тоо", "мчж", "хк", "сп", "уп",
  "llc", "ltd", "inc", "gmbh", "jsc", "co", "корпорация", "компания", "завод", "группа",
]);

/** Название фирмы без правовой формы и кавычек — для сравнения производителей. */
export function normalizeCompany(raw?: string | null): string {
  return normalizeName(raw)
    .split(/[\s.,]+/)
    .filter((t) => t && !LEGAL_FORMS.has(t))
    .join(" ")
    .trim();
}

export type Param = { value: number; unit: string };

// Порядок важен: длинные единицы первыми, иначе «7Ач» прочитается как «7А», а «4МП» как «4М».
const UNIT_RE =
  /(\d+(?:[.,]\d+)?)\s*(дюйм|vdc|vac|ггц|ghz|мгц|mhz|ач|ah|вт|мм|mm|см|cm|км|km|ip|дб|db|мп|mp|гб|gb|в|v|а|a|w|м|m|")/gi;

/** Числовые характеристики: 12В, 7Ач, IP65, 2МП — по ним видно, «тот же класс» или нет. */
export function extractParams(raw?: string | null): Param[] {
  if (!raw) return [];
  const src = raw.toLowerCase().replace(/ё/g, "е");
  const out: Param[] = [];
  for (const m of src.matchAll(UNIT_RE)) {
    const value = parseFloat(m[1].replace(",", "."));
    let unit = m[2].toLowerCase();
    // приводим синонимы единиц к одному виду
    if (["v", "vdc", "vac"].includes(unit)) unit = "в";
    if (unit === "a") unit = "а";
    if (unit === "ah") unit = "ач";
    if (unit === "w") unit = "вт";
    if (unit === "mm") unit = "мм";
    if (unit === "cm") unit = "см";
    if (unit === "m") unit = "м";
    if (unit === "km") unit = "км";
    if (unit === "db") unit = "дб";
    if (unit === "mp") unit = "мп";
    if (unit === "gb") unit = "гб";
    if (unit === "ghz") unit = "ггц";
    if (unit === "mhz") unit = "мгц";
    if (unit === '"' || unit === "дюйм") unit = "дюйм";
    if (Number.isFinite(value)) out.push({ value, unit });
  }
  return out;
}

export type ParamDiff = {
  unit: string;
  spec: number | null;
  offer: number | null;
  status: "equal" | "close" | "differs" | "missing";
};

/** Сравнение характеристик: ±5% считаем эквивалентом (7 Ач vs 7.2 Ач). */
export function compareParams(specRaw: string, offerRaw: string): ParamDiff[] {
  const byUnit = (list: Param[]) => {
    const m = new Map<string, number>();
    for (const p of list) if (!m.has(p.unit)) m.set(p.unit, p.value);
    return m;
  };
  const s = byUnit(extractParams(specRaw));
  const o = byUnit(extractParams(offerRaw));
  const units = new Set([...s.keys(), ...o.keys()]);
  const diffs: ParamDiff[] = [];
  for (const unit of units) {
    const sv = s.get(unit) ?? null;
    const ov = o.get(unit) ?? null;
    let status: ParamDiff["status"];
    if (sv === null || ov === null) status = "missing";
    else if (sv === ov) status = "equal";
    else {
      const base = Math.max(Math.abs(sv), Math.abs(ov)) || 1;
      status = Math.abs(sv - ov) / base <= 0.05 ? "close" : "differs";
    }
    diffs.push({ unit, spec: sv, offer: ov, status });
  }
  return diffs;
}

export type Candidate = {
  id: string;
  name: string;
  article?: string | null;
  code?: string | null;
  manufacturer?: string | null;
  unit?: string | null;
};

export type MatchResult = {
  specItemId: string | null;
  matchType: "EXACT" | "ANALOG" | "NONE";
  matchScore: number;
  verdict: "PENDING" | "OK" | "ANALOG_OK" | "ANALOG_RISK" | "REJECT";
  reasons: string[];
  paramDiffs: ParamDiff[];
};

function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

/** Похожесть строк по символьным биграммам — работает на артикулах вида РИП-12 исп.01/02. */
export function diceStrings(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return (2 * inter) / (A.size + B.size);
}

const PREFIX_MIN = 5;

/** Токены считаем совпавшими и при общем корне: «аккумулятор» ~ «аккумуляторная». */
function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < PREFIX_MIN || b.length < PREFIX_MIN) return false;
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i >= PREFIX_MIN;
}

function diceTokensFuzzy(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setA = [...new Set(a)];
  const setB = [...new Set(b)];
  const used = new Set<number>();
  let inter = 0;
  for (const ta of setA) {
    const idx = setB.findIndex((tb, i) => !used.has(i) && tokensMatch(ta, tb));
    if (idx >= 0) {
      used.add(idx);
      inter++;
    }
  }
  return (2 * inter) / (setA.length + setB.length);
}

const ANALOG_MIN = 0.45;
const SAFE_SCORE = 0.7;
const NAME_MIN_FOR_PARAM_BONUS = 0.3;

function scorePair(spec: Candidate, offer: Candidate) {
  const reasons: string[] = [];
  const sArt = normalizeArticle(spec.article);
  const oArt = normalizeArticle(offer.article);
  const sTok = tokenize(`${spec.name} ${spec.article ?? ""}`);
  const oTok = tokenize(`${offer.name} ${offer.article ?? ""}`);
  const nameSim = diceTokensFuzzy(sTok, oTok);

  let artSim = 0;
  let exact = false;

  // Код продукции из спецификации (RBZ-319538, FHF22531382) — самый надёжный признак:
  // он уникален у производителя и не зависит от того, как поставщик написал название.
  const sCode = normalizeArticle(spec.code);
  const oCode = normalizeArticle(offer.code);
  if (sCode && oCode && sCode === oCode) {
    return {
      score: 1,
      exact: true,
      reasons: ["Код продукции совпадает"],
      nameSim,
      paramDiffs: compareParams(`${spec.name} ${spec.article ?? ""}`, `${offer.name} ${offer.article ?? ""}`),
      hasDiffering: false,
      manufacturerDiffers: false,
    };
  }

  if (sArt && oArt) {
    if (sArt === oArt) {
      artSim = 1;
      exact = true;
      reasons.push("Артикул совпадает полностью");
    } else if (sArt.includes(oArt) || oArt.includes(sArt)) {
      artSim = 0.9;
      reasons.push("Артикул отличается модификацией (одно семейство)");
    } else {
      artSim = diceStrings(sArt, oArt);
      reasons.push(
        artSim >= 0.6
          ? `Артикул близкий, но не тот: ${spec.article} → ${offer.article}`
          : `Артикулы разные: ${spec.article} → ${offer.article}`
      );
    }
  }

  // Есть артикулы у обеих сторон — они и есть главный признак; иначе судим по названию.
  let score = sArt && oArt ? 0.6 * artSim + 0.4 * nameSim : nameSim;
  if (exact) score = 1;

  const paramDiffs = compareParams(
    `${spec.name} ${spec.article ?? ""}`,
    `${offer.name} ${offer.article ?? ""}`
  );
  const shared = paramDiffs.filter((d) => d.status !== "missing");
  const hasDiffering = paramDiffs.some((d) => d.status === "differs");

  // Совпавшие технические характеристики вытягивают позицию, у которой разошлись артикулы.
  if (!exact && shared.length > 0 && !hasDiffering && nameSim >= NAME_MIN_FOR_PARAM_BONUS) {
    score = Math.min(0.95, score + 0.25);
    reasons.push(`Технические характеристики совпадают (${shared.map((d) => d.unit).join(", ")})`);
  }

  const sMan = normalizeCompany(spec.manufacturer);
  const oMan = normalizeCompany(offer.manufacturer);
  let manufacturerDiffers = false;
  if (sMan && oMan) {
    const sameCompany =
      sMan === oMan ||
      sMan.includes(oMan) ||
      oMan.includes(sMan) ||
      diceStrings(sMan.replace(/\s/g, ""), oMan.replace(/\s/g, "")) >= 0.85;
    if (sameCompany) {
      score = Math.min(1, score + 0.1);
      reasons.push("Производитель тот же");
    } else {
      manufacturerDiffers = true;
      reasons.push(`Производитель другой: ${spec.manufacturer} → ${offer.manufacturer}`);
    }
  }

  if (nameSim >= 0.6) reasons.push(`Наименование совпадает на ${Math.round(nameSim * 100)}%`);
  // Балл 1.0 закреплён за точным совпадением кода или артикула: иначе набор бонусов
  // подтягивает похожую позицию вплотную, и «РМ-4-R3» перебивает «РМ-4К-R3».
  return {
    score: exact ? 1 : Math.min(0.99, score),
    exact,
    reasons,
    nameSim,
    paramDiffs,
    hasDiffering,
    manufacturerDiffers,
  };
}

/** Ищет для строки КП лучшую позицию спецификации и сразу предлагает вердикт инженеру. */
export function matchOfferItem(offer: Candidate, specItems: Candidate[]): MatchResult {
  let best: (ReturnType<typeof scorePair> & { item: Candidate }) | null = null;

  for (const spec of specItems) {
    const r = scorePair(spec, offer);
    const better = !best || r.score > best.score || (r.score === best.score && r.exact && !best.exact);
    if (better) best = { ...r, item: spec };
  }

  if (!best || best.score < ANALOG_MIN) {
    return {
      specItemId: null,
      matchType: "NONE",
      matchScore: best?.score ?? 0,
      verdict: "PENDING",
      reasons: ["Позиция не найдена в спецификации — проверить вручную"],
      paramDiffs: [],
    };
  }

  const reasons = [...best.reasons];
  const unitMismatch =
    !!best.item.unit && !!offer.unit && normalizeName(best.item.unit) !== normalizeName(offer.unit);
  if (unitMismatch) reasons.push(`Единица измерения не совпадает: ${best.item.unit} / ${offer.unit}`);

  if (best.exact && !best.hasDiffering && !unitMismatch) {
    return {
      specItemId: best.item.id,
      matchType: "EXACT",
      matchScore: best.score,
      verdict: "OK",
      reasons,
      paramDiffs: best.paramDiffs,
    };
  }

  for (const d of best.paramDiffs) {
    if (d.status === "differs") reasons.push(`Характеристика ${d.unit}: проект ${d.spec} → КП ${d.offer}`);
  }

  // Другой артикул от другого производителя годным сам себя объявить не может:
  // так «КПСЭнг» (экранированный) незаметно подменяется на «КПСнг» (без экрана).
  const risky =
    best.hasDiffering || unitMismatch || best.score < SAFE_SCORE || best.manufacturerDiffers;
  return {
    specItemId: best.item.id,
    matchType: "ANALOG",
    matchScore: best.score,
    verdict: risky ? "ANALOG_RISK" : "ANALOG_OK",
    reasons,
    paramDiffs: best.paramDiffs,
  };
}
