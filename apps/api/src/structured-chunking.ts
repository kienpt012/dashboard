import type { DocumentChunkInput, ParsedPage } from './document-processing';
import { chunkParsedPages, isTableLikePage } from './document-processing';
import type { StructuredElement, StructuredPage } from './ocr-service';

// B7. Tiền xử lý và chia đoạn theo mục.
// Mỗi đoạn là một hoặc vài mục đánh số liền nhau cùng một đề mục ("(9)", "1.", "a)"), hoặc một phần của bảng.
// Đoạn mang theo heading_path (chuỗi đề mục chứa nó: ["Điều 2", "1. Chỉ tiêu về kinh tế"]) và câu đầu mục (nơi
// thường ghi "Phòng X chủ trì theo dõi"), giữ id các phần tử gốc để truy ngược về trang và khung.
//
// Định dạng chữ gửi cho Qwen giữ như bản cũ để mô hình đã fine-tune (qwen3-chitieu) đọc được:
//   [Mục: Điều 2 > 1. Chỉ tiêu về kinh tế]
//   <nội dung>   (bảng: mỗi hàng một dòng, các ô cách nhau một khoảng trắng)

export interface StructuredChunk extends DocumentChunkInput {
  headingPath: string[];
  elementIds: string[];
  kind: 'section' | 'table' | 'form';
  leadSentence: string | null;
  hasDigits: boolean;
  /** Số phần tử nguồn mang cờ cần rà soát của OCR. */
  ocrFlagged: number;
}

export interface ChunkingOptions {
  targetChars: number;
  /** Số con số mục tiêu tối đa trong một đoạn văn: đoạn ngắn mà dày chỉ tiêu (mục (1)–(13) liền nhau) vẫn được tách. */
  maxNumbersPerChunk: number;
  tableRowsPerChunk: number;
  tableFormat: 'plain' | 'markdown';
}

export function resolveChunkingOptions(env: Record<string, string | undefined> = process.env): ChunkingOptions {
  const target = Number.parseInt(env.CHUNK_TARGET_CHARS ?? '', 10);
  const rows = Number.parseInt(env.CHUNK_TABLE_ROWS ?? '', 10);
  const numbers = Number.parseInt(env.CHUNK_MAX_NUMBERS ?? '', 10);
  return {
    targetChars: Number.isSafeInteger(target) ? Math.min(4000, Math.max(400, target)) : 1400,
    maxNumbersPerChunk: Number.isSafeInteger(numbers) ? Math.min(60, Math.max(4, numbers)) : 12,
    tableRowsPerChunk: Number.isSafeInteger(rows) ? Math.min(30, Math.max(2, rows)) : 8,
    tableFormat: env.CHUNK_TABLE_FORMAT === 'markdown' ? 'markdown' : 'plain',
  };
}

const HEADING_PATH_MAX = 100;

interface Rank {
  rank: number;
  /** true: đề mục; false: mục đánh số mang nội dung (đơn vị chia đoạn). */
  heading: boolean;
}

const PATTERNS: { re: RegExp; rank: number; always: boolean }[] = [
  { re: /^(PHẦN|Phần)\s+([IVXLC]+|\d+|thứ\s+\S+)\b/u, rank: 1, always: true },
  { re: /^(CHƯƠNG|Chương)\s+([IVXLC]+|\d+)\b/u, rank: 2, always: true },
  { re: /^(MỤC|Mục)\s+([IVXLC]+|\d+)\b(?!\s*(tiêu|đích))/u, rank: 3, always: true },
  { re: /^Điều\s+\d+[a-zđ]?\s*[.:]/u, rank: 4, always: true },
  { re: /^[IVXLC]{1,6}\s*[.\-–)]?\s+\p{Lu}/u, rank: 5, always: true },
  { re: /^[A-ZĐ][.)]\s+\p{Lu}/u, rank: 5, always: true },
  { re: /^\d{1,2}\.\d{1,2}(\.\d{1,2})?\.?\s+\S/u, rank: 7, always: false },
  { re: /^\d{1,2}[.)]\s+\S/u, rank: 6, always: false },
  { re: /^\(\d{1,3}\)\s*\S/u, rank: 8, always: false },
  { re: /^[a-zđ]\)\s+\S/u, rank: 8, always: false },
];

const ITEM_START = /^(\d{1,2}(\.\d{1,2}){0,2}[.)]|\(\d{1,3}\)|[a-zđ]\)|[-–+•])\s*\S/u;

