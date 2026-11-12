// Kiểm tra "đủ mục" (B10): văn bản đánh số (1)…(26) hoặc bảng có cột STT thì mỗi mục có số liệu phải có ít nhất một
// đề xuất. Mô hình đọc từng đoạn nên có thể bỏ một mục mà không báo; code đếm lại từ chính văn bản, hỏi lại Qwen riêng
// các mục còn thiếu, và mục nào vẫn thiếu thì ghi rõ cho người duyệt. Không có luật riêng cho một mẫu văn bản nào.

import { chunkBody, locateQuote } from './extraction-structure';
import { countTargetNumbers } from './structured-chunking';
import { baselineReason, DOCUMENT_REFERENCE, hasTargetFigure, isTargetFigure, targetFigures } from './target-signal';

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

/**
 * Các mục đánh số có số liệu mục tiêu trong một đoạn (đã bỏ dòng "[Mục: …]"). `strict` dùng cho phần nhiệm vụ, giải
 * pháp: mục giao việc cũng có con số (ngày hạn, "02 đợt tập huấn") nên chỉ tính mục ghi rõ mức cần đạt.
 */
export function numberedItems(chunkText: string, kind: string, strict = false): NumberedItem[] {
  const body = chunkBody(chunkText);
  const items = kind === 'table' ? tableItems(body) : proseItems(body);
  return items.filter((item) => {
    const content = kind === 'table' ? item.text.replace(TABLE_ROW, '') : item.text.replace(/^\(\d{1,3}[a-zđ]?\)\s*/u, '');
    // Số hiệu văn bản, điều khoản, ngày tháng, năm ("Nghị quyết số 05", "trước ngày 30/6/2026") không phải số liệu
    // mục tiêu. Hàng bảng ghi số ở ô riêng, không có chữ quanh con số, nên chỉ đếm số còn lại.
    if (kind === 'table' ? countTargetNumbers(content.replace(DOCUMENT_REFERENCE, ' ')) === 0 : !hasTargetFigure(content, strict)) return false;
    // Hàng đánh số cột "1 2 3 4 5" và mục không có chữ không phải chỉ tiêu.
    return /\p{L}{3,}/u.test(content);
  });
}

/** Mục có số liệu mà không đề xuất nào trích từ đó (theo vị trí câu trích; không định vị được thì theo số thứ tự). */
export function missingItems(chunkText: string, kind: string, extracted: ExtractedRef[], strict = false): NumberedItem[] {
  const items = numberedItems(chunkText, kind, strict);
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

export interface UncoveredFigure {
  /** Vị trí con số trong phần thân đoạn. */
  position: number;
  /** Câu chứa con số, rút gọn quanh con số. */
  snippet: string;
}

/**
 * "Số chưa được trích": con số ghi rõ là mức cần đạt (có %, hoặc vừa có từ đo lường vừa có đơn vị) mà không nằm trong
 * câu trích của đề xuất nào và cũng không bằng giá trị của đề xuất nào trong đoạn. Bỏ số liệu nền và các mục đánh số
 * đã báo thiếu. Chỉ để người duyệt đối chiếu, không tự lập đề xuất.
 */
export function uncoveredFigures(
  chunkText: string,
  extracted: (ExtractedRef & { values?: (number | null | undefined)[] })[],
  options: { planYear?: number | null; skip?: { start: number; end: number }[] } = {},
): UncoveredFigure[] {
  const body = chunkBody(chunkText);
  const spans: [number, number][] = [];
  const values: number[] = [];
  for (const record of extracted) {
    const position = locateQuote(body, record.sourceQuote, record.targetValue);
    if (position !== null) spans.push([position, position + Math.max(1, (record.sourceQuote ?? '').length)]);
    for (const value of [record.targetValue, ...(record.values ?? [])]) if (typeof value === 'number' && Number.isFinite(value)) values.push(value);
  }
  const found: UncoveredFigure[] = [];
  const seenSentences = new Set<number>();
  for (const figure of targetFigures(body)) {
    if (!isTargetFigure(figure, true)) continue;
    if (spans.some(([start, end]) => figure.index >= start && figure.index < end)) continue;
    if ((options.skip ?? []).some(item => figure.index >= item.start && figure.index < item.end)) continue;
    const readings = [Number(figure.raw.replace(/\./g, '').replace(',', '.')), Number(figure.raw.replace(/,/g, ''))];
    if (readings.some(reading => values.some(value => Math.abs(value - reading) < 1e-9))) continue;
    // Câu chứa con số: từ dấu kết câu trước tới dấu kết câu sau.
    const before = body.slice(0, figure.index);
    const start = Math.max(before.lastIndexOf('\n'), before.search(/[.;!?]\s[^.;!?]*$/u) + 1, 0);
    const rest = body.slice(figure.index);
    const stop = rest.search(/[;!?\n]|\.(?:\s|$)/u);
    const end = figure.index + (stop < 0 ? rest.length : stop);
    if (seenSentences.has(start)) continue;
    const sentence = body.slice(start, end).trim();
    if (baselineReason(sentence, readings.find(Number.isFinite) ?? null, options.planYear ?? null)) continue;
    seenSentences.add(start);
    const offset = figure.index - start;
    const from = Math.max(0, offset - 60);
    const snippet = `${from > 0 ? '…' : ''}${body.slice(start + from, Math.min(end, figure.index + 40)).replace(/\s+/g, ' ').trim()}${end > figure.index + 40 ? '…' : ''}`;
    found.push({ position: figure.index, snippet });
  }
  return found;
}
