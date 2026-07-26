import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface ParsedPage {
  pageNumber: number;
  text: string;
  ocrUsed: boolean;
  ocrConfidence?: number;
}

export interface ParsedDocument {
  pages: ParsedPage[];
  pageCount: number;
  hasTextLayer: boolean;
  ocrUsed: boolean;
}

export interface DocumentChunkInput {
  chunkIndex: number;
  pageFrom: number;
  pageTo: number;
  text: string;
  charCount: number;
}

export type DetectedDocumentKind = 'pdf' | 'docx' | 'xlsx' | 'image';

export interface DetectedDocument {
  kind: DetectedDocumentKind;
  mimeType: string;
}

const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

// Nhận diện loại tài liệu bằng chữ ký nội dung, không tin MIME phía client.
// Với container ZIP (DOCX/XLSX) phải soi tiếp tên entry bên trong để phân biệt.
export function detectDocumentKind(buffer: Buffer): DetectedDocument | null {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
    return { kind: 'pdf', mimeType: 'application/pdf' };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { kind: 'image', mimeType: 'image/jpeg' };
  }
  if (
    buffer.length >= 8
    && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { kind: 'image', mimeType: 'image/png' };
  }
  if (
    buffer.length >= 12
    && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { kind: 'image', mimeType: 'image/webp' };
  }
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(ZIP_MAGIC)) {
    const zipKind = sniffOoxmlKind(buffer);
    if (zipKind === 'docx') {
      return {
        kind: 'docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      };
    }
    if (zipKind === 'xlsx') {
      return {
        kind: 'xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    }
    return null;
  }
  return null;
}

// Đọc tên entry trong local file header của ZIP để xác định DOCX (word/) hay XLSX (xl/).
function sniffOoxmlKind(buffer: Buffer): 'docx' | 'xlsx' | null {
  let offset = 0;
  let inspected = 0;
  let sawWord = false;
  let sawXl = false;
  while (offset + 30 <= buffer.length && inspected < 40) {
    if (buffer.readUInt32LE(offset) !== 0x04034b50) break;
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
    if (name.startsWith('word/')) sawWord = true;
    if (name.startsWith('xl/')) sawXl = true;
    const usesDataDescriptor = (buffer.readUInt16LE(offset + 6) & 0x08) !== 0;
    if (usesDataDescriptor && compressedSize === 0) {
      // Không xác định được kích thước nén; dừng duyệt và quyết định theo những gì đã thấy.
      break;
    }
    offset += 30 + nameLength + extraLength + compressedSize;
    inspected += 1;
  }
  if (sawWord && !sawXl) return 'docx';
  if (sawXl && !sawWord) return 'xlsx';
  return null;
}

interface PdfParserApi {
  getDocumentProxy(data: Uint8Array): Promise<PdfDocumentProxy>;
  extractText(pdf: PdfDocumentProxy, options: { mergePages: false }): Promise<{ totalPages: number; text: string[] }>;
  renderPageAsImage(pdf: PdfDocumentProxy, pageNumber: number, options: Record<string, unknown>): Promise<{ data: ArrayBuffer | Uint8Array } | ArrayBuffer | Uint8Array>;
}

type PdfDocumentProxy = unknown;

let unpdfModule: Promise<PdfParserApi> | null = null;

function loadUnpdf(): Promise<PdfParserApi> {
  if (!unpdfModule) {
    // unpdf là ESM; Node >= 22.12 cho phép require(esm) nên import() dịch thành require vẫn chạy.
    unpdfModule = import('unpdf') as unknown as Promise<PdfParserApi>;
  }
  return unpdfModule;
}

export interface OcrEngineConfig {
  tesseractPath: string;
  tessdataDir?: string;
  languages: string;
}

export function resolveOcrConfig(env: Record<string, string | undefined> = process.env): OcrEngineConfig {
  return {
    tesseractPath: env.TESSERACT_PATH || 'tesseract',
    tessdataDir: env.TESSDATA_DIR || undefined,
    languages: env.TESSERACT_LANGS || 'vie+eng',
  };
}

export interface OcrResult {
  text: string;
  confidence?: number;
}

// OCR một ảnh bằng Tesseract native (spawn tiến trình, không cần Python).
// Trả về text kèm độ tin cậy trung bình theo từ (từ output TSV).
export async function ocrImageBuffer(imageBuffer: Buffer, config: OcrEngineConfig): Promise<OcrResult> {
  const workDir = join(tmpdir(), `ioc-ocr-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });
  const inputPath = join(workDir, 'input.png');
  const outputBase = join(workDir, 'output');
  try {
    await writeFile(inputPath, imageBuffer);
    // Dùng -c thay vì config file "tsv" để không phụ thuộc thư mục configs
    // khi trỏ --tessdata-dir tới thư mục chỉ chứa traineddata.
    const args = [inputPath, outputBase, '-l', config.languages, '--psm', '4', '-c', 'tessedit_create_tsv=1'];
    if (config.tessdataDir) {
      args.unshift('--tessdata-dir', config.tessdataDir);
    }
    await execFileAsync(config.tesseractPath, args, { timeout: 120_000, windowsHide: true });
    const tsv = await readFile(`${outputBase}.tsv`, 'utf8');
    return parseTesseractTsv(tsv);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function parseTesseractTsv(tsv: string): OcrResult {
  const lines = tsv.split(/\r?\n/);
  const words: { text: string; conf: number; blockNum: number; parNum: number; lineNum: number }[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split('\t');
    if (cols.length < 12) continue;
    const level = Number(cols[0]);
    const conf = Number(cols[10]);
    const text = cols[11];
    if (level !== 5 || !text || !text.trim() || !Number.isFinite(conf) || conf < 0) continue;
    words.push({
      text: text.trim(),
      conf,
      blockNum: Number(cols[2]),
      parNum: Number(cols[3]),
      lineNum: Number(cols[4]),
    });
  }
  if (!words.length) return { text: '' };
  const parts: string[] = [];
  let previousKey = '';
  for (const word of words) {
    const key = `${word.blockNum}:${word.parNum}:${word.lineNum}`;
    if (previousKey && key !== previousKey) parts.push('\n');
    else if (previousKey) parts.push(' ');
    parts.push(word.text);
    previousKey = key;
  }
  const confidence = words.reduce((sum, word) => sum + word.conf, 0) / words.length / 100;
  return { text: parts.join(''), confidence: Math.round(confidence * 100) / 100 };
}

const MIN_TEXT_LAYER_CHARS = 40;

export interface PdfParseOptions {
  ocr: OcrEngineConfig;
  maxOcrPages: number;
}

// PDF: lấy text layer từng trang; trang nào gần như trống thì render ảnh và OCR.
export async function parsePdf(buffer: Buffer, options: PdfParseOptions): Promise<ParsedDocument> {
  const { getDocumentProxy, extractText, renderPageAsImage } = await loadUnpdf();
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pages: ParsedPage[] = [];
  let ocrUsed = false;
  let ocrPagesRemaining = options.maxOcrPages;
  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    const layerText = normalizeExtractedText(text[pageNumber - 1] ?? '');
    if (layerText.length >= MIN_TEXT_LAYER_CHARS || ocrPagesRemaining <= 0) {
      pages.push({ pageNumber, text: layerText, ocrUsed: false });
      continue;
    }
    ocrPagesRemaining -= 1;
    const rendered = await renderPageAsImage(pdf, pageNumber, {
      scale: 2,
      canvasImport: () => import('@napi-rs/canvas'),
    });
    const imageData = rendered instanceof Uint8Array
      ? rendered
      : rendered instanceof ArrayBuffer
        ? new Uint8Array(rendered)
        : new Uint8Array((rendered as { data: ArrayBuffer | Uint8Array }).data as ArrayBuffer);
    const ocr = await ocrImageBuffer(Buffer.from(imageData), options.ocr);
    ocrUsed = true;
    pages.push({
      pageNumber,
      text: normalizeExtractedText(ocr.text),
      ocrUsed: true,
      ocrConfidence: ocr.confidence,
    });
  }
  const hasTextLayer = pages.some(page => !page.ocrUsed && page.text.length >= MIN_TEXT_LAYER_CHARS);
  return { pages, pageCount: totalPages, hasTextLayer, ocrUsed };
}

export async function parseDocx(buffer: Buffer): Promise<ParsedDocument> {
  // mammoth chuyển DOCX (kể cả bảng) thành text thuần, mỗi ô phân tách bằng tab.
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  const fullText = normalizeExtractedText(result.value ?? '');
  const pages = splitTextIntoPseudoPages(fullText);
  return {
    pages,
    pageCount: pages.length,
    hasTextLayer: fullText.length > 0,
    ocrUsed: false,
  };
}

export async function parseXlsx(buffer: Buffer): Promise<ParsedDocument> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const pages: ParsedPage[] = [];
  workbook.eachSheet((worksheet, sheetId) => {
    const lines: string[] = [`[Bảng: ${worksheet.name}]`];
    let previousLine = '';
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => {
        cells.push(cellText(cell.value));
      });
      // Ô gộp (merged) được exceljs trả cùng giá trị cho MỌI ô trong vùng gộp —
      // nén các ô liên tiếp trùng nội dung về một, và bỏ dòng lặp nguyên văn
      // dòng trước (gộp dọc), nếu không văn bản đưa vào LLM sẽ đầy nhiễu.
      const compressed: string[] = [];
      for (const value of cells) {
        if (value && compressed.length && compressed[compressed.length - 1] === value) continue;
        compressed.push(value);
      }
      const line = compressed.join('\t').replace(/\t+$/g, '');
      if (line.trim() && line !== previousLine) {
        lines.push(line);
        previousLine = line;
      }
    });
    pages.push({
      pageNumber: sheetId,
      text: normalizeExtractedText(lines.join('\n')),
      ocrUsed: false,
    });
  });
  const normalizedPages = pages.map((page, index) => ({ ...page, pageNumber: index + 1 }));
  return {
    pages: normalizedPages,
    pageCount: normalizedPages.length,
    hasTextLayer: normalizedPages.some(page => page.text.length > 0),
    ocrUsed: false,
  };
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    const candidate = value as { text?: unknown; result?: unknown; richText?: { text?: string }[] };
    if (Array.isArray(candidate.richText)) {
      return candidate.richText.map(part => part.text ?? '').join('').trim();
    }
    if (candidate.result !== undefined) return cellText(candidate.result);
    if (typeof candidate.text === 'string') return candidate.text.trim();
  }
  return '';
}

export async function parseImage(buffer: Buffer, ocr: OcrEngineConfig): Promise<ParsedDocument> {
  const result = await ocrImageBuffer(buffer, ocr);
  return {
    pages: [{
      pageNumber: 1,
      text: normalizeExtractedText(result.text),
      ocrUsed: true,
      ocrConfidence: result.confidence,
    }],
    pageCount: 1,
    hasTextLayer: false,
    ocrUsed: true,
  };
}

export function normalizeExtractedText(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[ ​-‍﻿]/g, '')
    .replace(/ /g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const PSEUDO_PAGE_CHARS = 3200;

function splitTextIntoPseudoPages(text: string): ParsedPage[] {
  if (!text) return [{ pageNumber: 1, text: '', ocrUsed: false }];
  const paragraphs = text.split(/\n\n+/);
  const pages: ParsedPage[] = [];
  let current: string[] = [];
  let currentLength = 0;
  const flush = () => {
    if (!current.length) return;
    pages.push({ pageNumber: pages.length + 1, text: current.join('\n\n'), ocrUsed: false });
    current = [];
    currentLength = 0;
  };
  for (const paragraph of paragraphs) {
    if (currentLength + paragraph.length > PSEUDO_PAGE_CHARS && current.length) flush();
    current.push(paragraph);
    currentLength += paragraph.length + 2;
  }
  flush();
  return pages.length ? pages : [{ pageNumber: 1, text: '', ocrUsed: false }];
}

const CHUNK_TARGET_CHARS = 1800;
const CHUNK_OVERLAP_CHARS = 200;
// Bảng chỉ tiêu: mỗi chunk tối đa ~8 dòng dữ liệu để đầu ra LLM (~180 token/chỉ tiêu)
// không bao giờ vượt ngân sách sinh — bài học từ PL1 QĐ333: chunk 12 dòng làm JSON
// bị cắt giữa chừng và mất trọn chunk.
const TABLE_ROWS_PER_CHUNK = 8;

// Dòng bắt đầu một hàng dữ liệu bảng: số thứ tự (1-2 chữ số) hoặc gạch đầu dòng thành phần.
const TABLE_ROW_START = /^\s*(\d{1,2}|-)\s+\S/;
// Tiêu đề mục La Mã ("II Chỉ tiêu văn hóa - xã hội") — giữ làm ngữ cảnh cho mọi chunk thuộc mục.
const SECTION_HEADER = /^\s*(?:[IVX]{1,4})\s+\p{Lu}/u;

interface TableRow {
  text: string;
  page: number;
  isSection: boolean;
}

// Trang "dạng bảng" khi có từ 3 hàng dữ liệu trở lên.
export function isTableLikePage(text: string): boolean {
  let rowStarts = 0;
  for (const line of text.split('\n')) {
    if (TABLE_ROW_START.test(line)) rowStarts += 1;
    if (rowStarts >= 3) return true;
  }
  return false;
}

// Gom các dòng vật lý thành hàng logic của bảng (hàng mới bắt đầu bằng STT hoặc "-";
// dòng nối tiếp thuộc hàng trước do PDF xuống dòng giữa ô).
export function groupTableRows(text: string, page: number): TableRow[] {
  const rows: TableRow[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (SECTION_HEADER.test(trimmed) && trimmed.length < 80) {
      rows.push({ text: trimmed, page, isSection: true });
      continue;
    }
    if (TABLE_ROW_START.test(trimmed) || !rows.length || rows[rows.length - 1].isSection) {
      rows.push({ text: trimmed, page, isSection: false });
    } else {
      rows[rows.length - 1].text += ` ${trimmed}`;
    }
  }
  return rows;
}

// Cắt tài liệu thành đoạn theo ranh giới đoạn văn (văn xuôi) hoặc theo cụm hàng
// (bảng chỉ tiêu), luôn giữ dấu vết trang để truy ngược nguồn. Chunk bảng được
// gắn tiêu đề mục gần nhất làm ngữ cảnh (phục vụ lĩnh vực + chỉ tiêu cha).
export function chunkParsedPages(pages: ParsedPage[]): DocumentChunkInput[] {
  const tableLike = pages.filter(page => isTableLikePage(page.text)).length >= Math.max(1, Math.ceil(pages.length / 2));
  if (tableLike) return chunkTablePages(pages);
  return chunkProsePages(pages);
}

function chunkTablePages(pages: ParsedPage[]): DocumentChunkInput[] {
  const rows: TableRow[] = [];
  for (const page of pages) {
    rows.push(...groupTableRows(page.text, page.pageNumber));
  }
  const chunks: DocumentChunkInput[] = [];
  let currentHeader = '';
  let buffer: TableRow[] = [];
  const flush = () => {
    const dataRows = buffer.filter(row => !row.isSection);
    if (!dataRows.length) {
      buffer = [];
      return;
    }
    const text = [
      currentHeader ? `[Mục: ${currentHeader}]` : null,
      ...buffer.map(row => row.text),
    ].filter((line): line is string => Boolean(line)).join('\n');
    chunks.push({
      chunkIndex: chunks.length,
      pageFrom: Math.min(...dataRows.map(row => row.page)),
      pageTo: Math.max(...dataRows.map(row => row.page)),
      text,
      charCount: text.length,
    });
    buffer = [];
  };
  for (const row of rows) {
    if (row.isSection) {
      flush();
      currentHeader = row.text;
      continue;
    }
    buffer.push(row);
    const dataCount = buffer.filter(item => !item.isSection).length;
    // Không cắt ngay sau hàng cha (hàng kế tiếp có thể là thành phần "-" của nó).
    const nextRowIsSub = false;
    if (dataCount >= TABLE_ROWS_PER_CHUNK && !nextRowIsSub) flush();
  }
  flush();
  return chunks;
}

function chunkProsePages(pages: ParsedPage[]): DocumentChunkInput[] {
  const segments: { text: string; page: number }[] = [];
  for (const page of pages) {
    for (const paragraph of page.text.split(/\n\n+/)) {
      const trimmed = paragraph.trim();
      if (trimmed) segments.push({ text: trimmed, page: page.pageNumber });
    }
  }
  const chunks: DocumentChunkInput[] = [];
  let buffer: { text: string; page: number }[] = [];
  let bufferLength = 0;
  const flush = () => {
    if (!buffer.length) return;
    const text = buffer.map(segment => segment.text).join('\n\n');
    chunks.push({
      chunkIndex: chunks.length,
      pageFrom: buffer[0].page,
      pageTo: buffer[buffer.length - 1].page,
      text,
      charCount: text.length,
    });
  };
  for (const segment of segments) {
    if (segment.text.length > CHUNK_TARGET_CHARS) {
      // Đoạn đơn quá dài (bảng lớn, phụ lục): cắt cứng theo dòng.
      if (bufferLength) { flush(); buffer = []; bufferLength = 0; }
      const lines = segment.text.split('\n');
      let part: string[] = [];
      let partLength = 0;
      for (const line of lines) {
        if (partLength + line.length > CHUNK_TARGET_CHARS && part.length) {
          const text = part.join('\n');
          chunks.push({
            chunkIndex: chunks.length,
            pageFrom: segment.page,
            pageTo: segment.page,
            text,
            charCount: text.length,
          });
          part = [];
          partLength = 0;
        }
        part.push(line);
        partLength += line.length + 1;
      }
      if (part.length) {
        const text = part.join('\n');
        chunks.push({
          chunkIndex: chunks.length,
          pageFrom: segment.page,
          pageTo: segment.page,
          text,
          charCount: text.length,
        });
      }
      continue;
    }
    if (bufferLength + segment.text.length > CHUNK_TARGET_CHARS && buffer.length) {
      flush();
      // Giữ đoạn cuối làm phần chồng lấn để không mất ngữ cảnh giữa hai chunk.
      const lastSegment = buffer[buffer.length - 1];
      buffer = lastSegment.text.length <= CHUNK_OVERLAP_CHARS ? [lastSegment] : [];
      bufferLength = buffer.reduce((sum, item) => sum + item.text.length + 2, 0);
    }
    buffer.push(segment);
    bufferLength += segment.text.length + 2;
  }
  flush();
  return chunks;
}