/** Phân loại một phần tử: đề mục (cấp mấy), mục đánh số mang nội dung, hay đoạn thường (null). */
export function classifyLine(text: string, type: StructuredElement['type'], level?: number): Rank | null {
  const trimmed = text.trim();
  for (const pattern of PATTERNS) {
    if (!pattern.re.test(trimmed)) continue;
    if (pattern.always) return { rank: pattern.rank, heading: true };
    // "1. Chỉ tiêu về kinh tế" là đề mục; "1. Tỷ lệ số hóa hồ sơ đạt 100%." là mục mang chỉ tiêu.
    const body = trimmed.replace(/^(\d{1,2}(\.\d{1,2}){0,2}[.)]?|\(\d{1,3}\)|[a-zđ]\))\s*/u, '');
    const shortTitle = body.length <= 120 && !/\d/.test(body) && !/[.;]$/.test(body);
    return { rank: pattern.rank, heading: shortTitle || type === 'heading' };
  }
  if (type === 'heading') return { rank: 3 + Math.min(3, Math.max(0, (level ?? 1) - 1)), heading: true };
  return null;
}

function headingLabel(text: string) {
  const single = text.replace(/\s+/g, ' ').trim();
  return single.length > HEADING_PATH_MAX ? `${single.slice(0, HEADING_PATH_MAX - 1)}…` : single;
}

function tableRows(element: StructuredElement, format: ChunkingOptions['tableFormat']): { text: string; header: boolean }[] {
  const table = element.table;
  if (!table) return element.text.split('\n').filter(Boolean).map(text => ({ text, header: false }));
  const grid: string[][] = Array.from({ length: table.numRows }, () => Array.from({ length: table.numCols }, () => ''));
  const headerRows = new Set<number>();
  for (const cell of table.cells) {
    if (cell.row < table.numRows && cell.col < table.numCols) grid[cell.row][cell.col] = cell.text ?? '';
    if (cell.header) headerRows.add(cell.row);
  }
  return grid.map((cells, row) => {
    const text = format === 'markdown'
      ? `| ${cells.map(cell => cell.replace(/\|/g, '/')).join(' | ')} |`
      : cells.filter(Boolean).join(' ');
    return { text, header: headerRows.has(row) };
  }).filter(row => row.text.replace(/[|\s]/g, ''));
}

