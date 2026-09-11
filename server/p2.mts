import { readFileSync } from "node:fs";
import { extractLines } from "./src/lib/pdf.js";
const { lines } = await extractLines(readFileSync("/Users/umid/Downloads/Заявка_6450_рев_2_ПГО.pdf"));
const data = lines.filter((l) => l.page >= 2);
const hist = new Map<number, { n: number; sample: string[] }>();
for (const l of data)
  for (const c of l.cells) {
    const k = Math.round(c.x);
    const e = hist.get(k) ?? { n: 0, sample: [] };
    e.n++;
    if (e.sample.length < 2) e.sample.push(c.text.slice(0, 34));
    hist.set(k, e);
  }
const rows = [...hist.entries()].sort((a, b) => a[0] - b[0]);
console.log("уникальных x:", rows.length, "| всего элементов:", data.reduce((s, l) => s + l.cells.length, 0));
for (const [x, e] of rows) if (e.n >= 20) console.log(String(x).padStart(4), String(e.n).padStart(5), "|", e.sample.join(" ⁄ "));
console.log("\nмелкие кластеры (<20):", rows.filter(([, e]) => e.n < 20).map(([x, e]) => `${x}:${e.n}`).join(" "));
