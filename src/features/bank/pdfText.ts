import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

// Some PDF generators emit every word and space as its own item; collapse the runs.
const joinRow = (row: string[]) => row.join(' ').replace(/\s+/g, ' ').trim();

/** PDF text with items on the same visual line (within 2pt) joined, top to bottom. */
export async function extractPdfText(file: File): Promise<string> {
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const out: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items = content.items
      .filter((it): it is Extract<typeof it, { str: string }> => 'str' in it)
      .map((it) => ({ s: it.str, x: it.transform[4] as number, y: it.transform[5] as number }))
      .sort((a, b) => (Math.abs(a.y - b.y) > 2 ? b.y - a.y : a.x - b.x));
    let row: string[] = [];
    let rowY: number | null = null;
    for (const it of items) {
      if (rowY === null || Math.abs(it.y - rowY) <= 2) {
        row.push(it.s);
        rowY ??= it.y;
      } else {
        out.push(joinRow(row));
        row = [it.s];
        rowY = it.y;
      }
    }
    if (row.length) out.push(joinRow(row));
  }
  return out.join('\n');
}