/** Chia các trang đã có cấu trúc thành đoạn cho B8. */
export function chunkStructuredPages(pages: Pick<StructuredPage, 'page' | 'elements'>[], options: ChunkingOptions = resolveChunkingOptions()): StructuredChunk[] {
  const chunks: StructuredChunk[] = [];
  const stack: { rank: number; text: string; lead: string | null }[] = [];
  let units: { text: string; page: number; ids: string[]; flagged: number }[] = [];
  let unitsLength = 0;

  const currentPath = () => stack.map(entry => headingLabel(entry.text));
  const currentLead = () => {
    for (let index = stack.length - 1; index >= 0; index -= 1) if (stack[index].lead) return stack[index].lead;
    return null;
  };

  const push = (kind: StructuredChunk['kind'], body: string, pageFrom: number, pageTo: number, ids: string[], flagged: number) => {
    const headingPath = currentPath();
    const lead = currentLead();
    const header = headingPath.length ? `[Mục: ${headingPath.join(' > ')}]` : null;
    const leadLine = lead && !body.includes(lead) && kind === 'section' ? `[Đầu mục: ${lead}]` : null;
    const text = [header, leadLine, body].filter((line): line is string => Boolean(line)).join('\n');
    chunks.push({
      chunkIndex: chunks.length,
      pageFrom,
      pageTo,
      text,
      charCount: text.length,
      headingPath,
      elementIds: ids,
      kind,
      leadSentence: lead,
      hasDigits: /\d/.test(body),
      ocrFlagged: flagged,
    });
  };

  // Đoạn văn dày con số: tách tiếp theo câu để Qwen sinh trọn câu trả lời trong thời gian chờ.
  const pushSection = (body: string, pageFrom: number, pageTo: number, ids: string[], flagged: number) => {
    for (const part of splitByNumberDensity(body, options.maxNumbersPerChunk ?? 12)) push('section', part, pageFrom, pageTo, ids, flagged);
  };

  const flushUnits = () => {
    if (!units.length) return;
    pushSection(
      units.map(unit => unit.text).join('\n'),
      Math.min(...units.map(unit => unit.page)),
      Math.max(...units.map(unit => unit.page)),
      units.flatMap(unit => unit.ids),
      units.reduce((sum, unit) => sum + unit.flagged, 0),
    );
    units = [];
    unitsLength = 0;
  };

  const addUnit = (unit: { text: string; page: number; ids: string[]; flagged: number }) => {
    if (unit.text.length > options.targetChars) {
      // Một mục quá dài: tách ở ranh giới câu/dòng, mỗi phần vẫn mang cùng id phần tử.
      flushUnits();
      for (const part of splitLongText(unit.text, options.targetChars)) {
        pushSection(part, unit.page, unit.page, unit.ids, unit.flagged);
      }
      return;
    }
    if (unitsLength && unitsLength + unit.text.length + 1 > options.targetChars) flushUnits();
    units.push(unit);
    unitsLength += unit.text.length + 1;
  };

  let openUnit: { text: string; page: number; ids: string[]; flagged: number } | null = null;
  const closeUnit = () => {
    if (openUnit) addUnit(openUnit);
    openUnit = null;
  };

  const forms: StructuredElement[] = [];
  for (const page of pages) {
    for (const element of page.elements) {
      const flagged = element.flags?.includes('can_ra_soat') ? 1 : 0;
      if (element.type === 'stamp') continue;
      if (element.type === 'form_field') {
        forms.push(element);
        continue;
      }
      if (element.type === 'table') {
        closeUnit();
        flushUnits();
        const rows = tableRows(element, options.tableFormat);
        const header = rows.filter(row => row.header).map(row => row.text);
        const body = rows.filter(row => !row.header);
        const cellFlags = element.table?.cells.filter(cell => cell.flags?.includes('can_ra_soat')).length ?? flagged;
        for (let start = 0; start < body.length;) {
          let end = Math.min(body.length, start + options.tableRowsPerChunk);
          // Không cắt ngay trước dòng thành phần "-": giữ chỉ tiêu cha cùng đoạn với thành phần của nó.
          while (end < body.length && /^[-–]\s/.test(body[end].text) && end - start < options.tableRowsPerChunk * 2) end += 1;
          const text = [...header, ...body.slice(start, end).map(row => row.text)].join('\n');
          push('table', text, element.page, element.page, [element.id], cellFlags);
          start = end;
        }
        if (!body.length && header.length) push('table', header.join('\n'), element.page, element.page, [element.id], cellFlags);
        continue;
      }
      const text = element.text.trim();
      if (!text) continue;
      const kind = classifyLine(text, element.type, element.level);
      if (kind?.heading) {
        closeUnit();
        flushUnits();
        while (stack.length && stack[stack.length - 1].rank >= kind.rank) stack.pop();
        stack.push({ rank: kind.rank, text, lead: null });
        continue;
      }
      const startsItem = Boolean(kind) || ITEM_START.test(text);
      if (startsItem) {
        closeUnit();
        openUnit = { text, page: element.page, ids: [element.id], flagged };
        continue;
      }
      if (openUnit) {
        openUnit.text += `\n${text}`;
        openUnit.ids.push(element.id);
        openUnit.flagged += flagged;
        continue;
      }
      // Đoạn đầu tiên ngay dưới đề mục, trước mục đánh số: câu đầu mục.
      const top = stack[stack.length - 1];
      if (top && top.lead === null && !units.length) top.lead = text.length > 300 ? `${text.slice(0, 299)}…` : text;
      addUnit({ text, page: element.page, ids: [element.id], flagged });
    }
  }
  closeUnit();
  flushUnits();
  if (forms.length) {
    stack.length = 0;
    const byPage = new Map<number, StructuredElement[]>();
    for (const field of forms) byPage.set(field.page, [...(byPage.get(field.page) ?? []), field]);
    for (const [page, fields] of byPage) {
      push('form', fields.map(field => field.text).join('\n'), page, page, fields.map(field => field.id), fields.filter(field => field.flags?.includes('can_ra_soat')).length);
    }
  }
  return chunks;
}

/** Số con số có thể là giá trị mục tiêu: bỏ số thứ tự "(9)", năm "2025" và mốc "10.000 dân" vẫn tính (đủ để ước lượng). */
export function countTargetNumbers(text: string): number {
  return (text.replace(/\(\d{1,3}\)/g, ' ').match(/\d+(?:[.,]\d+)*/g) ?? [])
    .filter(token => !/^(19|20)\d{2}$/.test(token)).length;
}

