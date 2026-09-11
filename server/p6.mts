import { readFileSync } from "node:fs";
const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync("/Users/umid/Downloads/Заявка_6450_рев_2_ПГО.pdf")), verbosity: 0 }).promise;
const OPS = pdfjs.OPS;
const edges = new Map<number, number>();
for (let p = 2; p <= Math.min(doc.numPages, 6); p++) {
  const ops = await (await doc.getPage(p)).getOperatorList();
  for (let i = 0; i < ops.fnArray.length; i++) {
    if (ops.fnArray[i] !== OPS.constructPath) continue;
    const [pathOps, coords] = ops.argsArray[i];
    let k = 0; const xs: number[] = [], ys: number[] = [];
    for (const op of pathOps) {
      if (op === OPS.moveTo || op === OPS.lineTo) { xs.push(coords[k++]); ys.push(coords[k++]); }
      else if (op === OPS.curveTo) k += 6;
      else if (op === OPS.rectangle) { const x = coords[k++], y = coords[k++], w = coords[k++], h = coords[k++]; xs.push(x, x + w); ys.push(y, y + h); }
    }
    if (xs.length < 2) continue;
    const a = Math.min(...xs), b = Math.max(...xs);
    const dy = Math.max(...ys) - Math.min(...ys);
    if (b - a <= 1.2 && dy >= 2) { const key = Math.round(a); edges.set(key, (edges.get(key) ?? 0) + 1); }
  }
}
const list = [...edges.entries()].sort((a, b) => a[0] - b[0]);
console.log("границ:", list.length);
console.log(list.map(([x, n]) => `${x}(${n})`).join(" "));
