import { Logger } from '@nestjs/common';
import * as http from 'node:http';
import * as https from 'node:https';
import type { LayoutSpan } from './source-locator';

// Client gọi ocr-service (Python: Docling + RapidOCR + VietOCR), phụ trách B2–B6 của quy trình xử lý văn bản.
// Không cấu hình OCR_SERVICE_URL thì API dùng bộ đọc dự phòng trong document-processing.ts (pdf.js + Tesseract).

export type ElementType = 'heading' | 'paragraph' | 'list_item' | 'table' | 'form_field' | 'stamp';

export interface OcrReading {
  text: string;
  vietocr?: string | null;
  second?: string | null;
  invalidSyllables?: string[];
}

export interface StructuredTableCell {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  text: string;
  header: boolean;
  rowHeader?: boolean;
  bbox: [number, number, number, number] | null;
  confidence: number | null;
  source: string | null;
  flags: string[];
  readings?: { vietocr?: string; second?: string };
  ref?: string;
}

export interface StructuredElement {
  id: string;
  type: ElementType;
  label?: string;
  text: string;
  page: number;
  bbox: [number, number, number, number] | null;
  confidence: number | null;
  /** pdf_text | docx | xlsx | vietocr | paddle | merged | template | opencv | fallback */
  source: string;
  flags: string[];
  level?: number;
  readings?: OcrReading[];
  table?: { numRows: number; numCols: number; cells: StructuredTableCell[]; sheet?: string; gridFallback?: boolean };
  field?: { template?: string; name: string; label: string; value: string; indicator?: { name: string; unit?: string | null } | null };
}

export interface StructuredPage {
  page: number;
  width: number | null;
  height: number | null;
  /** text | scan | broken_font | image | docx | xlsx */
  kind: string;
  ocrUsed: boolean;
  ocrConfidence: number | null;
  angle?: number | null;
  formTemplate?: string | null;
  text: string;
  spans: LayoutSpan[] | null;
  elements: StructuredElement[];
}

export interface StructuredDocument {
  parser: { name: string; version: string; docling?: string; secondReader?: string; dpi?: number };
  kind: string;
  pageCount: number;
  pages: StructuredPage[];
  warnings: string[];
  elapsedMs: number;
}

export interface InspectResult {
  kind: string;
  pageCount: number | null;
  pages: { page: number; kind: string; chars: number; syllableRatio: number | null }[];
}

export interface OcrServiceConfig {
  baseUrl: string | null;
  pageBatch: number;
  timeoutMs: number;
}

export function resolveOcrServiceConfig(env: Record<string, string | undefined> = process.env): OcrServiceConfig {
  const raw = (env.OCR_SERVICE_URL ?? '').trim();
  const batch = Number.parseInt(env.OCR_SERVICE_PAGE_BATCH ?? '', 10);
  const timeout = Number.parseInt(env.OCR_SERVICE_TIMEOUT_MS ?? '', 10);
  return {
    baseUrl: raw ? raw.replace(/\/+$/, '') : null,
    // 4 trang mỗi lô: trên CPU một trang scan mất 40–50 giây, lô nhỏ giữ mỗi lần gọi dưới vài phút và gia hạn lease đều.
    pageBatch: Number.isSafeInteger(batch) ? Math.min(50, Math.max(1, batch)) : 4,
    timeoutMs: Number.isSafeInteger(timeout) ? Math.min(3_600_000, Math.max(30_000, timeout)) : 900_000,
  };
}

export class OcrServiceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OcrServiceUnavailableError';
  }
}

/** Chia danh sách trang thành các lô liên tiếp: [1..8], [9..16]… */
export function pageBatches(pageCount: number, batchSize: number): { from: number; to: number }[] {
  const batches: { from: number; to: number }[] = [];
  for (let from = 1; from <= pageCount; from += batchSize) {
    batches.push({ from, to: Math.min(pageCount, from + batchSize - 1) });
  }
  return batches;
}

export class OcrServiceClient {
  private readonly logger = new Logger(OcrServiceClient.name);

  constructor(readonly config: OcrServiceConfig = resolveOcrServiceConfig(), private readonly fetchImpl: typeof fetch = longRequestFetch) {}

