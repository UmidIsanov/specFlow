import { PDFDocument } from "pdf-lib";

/**
 * Режет PDF на куски по N страниц.
 * Gemini срывается на длинном структурированном ответе: 23 плотные страницы КП
 * в один запрос вернули 2 строки с мусором. По частям — стабильно.
 */
export async function splitPdf(buf: Buffer, pagesPerChunk: number): Promise<{ pages: number; chunks: Buffer[] }> {
  const src = await PDFDocument.load(buf, { ignoreEncryption: true });
  const pages = src.getPageCount();
  if (pages <= pagesPerChunk) return { pages, chunks: [buf] };

  const chunks: Buffer[] = [];
  for (let start = 0; start < pages; start += pagesPerChunk) {
    const end = Math.min(pages, start + pagesPerChunk);
    const part = await PDFDocument.create();
    const copied = await part.copyPages(src, Array.from({ length: end - start }, (_, i) => start + i));
    for (const p of copied) part.addPage(p);
    chunks.push(Buffer.from(await part.save()));
  }
  return { pages, chunks };
}
