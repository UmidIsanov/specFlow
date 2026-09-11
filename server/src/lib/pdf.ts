export type PdfCell = { text: string; x: number };
export type PdfLine = { y: number; page: number; cells: PdfCell[] };

export type PdfDoc = {
  pages: number;
  lines: PdfLine[];
  /** Вертикальные линии сетки таблицы — точные границы колонок. */
  columnEdges: number[];
  /** Горизонтальные линии сетки по страницам — границы строк таблицы. */
  rowEdges: Map<number, number[]>;
};

type TextItem = { str: string; transform: number[] };

const EDGE_SAMPLE_PAGES = 6;

/** Вертикальные линии таблицы: рисуются вырожденными путями нулевой ширины. */
function collectEdges(
  ops: { fnArray: number[]; argsArray: unknown[] },
  OPS: Record<string, number>,
  into: Map<number, number>,
  horizontal?: Set<number>
) {
  for (let i = 0; i < ops.fnArray.length; i++) {
    if (ops.fnArray[i] !== OPS.constructPath) continue;
    const [pathOps, coords] = ops.argsArray[i] as [number[], number[]];
    let k = 0;
    const xs: number[] = [];
    const ys: number[] = [];
    for (const op of pathOps) {
      if (op === OPS.moveTo || op === OPS.lineTo) {
        xs.push(coords[k++]);
        ys.push(coords[k++]);
      } else if (op === OPS.curveTo) {
        k += 6;
      } else if (op === OPS.rectangle) {
        const x = coords[k++];
        const y = coords[k++];
        const w = coords[k++];
        const h = coords[k++];
        xs.push(x, x + w);
        ys.push(y, y + h);
      }
    }
    if (xs.length < 2) continue;
    const a = Math.min(...xs);
    const dx = Math.max(...xs) - a;
    const dy = Math.max(...ys) - Math.min(...ys);
    if (dx <= 1.2 && dy >= 2) {
      const key = Math.round(a);
      into.set(key, (into.get(key) ?? 0) + 1);
    } else if (horizontal && dy <= 1.2 && dx >= 2) {
      horizontal.add(Math.round(Math.min(...ys)));
    }
  }
}

/** Текстовый слой PDF по строкам плюс геометрия таблицы. */
export async function extractPdf(buf: Buffer): Promise<PdfDoc> {
  // legacy-сборка работает в Node без воркера
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const OPS = (pdfjs as unknown as { OPS: Record<string, number> }).OPS;
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buf),
    useSystemFonts: true,
    isEvalSupported: false,
    disableFontFace: true,
    verbosity: 0,
  }).promise;

  const lines: PdfLine[] = [];
  const edges = new Map<number, number>();
  const rowEdges = new Map<number, number[]>();

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = (content.items as TextItem[]).filter((i) => i.str && i.str.trim());

    // элементы одной строки таблицы стоят на близких y
    const buckets = new Map<number, PdfCell[]>();
    for (const it of items) {
      const y = Math.round(it.transform[5]);
      let key = -1;
      for (const k of buckets.keys()) {
        if (Math.abs(k - y) <= 2) {
          key = k;
          break;
        }
      }
      if (key === -1) {
        key = y;
        buckets.set(key, []);
      }
      buckets.get(key)!.push({ text: it.str.trim(), x: it.transform[4] });
    }
    for (const [y, cells] of buckets) {
      cells.sort((a, b) => a.x - b.x);
      lines.push({ y, page: p, cells });
    }

    // вертикальные границы одинаковы на всех страницах, горизонтальные — свои у каждой
    const horizontal = new Set<number>();
    collectEdges(await page.getOperatorList(), OPS, p <= EDGE_SAMPLE_PAGES ? edges : new Map(), horizontal);
    rowEdges.set(p, [...horizontal].sort((a, b) => b - a));
  }

  lines.sort((a, b) => a.page - b.page || b.y - a.y);

  // граница засчитывается, если встретилась хотя бы на половине просмотренных страниц
  const sampled = Math.min(doc.numPages, EDGE_SAMPLE_PAGES);
  const columnEdges = [...edges.entries()]
    .filter(([, n]) => n >= Math.max(2, Math.ceil(sampled / 2)))
    .map(([x]) => x)
    .sort((a, b) => a - b);

  return { pages: doc.numPages, lines, columnEdges, rowEdges };
}