/** Tách đoạn có quá `limit` con số ở ranh giới câu/dòng (giữ nguyên thứ tự, không cắt giữa câu). */
export function splitByNumberDensity(text: string, limit: number): string[] {
  if (countTargetNumbers(text) <= limit) return [text];
  const sentences = text.split(/(?<=[.;])\s+|\n/u).filter(Boolean);
  const parts: string[] = [];
  let current = '';
  let count = 0;
  for (const sentence of sentences) {
    const numbers = countTargetNumbers(sentence);
    if (current && count + numbers > limit) {
      parts.push(current);
      current = '';
      count = 0;
    }
    current = current ? `${current} ${sentence}` : sentence;
    count += numbers;
  }
  if (current) parts.push(current);
  return parts;
}

export function splitLongText(text: string, limit: number): string[] {
  const sentences = text.split(/(?<=[.;:])\s+|\n/u).filter(Boolean);
  const parts: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (current && current.length + sentence.length + 1 > limit) {
      parts.push(current);
      current = '';
    }
    if (sentence.length > limit) {
      for (let start = 0; start < sentence.length; start += limit) parts.push(sentence.slice(start, start + limit));
      continue;
    }
    current = current ? `${current} ${sentence}` : sentence;
  }
  if (current) parts.push(current);
  return parts;
}

// ---------------------------------------------------------------------------
// Bộ đọc dự phòng (pdf.js + Tesseract) chỉ có chữ theo dòng vật lý: ghép dòng thành đoạn rồi dùng cùng bộ chia đoạn.

const SENTENCE_END = /[.:;!?…]["”)]?$/u;

/** Ghép các dòng vật lý của PDF thành đoạn văn: dòng mới bắt đầu đoạn khi là đề mục/mục đánh số/gạch đầu dòng,
 *  khi dòng trước kết thúc câu, hoặc khi gặp dòng trống. Sửa lỗi tên chỉ tiêu bị cắt đôi giữa hai dòng. */
export function joinLinesIntoParagraphs(text: string): string[] {
  const paragraphs: string[] = [];
  let current = '';
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) {
      if (current) paragraphs.push(current);
      current = '';
      continue;
    }
    const startsBlock = ITEM_START.test(line) || PATTERNS.some(pattern => pattern.always && pattern.re.test(line))
      || (line === line.toUpperCase() && /\p{Lu}{3}/u.test(line) && line.length < 90);
    const previousEnded = !current || SENTENCE_END.test(current)
      || (current === current.toUpperCase() && /\p{Lu}{3}/u.test(current));
    if (current && (startsBlock || (previousEnded && /^[\p{Lu}\d"“(]/u.test(line)))) {
      paragraphs.push(current);
      current = line;
    } else {
      current = current ? `${current} ${line}` : line;
    }
  }
  if (current) paragraphs.push(current);
  return paragraphs;
}

/** Trang của bộ đọc dự phòng → phần tử (đoạn văn), id dạng "p{trang}-l{thứ tự}". */
export function fallbackElements(page: ParsedPage): StructuredElement[] {
  return joinLinesIntoParagraphs(page.text).map((text, index) => ({
    id: `p${page.pageNumber}-l${index}`,
    type: 'paragraph' as const,
    text,
    page: page.pageNumber,
    bbox: null,
    confidence: page.ocrUsed ? page.ocrConfidence ?? null : null,
    source: page.ocrUsed ? 'tesseract' : 'pdf_text',
    flags: page.ocrUsed && (page.ocrConfidence ?? 1) < 0.7 ? ['can_ra_soat', 'ocr_tin_cay_thap'] : [],
  }));
}

/**
 * Chia đoạn cho văn bản đọc bằng bộ dự phòng. Văn bản dạng bảng chỉ tiêu (phụ lục giao chỉ tiêu) giữ bộ chia theo
 * hàng đã tinh chỉnh cho PL QĐ 333; văn xuôi dùng bộ chia theo mục.
 */
export function chunkFallbackPages(
  pages: ParsedPage[],
  options: ChunkingOptions = resolveChunkingOptions(),
  forceTable = false,
): StructuredChunk[] {
  const tableLike = forceTable
    || pages.filter(page => isTableLikePage(page.text)).length >= Math.max(1, Math.ceil(pages.length / 2));
  if (!tableLike) {
    return chunkStructuredPages(pages.map(page => ({ page: page.pageNumber, elements: fallbackElements(page) })), options);
  }
  return chunkParsedPages(pages).map(chunk => {
    const header = chunk.text.match(/^\[Mục:\s*([^\]]+)\]/u)?.[1]?.trim();
    const body = chunk.text.replace(/^\[Mục:[^\]]*\]\n?/u, '');
    return {
      ...chunk,
      headingPath: header ? [header] : [],
      elementIds: [],
      kind: 'table' as const,
      leadSentence: null,
      hasDigits: /\d/.test(body),
      ocrFlagged: 0,
    };
  });
}
