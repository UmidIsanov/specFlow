import { readFileSync } from "node:fs";
const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync("/Users/umid/Downloads/Заявка_6450_рев_2_ПГО.pdf")), verbosity: 0 }).promise;
const page = await doc.getPage(2);
const ops = await page.getOperatorList();
const OPS = pdfjs.OPS;
const names: Record<number, string> = {};
for (const [k, v] of Object.entries(OPS)) names[v as number] = k;
const counts = new Map<string, number>();
for (const fn of ops.fnArray) counts.set(names[fn] ?? String(fn), (counts.get(names[fn] ?? String(fn)) ?? 0) + 1);
console.log("операторы:", [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k}=${v}`).join(" "));

const vx = new Map<number, number>();
for (let i = 0; i < ops.fnArray.length; i++) {
  if (ops.fnArray[i] !== OPS.constructPath) continue;
  const [pathOps, coords] = ops.argsArray[i];
  let k = 0, cx = 0, cy = 0, sx = 0, sy = 0;
  for (const op of pathOps) {
    if (op === OPS.moveTo) { cx = coords[k++]; cy = coords[k++]; sx = cx; sy = cy; }
    else if (op === OPS.lineTo) {
      const nx = coords[k++], ny = coords[k++];
      if (Math.abs(nx - cx) < 0.6 && Math.abs(ny - cy) > 3) { const key = Math.round(nx); vx.set(key, (vx.get(key) ?? 0) + 1); }
      cx = nx; cy = ny;
    } else if (op === OPS.curveTo) { k += 6; cx = coords[k - 2]; cy = coords[k - 1]; }
    else if (op === OPS.closePath) { cx = sx; cy = sy; }
    else if (op === OPS.rectangle) { const x = coords[k++], y = coords[k++], w = coords[k++], h = coords[k++]; if (Math.abs(w) < 1.5 && Math.abs(h) > 3) { const key = Math.round(x); vx.set(key, (vx.get(key) ?? 0) + 1); } }
  }
}
const sorted = [...vx.entries()].filter(([, n]) => n >= 2).sort((a, b) => a[0] - b[0]);
console.log("вертикальных границ:", sorted.length);
console.log(sorted.map(([x, n]) => `${x}(${n})`).join(" "));
