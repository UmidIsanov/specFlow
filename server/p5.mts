import { readFileSync } from "node:fs";
const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync("/Users/umid/Downloads/Заявка_6450_рев_2_ПГО.pdf")), verbosity: 0 }).promise;
const OPS = pdfjs.OPS;
const rects = new Map<string, number>();
for (let p = 2; p <= doc.numPages; p++) {
  const ops = await (await doc.getPage(p)).getOperatorList();
  for (let i = 0; i < ops.fnArray.length; i++) {
    if (ops.fnArray[i] !== OPS.constructPath) continue;
    const [pathOps, coords] = ops.argsArray[i];
    let k = 0; const xs: number[] = [];
    for (const op of pathOps) {
      if (op === OPS.moveTo || op === OPS.lineTo) { xs.push(coords[k++]); k++; }
      else if (op === OPS.curveTo) k += 6;
      else if (op === OPS.rectangle) { const x = coords[k++]; k++; const w = coords[k++]; k++; xs.push(x, x + w); }
    }
    if (!xs.length) continue;
    const a = Math.round(Math.min(...xs)), b = Math.round(Math.max(...xs));
    if (b - a > 400) continue; // полностраничный клип — не ячейка
    rects.set(`${a}..${b}`, (rects.get(`${a}..${b}`) ?? 0) + 1);
  }
}
const top = [...rects.entries()].filter(([, n]) => n >= 10).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
console.log("колонок найдено по clip-ячейкам:", top.length);
for (const [k, n] of top) console.log("  ", k.padEnd(12), n);
