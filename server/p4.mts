import { readFileSync } from "node:fs";
const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync("/Users/umid/Downloads/Заявка_6450_рев_2_ПГО.pdf")), verbosity: 0 }).promise;
const page = await doc.getPage(2);
const ops = await page.getOperatorList();
const OPS = pdfjs.OPS;
const rects = new Map<string, number>();
for (let i = 0; i < ops.fnArray.length; i++) {
  if (ops.fnArray[i] !== OPS.constructPath) continue;
  const [pathOps, coords] = ops.argsArray[i];
  let k = 0;
  const xs: number[] = [], ys: number[] = [];
  for (const op of pathOps) {
    if (op === OPS.moveTo || op === OPS.lineTo) { xs.push(coords[k++]); ys.push(coords[k++]); }
    else if (op === OPS.curveTo) { k += 6; }
    else if (op === OPS.rectangle) { const x = coords[k++], y = coords[k++], w = coords[k++], h = coords[k++]; xs.push(x, x + w); ys.push(y, y + h); }
  }
  if (!xs.length) continue;
  const key = `${Math.round(Math.min(...xs))}..${Math.round(Math.max(...xs))}`;
  rects.set(key, (rects.get(key) ?? 0) + 1);
}
const top = [...rects.entries()].sort((a, b) => b[1] - a[1]).filter(([, n]) => n >= 5);
console.log("clip-прямоугольников (уникальных по x):", rects.size, "| частых:", top.length);
for (const [k, n] of top.sort((a, b) => parseInt(a[0]) - parseInt(b[0]))) console.log("  ", k.padEnd(14), n);
