import { readFileSync } from "node:fs";
import { extractPdf } from "./src/lib/pdf.js";
const d = await extractPdf(readFileSync("/Users/umid/Downloads/Заявка_6450_рев_2_ПГО.pdf"));
console.log("колонок:", d.columnEdges.length - 1);
for (const p of [1, 2, 3]) {
  const r = d.rowEdges.get(p) ?? [];
  console.log(`страница ${p}: горизонтальных границ ${r.length}`, r.slice(0, 8).join(" "));
}
