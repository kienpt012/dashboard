import type { LayoutPage, LayoutSpan } from './source-locator';

// Đọc bố cục chữ của PDF (lớp chữ) thành các đoạn liền có khung toạ độ, phục vụ định vị và tô sáng nguồn.
// pdf.js cắt một dòng thành nhiều mảnh (mỗi lần đổi phông, khoảng trắng…); các mảnh cùng dòng nằm sát nhau được gộp
// lại để một ô bảng thành một đoạn liền.

type TextItem = { str: string; transform: number[]; width: number; height: number };
type PdfPage = {
  getViewport(options: { scale: number }): { width: number; height: number; convertToViewportPoint(x: number, y: number): number[] };
  getTextContent(): Promise<{ items: (TextItem | { type: string })[] }>;
};
type PdfDocument = { numPages: number; getPage(pageNumber: number): Promise<PdfPage> };

const round = (value: number) => Math.round(value * 10_000) / 10_000;

/** Gộp các mảnh chữ cùng dòng, sát nhau (khoảng cách ngang ≤ maxGap, theo tỉ lệ bề rộng trang). */
export function mergeSpans(spans: LayoutSpan[], maxGap = 0.012): LayoutSpan[] {
  const sorted = [...spans].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const lines: LayoutSpan[][] = [];
  for (const span of sorted) {
    const height = span[3] - span[1];
    const line = lines.find(entry => {
      const last = entry[entry.length - 1];
      return Math.abs((last[1] + last[3]) / 2 - (span[1] + span[3]) / 2) < Math.max(height, last[3] - last[1]) * 0.5;
    });
    if (line) line.push(span);
    else lines.push([span]);
  }
  const merged: LayoutSpan[] = [];
  for (const line of lines) {
    line.sort((a, b) => a[0] - b[0]);
    let current: LayoutSpan | null = null;
    for (const span of line) {
      if (current && span[0] - current[2] <= maxGap) {
        const gap: number = span[0] - current[2];
        current = [current[0], Math.min(current[1], span[1]), Math.max(current[2], span[2]), Math.max(current[3], span[3]), `${current[4]}${gap > 0.0025 ? ' ' : ''}${span[4]}`];
      } else {
        if (current) merged.push(current);
        current = [...span] as LayoutSpan;
      }
    }
    if (current) merged.push(current);
  }
  return merged.map(span => [round(span[0]), round(span[1]), round(span[2]), round(span[3]), span[4].replace(/\s+/g, ' ').trim()] as LayoutSpan).filter(span => span[4]);
}

/**
 * Bố cục một trang PDF từ lớp chữ (toạ độ chuẩn hoá 0..1, gốc trên-trái của trang như khi hiển thị). Đổi toạ độ qua
 * khung nhìn của pdf.js nên đúng cả với trang xoay (/Rotate) và trang có gốc MediaBox lệch — trình xem trên web vẽ
 * trang bằng chính khung nhìn đó nên khung tô sáng trùng khít.
 */
export async function pdfPageSpans(page: PdfPage): Promise<LayoutSpan[]> {
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const spans: LayoutSpan[] = [];
  for (const raw of content.items) {
    if (!('str' in raw) || !raw.str.trim()) continue;
    const [, , c, d, e, f] = raw.transform;
    const size = Math.hypot(c, d) || raw.height || 10;
    // Hộp chữ trong không gian PDF: từ chân chữ (thụt xuống phần đuôi chữ) tới đỉnh chữ.
    const [ax, ay] = viewport.convertToViewportPoint(e, f - size * 0.2);
    const [bx, by] = viewport.convertToViewportPoint(e + raw.width, f + size * 0.85);
    const x0 = Math.min(ax, bx) / viewport.width;
    const x1 = Math.max(ax, bx) / viewport.width;
    const y0 = Math.min(ay, by) / viewport.height;
    const y1 = Math.max(ay, by) / viewport.height;
    spans.push([x0, y0, Math.max(x1, x0 + 0.002), Math.max(y1, y0 + 0.002), raw.str]);
  }
  return mergeSpans(spans);
}

/** Bố cục các trang của một PDF (đã mở bằng pdf.js/unpdf). */
export async function pdfLayout(pdf: PdfDocument, pageNumbers?: number[]): Promise<LayoutPage[]> {
  const pages: LayoutPage[] = [];
  for (const pageNumber of pageNumbers ?? Array.from({ length: pdf.numPages }, (_, index) => index + 1)) {
    const page = await pdf.getPage(pageNumber);
    pages.push({ pageNumber, spans: await pdfPageSpans(page) });
  }
  return pages;
}

/** Bố cục trang OCR từ đầu ra TSV của Tesseract: mỗi dòng chữ một đoạn (toạ độ ảnh → chuẩn hoá theo kích thước ảnh). */
export function tsvSpans(tsv: string): LayoutSpan[] {
  const rows = tsv.split(/\r?\n/).slice(1).map(line => line.split('\t')).filter(cols => cols.length >= 12);
  const page = rows.find(cols => Number(cols[0]) === 1);
  const width = Number(page?.[8]) || 0;
  const height = Number(page?.[9]) || 0;
  if (!width || !height) return [];
  const lines = new Map<string, { box: [number, number, number, number]; words: string[] }>();
  for (const cols of rows) {
    if (Number(cols[0]) !== 5 || !cols[11]?.trim() || Number(cols[10]) < 0) continue;
    const key = `${cols[2]}:${cols[3]}:${cols[4]}`;
    const left = Number(cols[6]);
    const top = Number(cols[7]);
    const right = left + Number(cols[8]);
    const bottom = top + Number(cols[9]);
    const line = lines.get(key);
    if (line) {
      line.box = [Math.min(line.box[0], left), Math.min(line.box[1], top), Math.max(line.box[2], right), Math.max(line.box[3], bottom)];
      line.words.push(cols[11].trim());
    } else lines.set(key, { box: [left, top, right, bottom], words: [cols[11].trim()] });
  }
  return [...lines.values()].map(line => [round(line.box[0] / width), round(line.box[1] / height), round(line.box[2] / width), round(line.box[3] / height), line.words.join(' ')] as LayoutSpan);
}