  get enabled() {
    return Boolean(this.config.baseUrl);
  }

  /** ocr-service đang chạy và đã nạp xong mô hình. */
  async isReady(signal?: AbortSignal): Promise<boolean> {
    if (!this.config.baseUrl) return false;
    try {
      const response = await this.fetchImpl(`${this.config.baseUrl}/health`, { signal: combine(5_000, signal) });
      if (!response.ok) return false;
      const body = await response.json() as { status?: string };
      return body.status === 'ok';
    } catch {
      return false;
    }
  }

  async inspect(buffer: Buffer, filename: string, signal?: AbortSignal): Promise<InspectResult> {
    return this.post<InspectResult>('/inspect', buffer, filename, undefined, 60_000, signal);
  }

  async parse(buffer: Buffer, filename: string, pages?: { from: number; to: number }, signal?: AbortSignal): Promise<StructuredDocument> {
    const query = pages ? `?pages=${pages.from}-${pages.to}` : undefined;
    return this.post<StructuredDocument>('/parse', buffer, filename, query, this.config.timeoutMs, signal);
  }

  private async post<T>(path: string, buffer: Buffer, filename: string, query: string | undefined, timeoutMs: number, signal?: AbortSignal): Promise<T> {
    if (!this.config.baseUrl) throw new OcrServiceUnavailableError('Chưa cấu hình OCR_SERVICE_URL');
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(buffer)]), filename || 'document');
    form.append('filename', filename || 'document');
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.config.baseUrl}${path}${query ?? ''}`, {
        method: 'POST',
        body: form,
        signal: combine(timeoutMs, signal),
      });
    } catch (error) {
      if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : error;
      throw new OcrServiceUnavailableError(`Không kết nối được ocr-service: ${describeError(error)}`);
    }
    if (response.status === 503) throw new OcrServiceUnavailableError('ocr-service chưa nạp xong mô hình');
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      this.logger.warn(`ocr-service trả lỗi ${response.status} cho ${path}`);
      throw new Error(`ocr-service lỗi ${response.status}: ${detail.slice(0, 200)}`);
    }
    return await response.json() as T;
  }
}

function combine(timeoutMs: number, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

/** Tên lỗi kèm nguyên nhân gốc (fetch chỉ báo "TypeError: fetch failed", lý do thật nằm trong cause). */
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return 'lỗi';
  const cause = error.cause as { code?: string; message?: string } | undefined;
  const detail = cause?.code ?? cause?.message ?? error.message;
  return detail && detail !== error.name ? `${error.name}: ${detail}` : error.name;
}

/**
 * Gọi HTTP bằng node:http thay cho fetch toàn cục. fetch của Node (undici) tự ngắt khi chờ header phản hồi quá
 * 300 giây (headersTimeout), bất kể AbortSignal; ocr-service đọc một lô scan trên CPU có thể lâu hơn thế. Ở đây
 * thời gian chờ chỉ do AbortSignal (OCR_SERVICE_TIMEOUT_MS) quyết định.
 */
export async function longRequestFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const request = new Request(input, init);
  const body = request.body ? Buffer.from(await request.arrayBuffer()) : undefined;
  const target = new URL(request.url);
  const transport = target.protocol === 'https:' ? https : http;
  const headers: Record<string, string> = Object.fromEntries(request.headers.entries());
  if (body) headers['content-length'] = String(body.length);
  return new Promise<Response>((resolve, reject) => {
    const outgoing = transport.request(target, { method: request.method, headers, signal: request.signal }, incoming => {
      const chunks: Buffer[] = [];
      incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
      incoming.on('error', reject);
      incoming.on('end', () => {
        const status = incoming.statusCode ?? 502;
        const responseHeaders = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) {
          if (value === undefined) continue;
          for (const item of Array.isArray(value) ? value : [value]) responseHeaders.append(name, item);
        }
        const nullBody = status === 204 || status === 205 || status === 304;
        resolve(new Response(nullBody ? null : Buffer.concat(chunks), { status, headers: responseHeaders }));
      });
    });
    outgoing.on('error', reject);
    outgoing.end(body);
  });
}
