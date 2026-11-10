// Kiểm tra "đủ mục" (B10): văn bản đánh số (1)…(26) hoặc bảng có cột STT thì mỗi mục có số liệu phải có ít nhất một
// đề xuất. Mô hình đọc từng đoạn nên có thể bỏ một mục mà không báo; code đếm lại từ chính văn bản, hỏi lại Qwen riêng
// các mục còn thiếu, và mục nào vẫn thiếu thì ghi rõ cho người duyệt. Không có luật riêng cho một mẫu văn bản nào.

import { chunkBody, locateQuote } from './extraction-structure';
import { countTargetNumbers } from './structured-chunking';

export interface NumberedItem {
  /** Số thứ tự như văn bản ghi: "22", "12a", "2.1". */
  ordinal: string;
  /** Vị trí (ký tự trong phần thân đoạn) của mục: từ dấu đánh số tới trước mục kế tiếp. */
  start: number;
  end: number;
  text: string;
}

export interface ExtractedRef {
  sourceQuote: string | null | undefined;
  targetValue: number | null | undefined;
  ordinal?: string | null;
}

// "(9) Tỷ lệ…" ở đầu dòng hoặc ngay sau dấu kết câu; "(2)" giữa câu ("theo điểm (2) khoản 1") không tính.
const PROSE_ITEM = /(?:^|(?<=[.;:…]\s))\((\d{1,3}[a-zđ]?)\)\s+(?=\S)/gmu;
// Hàng bảng có ô STT là số ("9 Tỷ lệ…", "| 2.1 | Thu ngân sách…"); hàng nhóm "I", "A" không phải chỉ tiêu.
const TABLE_ROW = /^\s*\|?\s*(\d{1,3}(?:\.\d{1,2}){0,2})[.)]?\s*(?:\||\s)\s*(?=\S)/u;

const DOCUMENT_REFERENCE = /(số|điều|khoản|điểm|mục|nghị\s+quyết|quyết\s+định|chỉ\s+thị|thông\s+tư|nghị\s+định|công\s+văn|chương\s+trình|đề\s+án|kế\s+hoạch|luật)\s+(số\s+)?\d+[\p{L}\d/.\-]*/giu;

function proseItems(body: string): NumberedItem[] {
  const marks = [...body.matchAll(PROSE_ITEM)].map(match => ({ ordinal: match[1], start: match.index ?? 0 }));
  return marks.map((mark, index) => {
    const end = index + 1 < marks.length ? marks[index + 1].start : body.length;
    return { ordinal: mark.ordinal, start: mark.start, end, text: body.slice(mark.start, end).trim() };
  });
}

function tableItems(body: string): NumberedItem[] {
  const items: NumberedItem[] = [];
  let offset = 0;
  for (const line of body.split('\n')) {
    const match = TABLE_ROW.exec(line);
    const last = items[items.length - 1];
    if (match) {
      items.push({ ordinal: match[1], start: offset, end: offset + line.length, text: line.trim() });
    } else if (last && /^\s*\|?\s*[-–+•]\s/u.test(line)) {
      // Hàng "-" là thành phần của hàng đánh số phía trên: thuộc cùng mục.
      last.end = offset + line.length;
      last.text = `${last.text}\n${line.trim()}`;
    }
    offset += line.length + 1;
  }
  return items;
}

/** Các mục đánh số có số liệu mục tiêu trong một đoạn (đã bỏ dòng "[Mục: …]"). */
export function numberedItems(chunkText: string, kind: string): NumberedItem[] {
  const body = chunkBody(chunkText);
  const items = kind === 'table' ? tableItems(body) : proseItems(body);
  return items.filter((item) => {
    const content = kind === 'table' ? item.text.replace(TABLE_ROW, '') : item.text.replace(/^\(\d{1,3}[a-zđ]?\)\s*/u, '');
    // Số hiệu văn bản và điều khoản ("Nghị quyết số 05", "khoản 2 Điều 7") không phải số liệu mục tiêu.
    if (countTargetNumbers(content.replace(DOCUMENT_REFERENCE, ' ')) === 0) return false;
    // Hàng đánh số cột "1 2 3 4 5" và mục không có chữ không phải chỉ tiêu.
    return /\p{L}{3,}/u.test(content);
  });
}

/** Mục có số liệu mà không đề xuất nào trích từ đó (theo vị trí câu trích; không định vị được thì theo số thứ tự). */
export function missingItems(chunkText: string, kind: string, extracted: ExtractedRef[]): NumberedItem[] {
  const items = numberedItems(chunkText, kind);
  if (!items.length) return [];
  const body = chunkBody(chunkText);
  const positions: number[] = [];
  const ordinals = new Set<string>();
  for (const record of extracted) {
    const position = locateQuote(body, record.sourceQuote, record.targetValue);
    if (position !== null) positions.push(position);
    else if (record.ordinal) ordinals.add(record.ordinal.replace(/[().\s]/g, ''));
  }
  return items.filter(item => !positions.some(position => position >= item.start && position < item.end) && !ordinals.has(item.ordinal));
}

/** Đoạn rút gọn chỉ gồm các mục còn thiếu, giữ dòng "[Mục: …]" (và hàng tiêu đề bảng) để Qwen có ngữ cảnh. */
export function recheckText(chunkText: string, kind: string, items: NumberedItem[]): string {
  const body = chunkBody(chunkText);
  const header = chunkText.slice(0, chunkText.length - body.length).trim();
  const first = numberedItemsStart(body, kind);
  const preamble = kind === 'table' && first > 0 && first <= 400 ? body.slice(0, first).trim() : '';
  return [header, preamble, ...items.map(item => item.text)].filter(Boolean).join('\n');
}

function numberedItemsStart(body: string, kind: string): number {
  const all = kind === 'table' ? tableItems(body) : proseItems(body);
  return all.length ? all[0].start : 0;
}

/** Câu ngắn cho người duyệt: "trang 3 mục (22): Chỉ số PAPI…". */
export function describeMissing(item: NumberedItem, page: number): string {
  const text = item.text.replace(/\s+/g, ' ').replace(/^\(?\d{1,3}[a-zđ]?(?:\.\d{1,2}){0,2}[.)]?\s*\|?\s*/u, '');
  return `trang ${page} mục (${item.ordinal}): ${text.length > 70 ? `${text.slice(0, 69)}…` : text}`;
}
