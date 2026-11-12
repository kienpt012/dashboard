import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CandidateKind,
  CandidateStatus,
  DocumentType,
  DocumentStatus,
  ExtractionJobKind,
  ExtractionJobStatus,
  ExtractionMethod,
  FrameworkKind,
  Prisma,
  TargetDirection,
  TargetFrequency,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  CONVERTED_MIME_TYPES,
  openPdf,
  parseDocx,
  parseImage,
  parsePdf,
  parseXlsxTables,
  resolveOcrConfig,
  type ParsedDocument,
  type ParsedPage,
  type XlsxSheetTable,
} from './document-processing';
import { EXTRACTION_PROMPT_VERSION, LlmIndicatorExtractor, type LlmExtractedIndicator, type LlmResultCache } from './extraction-llm';
import {
  chunkLikelyHasIndicators,
  detectDeadline,
  detectFrequency,
  extractIndicatorsFromText,
  parseVietnameseNumber,
  type RuleExtractedIndicator,
} from './extraction-rules';
import {
  categoryByKeywords,
  categoryFromHeadings,
  chunkBody,
  detectOrdinal,
  documentGroups,
  documentOrderKey,
  locateQuote,
  pickCategoryByScore,
  STANDARD_CATEGORIES,
} from './extraction-structure';
import { adjustedConfidence, validateConsistency, validateRecord, type ValidationFlag, type ValidationRecord } from './extraction-validation';
import { dot, IndicatorMatcher, normalizeVector } from './indicator-matching';
import { diceSimilarity, matchDepartmentByName } from './matching';
import { detectThreshold } from './target-threshold';
import { describeMissing, missingItems, recheckText, uncoveredFigures } from './extraction-completeness';
import {
  OcrServiceClient,
  OcrServiceUnavailableError,
  pageBatches,
  type StructuredDocument,
  type StructuredElement,
  type StructuredPage,
} from './ocr-service';
import { OllamaModelMissingError, OllamaService } from './ollama';
import { parsePlanningDueDate } from './planning-date';
import { loadLocality } from './locality';
import { PrismaService } from './prisma.service';
import { pdfPageSpans } from './source-layout';
import { textLayoutPage, unitSection, type LayoutSpan } from './source-locator';
import { chunkFallbackPages, chunkStructuredPages, fallbackElements, resolveChunkingOptions, type ChunkingOptions, type StructuredChunk } from './structured-chunking';
import { readDocumentTables, tableRowsInChunk, type TableChunkRows, type TableRecord } from './table-extraction';
import { detectDocumentMeta, documentProfile } from './document-type';
import { extractTasks, TASK_RULE_VERSION, type ProseTask } from './task-extraction';
import { hasTargetFigure, sectionKind, unitWithDenominator } from './target-signal';

interface ClaimedJob {
  id: string;
  documentId: string;
  kind: ExtractionJobKind;
  attempts: number;
  createdById: string;
}

export class ExtractionJobCancelledError extends Error {
  constructor(readonly jobId: string) {
    super(`Extraction job ${jobId} was cancelled`);
    this.name = 'ExtractionJobCancelledError';
  }
}

class ExtractionJobOwnershipLostError extends Error {
  constructor(readonly jobId: string) {
    super(`Extraction job ${jobId} is no longer owned by this worker`);
    this.name = 'ExtractionJobOwnershipLostError';
  }
}

class ExtractionWorkerShutdownError extends Error {
  constructor() {
    super('Extraction worker đang dừng');
    this.name = 'ExtractionWorkerShutdownError';
  }
}

const JOB_LEASE_MINUTES = 10;

function parseBoundedInteger(raw: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function extractionRetryDelayMs(attempt: number): number {
  const normalized = Math.max(1, Math.floor(attempt));
  return Math.min(30 * 60 * 1_000, 20_000 * 2 ** (normalized - 1));
}

// Worker xử lý tài liệu bất đồng bộ theo đúng mô hình MailOutbox: claim bằng
// FOR UPDATE SKIP LOCKED, lease 10 phút, backoff mũ, DEAD_LETTER khi hết lượt.
// Job AI chạy hàng phút nên mỗi vòng chỉ nhận một job.
@Injectable()
export class ExtractionWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ExtractionWorker.name);
  private readonly workerId = `${process.pid}-${randomUUID()}`;
  private timer: NodeJS.Timeout | null = null;
  private activeRun: Promise<number> | null = null;
  private readonly activeJobControllers = new Map<string, AbortController>();
  private readonly pollIntervalMs: number;
  private readonly maxAttempts: number;
  private readonly maxOcrPages: number;
  private readonly maxLlmChunks: number;
  /** D-007 cũ: thêm ứng viên luật vào cả đoạn Qwen đã đọc được. Mặc định tắt (D-016): chỉ dùng luật khi Qwen lỗi. */
  private readonly ruleFillIn: boolean;
  /** Số lần tối đa hỏi lại Qwen cho các mục đánh số còn thiếu trong một văn bản (kiểm tra đủ mục); 0 = chỉ ghi chú. */
  private readonly recheckMax: number;
  /** Nhớ kết quả Qwen theo đoạn để "Đọc lại" không gọi lại Qwen cho đoạn không đổi; số ngày giữ (0 = tắt). */
  private readonly llmCacheDays: number;
  /** Bảng đã có cấu trúc hàng/cột được đọc bằng code, không gửi Qwen (D-022); "false" để tắt. */
  private readonly tableReader: boolean;
  /** Lọc đoạn trước khi gọi Qwen: "target" (mặc định) đòi con số trông như mức cần đạt; "basic" là bộ lọc cũ. */
  private readonly chunkFilter: 'target' | 'basic';
  /** Số đoạn gửi Qwen cùng lúc; "auto" = 1 trên CPU, 2 khi Ollama chạy model trên GPU. */
  private readonly llmConcurrency: number | 'auto';
  private readonly llmExtractor: LlmIndicatorExtractor;
  private readonly ocrClient: OcrServiceClient;
  private readonly matcher: IndicatorMatcher;
  private readonly chunking: ChunkingOptions;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ollama: OllamaService,
    config: ConfigService,
  ) {
    this.pollIntervalMs = parseBoundedInteger(config.get<string>('EXTRACTION_POLL_MS'), 4_000, 1_000, 60_000);
    this.maxAttempts = parseBoundedInteger(config.get<string>('EXTRACTION_MAX_ATTEMPTS'), 3, 1, 10);
    // 0 = không giới hạn: quy trình bản 2 thay trần 20 trang bằng hàng đợi theo trang (lease gia hạn sau mỗi trang/lô).
    this.maxOcrPages = parseBoundedInteger(config.get<string>('EXTRACTION_MAX_OCR_PAGES'), 0, 0, 5000);
    // Tài liệu hàng trăm trang: mỗi đoạn LLM tốn 2–5 phút GPU nên phải có trần;
    // đoạn vượt trần vẫn được bộ luật xử lý và job ghi chú rõ để người dùng biết.
    this.maxLlmChunks = parseBoundedInteger(config.get<string>('EXTRACTION_MAX_LLM_CHUNKS'), 40, 1, 500);
    this.ruleFillIn = (config.get<string>('EXTRACTION_RULE_FILL_IN') ?? '').trim().toLowerCase() === 'true';
    this.recheckMax = parseBoundedInteger(config.get<string>('EXTRACTION_RECHECK_MAX'), 10, 0, 100);
    this.llmCacheDays = parseBoundedInteger(config.get<string>('EXTRACTION_LLM_CACHE_DAYS'), 90, 0, 3650);
    this.tableReader = (config.get<string>('EXTRACTION_TABLE_READER') ?? '').trim().toLowerCase() !== 'false';
    this.chunkFilter = (config.get<string>('EXTRACTION_CHUNK_FILTER') ?? '').trim().toLowerCase() === 'basic' ? 'basic' : 'target';
    const concurrency = (config.get<string>('EXTRACTION_LLM_CONCURRENCY') ?? '').trim().toLowerCase();
    this.llmConcurrency = !concurrency || concurrency === 'auto' ? 'auto' : parseBoundedInteger(concurrency, 1, 1, 8);
    this.llmExtractor = new LlmIndicatorExtractor(ollama);
    this.ocrClient = new OcrServiceClient();
    this.matcher = new IndicatorMatcher(prisma, ollama);
    this.chunking = resolveChunkingOptions();
  }

  onApplicationBootstrap(): void {
    if (process.env.DISABLE_EXTRACTION_WORKER === 'true') return;
    void this.runSafely();
    this.timer = setInterval(() => void this.runSafely(), this.pollIntervalMs);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const controller of this.activeJobControllers.values()) {
      if (!controller.signal.aborted) controller.abort(new ExtractionWorkerShutdownError());
    }
    if (this.activeRun) await this.activeRun;
  }

  requestCancellation(jobId: string): boolean {
    const controller = this.activeJobControllers.get(jobId);
    if (!controller || controller.signal.aborted) return false;
    controller.abort(new ExtractionJobCancelledError(jobId));
    return true;
  }

  private runSafely(): Promise<number> {
    if (this.activeRun) return this.activeRun;
    this.activeRun = this.processAvailable()
      .catch(() => {
        this.logger.error('Không thể xử lý hàng đợi trích xuất tài liệu');
        return 0;
      })
      .finally(() => {
        this.activeRun = null;
      });
    return this.activeRun;
  }

  async processAvailable(): Promise<number> {
    await this.escalateExhaustedJobs();
    const claimed = await this.claimNextJob();
    if (!claimed) return 0;
    const controller = claimed.kind === ExtractionJobKind.INDICATOR_EXTRACT
      ? new AbortController()
      : null;
    if (controller) this.activeJobControllers.set(claimed.id, controller);
    try {
      if (claimed.kind === ExtractionJobKind.DOCUMENT_PARSE) {
        await this.processParseJob(claimed);
      } else {
        await this.processExtractJob(claimed, controller!.signal);
      }
      return 1;
    } catch (error) {
      if (error instanceof ExtractionWorkerShutdownError) {
        await this.releaseJobAfterShutdown(claimed);
        this.logger.log(`Đã trả job ${claimed.id} về hàng đợi khi worker dừng`);
        return 0;
      }
      if (error instanceof ExtractionJobCancelledError || error instanceof ExtractionJobOwnershipLostError
        || await this.isJobCancelled(claimed.id)) {
        this.logger.log(`Đã dừng job trích xuất ${claimed.id} mà không ghi kết quả dở dang`);
        return 1;
      }
      const message = error instanceof Error ? error.message.slice(0, 280) : 'UNKNOWN_ERROR';
      this.logger.error(`Job ${claimed.id} thất bại: ${message}`);
      await this.markFailed(claimed, message);
      return 0;
    } finally {
      if (controller && this.activeJobControllers.get(claimed.id) === controller) {
        this.activeJobControllers.delete(claimed.id);
      }
    }
  }

  private async isJobCancelled(jobId: string): Promise<boolean> {
    try {
      const job = await this.prisma.extractionJob.findUnique({
        where: { id: jobId },
        select: { status: true, cancelRequestedAt: true },
      });
      return Boolean(job && (job.status === ExtractionJobStatus.CANCELLED || job.cancelRequestedAt !== null));
    } catch {
      return false;
    }
  }

  private async releaseJobAfterShutdown(job: ClaimedJob): Promise<void> {
    await this.prisma.extractionJob.updateMany({
      where: {
        id: job.id,
        status: ExtractionJobStatus.PROCESSING,
        lockedBy: this.workerId,
        cancelRequestedAt: null,
      },
      data: {
        status: ExtractionJobStatus.PENDING,
        attempts: { decrement: 1 },
        availableAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        lastError: null,
      },
    });
  }

  private async escalateExhaustedJobs(): Promise<void> {
    const staleLockBefore = new Date(Date.now() - JOB_LEASE_MINUTES * 60 * 1_000);
    const escalated = await this.prisma.extractionJob.findMany({
      where: {
        attempts: { gte: this.maxAttempts },
        OR: [
          { status: ExtractionJobStatus.PENDING },
          { status: ExtractionJobStatus.PROCESSING, lockedAt: { lt: staleLockBefore } },
        ],
      },
      select: { id: true, documentId: true, kind: true },
    });
    if (!escalated.length) return;
    await this.prisma.extractionJob.updateMany({
      where: { id: { in: escalated.map(job => job.id) } },
      data: {
        status: ExtractionJobStatus.DEAD_LETTER,
        lockedAt: null,
        lockedBy: null,
        lastError: 'MAX_ATTEMPTS_EXCEEDED',
      },
    });
    // Tài liệu có job parse chết hẳn phải được đánh dấu FAILED để người dùng biết.
    const parseDocumentIds = escalated
      .filter(job => job.kind === ExtractionJobKind.DOCUMENT_PARSE)
      .map(job => job.documentId);
    if (parseDocumentIds.length) {
      await this.prisma.sourceDocument.updateMany({
        where: { id: { in: parseDocumentIds }, status: DocumentStatus.PROCESSING },
        data: {
          status: DocumentStatus.FAILED,
          processingError: 'Hệ thống đã thử xử lý nhiều lần nhưng không thành công.',
        },
      });
    }
  }

  private async claimNextJob(): Promise<ClaimedJob | null> {
    const rows = await this.prisma.$transaction(tx => tx.$queryRaw<ClaimedJob[]>(Prisma.sql`
      WITH candidates AS (
        SELECT "id"
        FROM "ExtractionJob"
        WHERE "attempts" < ${this.maxAttempts}
          AND "cancelRequestedAt" IS NULL
          AND (
            ("status" = 'PENDING'::"ExtractionJobStatus" AND "availableAt" <= CURRENT_TIMESTAMP)
            OR (
              "status" = 'PROCESSING'::"ExtractionJobStatus"
              AND "lockedAt" < CURRENT_TIMESTAMP - INTERVAL '10 minutes'
            )
          )
        ORDER BY "availableAt" ASC, "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE "ExtractionJob" AS job
      SET "status" = 'PROCESSING'::"ExtractionJobStatus",
          "attempts" = job."attempts" + 1,
          "lockedAt" = CURRENT_TIMESTAMP,
          "lockedBy" = ${this.workerId},
          "startedAt" = COALESCE(job."startedAt", CURRENT_TIMESTAMP),
          "updatedAt" = CURRENT_TIMESTAMP
      FROM candidates
      WHERE job."id" = candidates."id"
      RETURNING job."id", job."documentId", job."kind", job."attempts", job."createdById"
    `));
    return rows[0] ?? null;
  }

  private async markFailed(job: ClaimedJob, errorMessage: string): Promise<void> {
    const exhausted = job.attempts >= this.maxAttempts;
    await this.prisma.extractionJob.updateMany({
      where: {
        id: job.id,
        status: ExtractionJobStatus.PROCESSING,
        lockedBy: this.workerId,
        cancelRequestedAt: null,
      },
      data: {
        status: exhausted ? ExtractionJobStatus.DEAD_LETTER : ExtractionJobStatus.PENDING,
        availableAt: exhausted ? new Date() : new Date(Date.now() + extractionRetryDelayMs(job.attempts)),
        lockedAt: null,
        lockedBy: null,
        lastError: errorMessage.slice(0, 280),
      },
    });
    if (job.kind === ExtractionJobKind.DOCUMENT_PARSE) {
      await this.prisma.sourceDocument.updateMany({
        where: { id: job.documentId },
        data: exhausted
          ? { status: DocumentStatus.FAILED, processingError: errorMessage.slice(0, 500) }
          : { status: DocumentStatus.PROCESSING },
      });
    }
  }

  private async completeJob(job: ClaimedJob, data: Prisma.ExtractionJobUpdateManyMutationInput): Promise<void> {
    await this.prisma.extractionJob.updateMany({
      where: {
        id: job.id,
        status: ExtractionJobStatus.PROCESSING,
        lockedBy: this.workerId,
        cancelRequestedAt: null,
      },
      data: {
        ...data,
        status: ExtractionJobStatus.COMPLETED,
        finishedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        lastError: null,
      },
    });
  }

  private async assertExtractJobActive(job: ClaimedJob, signal: AbortSignal): Promise<void> {
    throwIfAborted(signal);
    const current = await this.prisma.extractionJob.findUnique({
      where: { id: job.id },
      select: { status: true, lockedBy: true, cancelRequestedAt: true },
    });
    if (current?.status === ExtractionJobStatus.PROCESSING
      && current.lockedBy === this.workerId
      && current.cancelRequestedAt === null) {
      return;
    }
    throw await this.resolveExtractJobStop(job, current);
  }

  private async resolveExtractJobStop(
    job: ClaimedJob,
    known?: { status: ExtractionJobStatus; cancelRequestedAt: Date | null } | null,
  ): Promise<Error> {
    const current = known ?? await this.prisma.extractionJob.findUnique({
      where: { id: job.id },
      select: { status: true, cancelRequestedAt: true },
    });
    if (current?.status === ExtractionJobStatus.CANCELLED || current?.cancelRequestedAt) {
      return new ExtractionJobCancelledError(job.id);
    }
    return new ExtractionJobOwnershipLostError(job.id);
  }

  /** Gia hạn lease job đọc văn bản và ghi tiến độ theo trang (hàng đợi theo trang của quy trình bản 2). */
  private async touchParseJob(job: ClaimedJob, pagesDone: number, pagesTotal: number): Promise<void> {
    const touched = await this.prisma.extractionJob.updateMany({
      where: { id: job.id, status: ExtractionJobStatus.PROCESSING, lockedBy: this.workerId, cancelRequestedAt: null },
      data: { lockedAt: new Date(), pagesDone, pagesTotal },
    });
    if (touched.count !== 1) throw new ExtractionJobOwnershipLostError(job.id);
  }

  private async processParseJob(job: ClaimedJob): Promise<void> {
    const document = await this.prisma.sourceDocument.findUnique({
      where: { id: job.documentId },
      select: {
        id: true, mimeType: true, originalName: true, data: true, status: true, autoExtract: true,
        docType: true, docNumber: true, issuedDate: true,
      },
    });
    if (!document) {
      await this.completeJob(job, {});
      return;
    }
    await this.prisma.sourceDocument.updateMany({
      where: { id: document.id },
      data: { status: DocumentStatus.PROCESSING, processingError: null },
    });

    const startedAt = Date.now();
    const buffer = Buffer.from(document.data);
    const notes: string[] = [];
    let outcome: ParseOutcome | null = null;
    // B2–B6 chạy ở ocr-service (Docling + RapidOCR + VietOCR). Dịch vụ chưa bật, chưa nạp xong mô hình hoặc lỗi giữa
    // chừng thì dùng bộ đọc dự phòng (pdf.js + Tesseract) cho cả văn bản và ghi rõ trên job, không để trang rỗng.
    if (this.ocrClient.enabled) {
      if (await this.ocrClient.isReady()) {
        try {
          outcome = await this.parseWithOcrService(job, document, buffer);
        } catch (error) {
          if (error instanceof ExtractionJobOwnershipLostError) throw error;
          const reason = error instanceof OcrServiceUnavailableError || error instanceof Error ? error.message.slice(0, 160) : 'lỗi';
          this.logger.warn(`ocr-service không đọc được tài liệu ${document.id}: ${reason}`);
          notes.push(`ocr-service lỗi (${reason}): dùng bộ đọc dự phòng pdf.js + Tesseract.`);
        }
      } else {
        this.logger.warn(`ocr-service chưa sẵn sàng (${this.ocrClient.config.baseUrl}/health): tài liệu ${document.id} dùng bộ đọc dự phòng`);
        notes.push('ocr-service chưa sẵn sàng: dùng bộ đọc dự phòng pdf.js + Tesseract.');
      }
    }
    if (!outcome) outcome = await this.parseWithFallback(job, document, buffer);
    notes.push(...outcome.notes);

    const totalText = outcome.pages.reduce((sum, page) => sum + page.text.length, 0);
    if (!totalText) {
      throw new Error('Không đọc được nội dung văn bản nào từ tài liệu (kể cả sau OCR).');
    }

    // Loại văn bản, số ký hiệu, ngày ban hành đọc từ trang đầu; chỉ điền chỗ cán bộ để trống (loại "Khác").
    const meta = detectDocumentMeta(outcome.pages[0]?.text);
    const metaUpdate: Prisma.SourceDocumentUpdateManyMutationInput = {};
    if (meta.docType && document.docType === DocumentType.KHAC) {
      metaUpdate.docType = meta.docType;
      notes.push(`Loại văn bản nhận theo ${meta.basis}: ${documentProfile(meta.docType).label}.`);
    }
    if (meta.docNumber && document.docNumber === null) metaUpdate.docNumber = meta.docNumber;
    if (meta.issuedDate && document.issuedDate === null) metaUpdate.issuedDate = new Date(`${meta.issuedDate}T00:00:00.000+07:00`);

    const chunks = outcome.chunks;
    const elapsedMs = Date.now() - startedAt;
    const stats = {
      ...outcome.stats,
      detectedDocType: meta.docType,
      chunks: chunks.length,
      chunksWithoutDigits: chunks.filter(chunk => !chunk.hasDigits).length,
      elapsedMs,
      msPerPage: outcome.pages.length ? Math.round(elapsedMs / outcome.pages.length) : null,
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.documentPage.deleteMany({ where: { documentId: document.id } });
      await tx.documentChunk.deleteMany({ where: { documentId: document.id } });
      await tx.documentPage.createMany({
        data: outcome.pages.map(page => ({
          documentId: document.id,
          pageNumber: page.pageNumber,
          text: page.text,
          ocrUsed: page.ocrUsed,
          ocrConfidence: page.ocrConfidence,
          layout: page.layout?.length ? (page.layout as Prisma.InputJsonValue) : undefined,
          kind: page.kind,
          elements: page.elements?.length ? (page.elements as unknown as Prisma.InputJsonValue) : undefined,
        })),
      });
      await tx.documentChunk.createMany({
        data: chunks.map(chunk => ({
          documentId: document.id,
          chunkIndex: chunk.chunkIndex,
          pageFrom: chunk.pageFrom,
          pageTo: chunk.pageTo,
          text: chunk.text,
          charCount: chunk.charCount,
          headingPath: chunk.headingPath.length ? chunk.headingPath : undefined,
          elementIds: chunk.elementIds.length ? chunk.elementIds : undefined,
          kind: chunk.kind,
          leadSentence: chunk.leadSentence,
          hasDigits: chunk.hasDigits,
          ocrFlagged: chunk.ocrFlagged,
        })),
      });
      await tx.sourceDocument.updateMany({
        where: { id: document.id },
        data: {
          status: DocumentStatus.PROCESSED,
          pageCount: outcome.pageCount,
          hasTextLayer: outcome.hasTextLayer,
          ocrUsed: outcome.ocrUsed,
          parserVersion: outcome.parserVersion,
          processingError: null,
          ...metaUpdate,
        },
      });
      // Nối tiếp tự động sang bước trích xuất chỉ tiêu (trừ văn bản chỉ lưu để tra cứu, định vị nguồn).
      if (document.autoExtract) {
        await tx.extractionJob.create({
          data: {
            documentId: document.id,
            kind: ExtractionJobKind.INDICATOR_EXTRACT,
            createdById: job.createdById,
          },
        });
      }
    });
    await this.completeJob(job, {
      chunksTotal: chunks.length,
      chunksDone: chunks.length,
      pagesTotal: outcome.pageCount,
      pagesDone: outcome.pages.length,
      note: notes.length ? notes.join(' ').slice(0, 2000) : null,
      stats: stats as Prisma.InputJsonValue,
    });
    this.logger.log(`Đã phân tích tài liệu ${document.id} (${outcome.parserVersion}): ${outcome.pageCount} trang, ${chunks.length} đoạn`);
  }

  /** B2–B7 qua ocr-service: hỏi số trang, đọc theo lô trang, gia hạn lease sau mỗi lô, rồi chia đoạn theo mục. */
  private async parseWithOcrService(
    job: ClaimedJob,
    document: { id: string; originalName: string },
    buffer: Buffer,
  ): Promise<ParseOutcome> {
    const filename = document.originalName || 'document';
    const info = await this.ocrClient.inspect(buffer, filename);
    const total = Math.max(1, info.pageCount ?? 1);
    await this.touchParseJob(job, 0, total);
    const batches = info.kind === 'pdf' && total > this.ocrClient.config.pageBatch
      ? pageBatches(total, this.ocrClient.config.pageBatch)
      : [null];
    const pages: StructuredPage[] = [];
    const warnings: string[] = [];
    let parser: StructuredDocument['parser'] | null = null;
    for (const range of batches) {
      const result = await this.ocrClient.parse(buffer, filename, range ?? undefined);
      parser = result.parser;
      warnings.push(...result.warnings);
      pages.push(...result.pages);
      await this.touchParseJob(job, range ? range.to : result.pages.length, range ? total : Math.max(total, result.pages.length));
    }
    pages.sort((a, b) => a.page - b.page);
    // ocr-service chỉ trả khung dòng cho trang OCR; trang có lớp chữ lấy khung từ pdf.js như trước (định vị nguồn).
    if (info.kind === 'pdf') {
      let pdf: Awaited<ReturnType<typeof openPdf>> | null = null;
      for (const page of pages) {
        if (page.spans?.length || !page.text) continue;
        pdf ??= await openPdf(buffer);
        page.spans = await pdfPageSpans(await pdf.getPage(page.page)).catch(() => null);
      }
    }
    const ocrElements = pages.flatMap(page => page.elements.filter(element => OCR_SOURCES.has(element.source)));
    const parserVersion = parser
      ? `${parser.name} ${parser.version}${parser.docling ? ` · docling ${parser.docling}` : ''}${parser.secondReader ? ` · ${parser.secondReader}` : ''}`
      : 'ocr-service';
    return {
      pages: pages.map(page => ({
        pageNumber: page.page,
        text: page.text,
        ocrUsed: page.ocrUsed,
        ocrConfidence: page.ocrConfidence,
        layout: page.spans,
        kind: page.kind,
        elements: page.elements,
      })),
      pageCount: info.kind === 'pdf' ? total : pages.length,
      hasTextLayer: pages.some(page => page.kind === 'text' || page.kind === 'docx' || page.kind === 'xlsx'),
      ocrUsed: pages.some(page => page.ocrUsed),
      chunks: chunkStructuredPages(pages, this.chunking),
      parserVersion,
      notes: [...new Set(warnings)].slice(0, 5),
      stats: {
        parser: 'ocr-service',
        pages: pages.length,
        ocrPages: pages.filter(page => page.ocrUsed).length,
        pageKinds: countBy(pages.map(page => page.kind)),
        ocrElements: ocrElements.length,
        ocrFlaggedElements: ocrElements.filter(element => element.flags.includes('can_ra_soat')).length,
      },
    };
  }

  /** Bộ đọc dự phòng trong Node (pdf.js + Tesseract), không còn trần 20 trang OCR (EXTRACTION_MAX_OCR_PAGES=0). */
  private async parseWithFallback(
    job: ClaimedJob,
    document: { mimeType: string },
    buffer: Buffer,
  ): Promise<ParseOutcome> {
    const ocr = resolveOcrConfig();
    let parsed: ParsedDocument;
    let kind: string;
    if (document.mimeType === 'application/pdf') {
      parsed = await parsePdf(buffer, {
        ocr,
        maxOcrPages: this.maxOcrPages,
        onPage: (done, total) => this.touchParseJob(job, done, total),
      });
      kind = 'pdf';
    } else if (document.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      parsed = await parseDocx(buffer);
      kind = 'docx';
    } else if (document.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      return xlsxOutcome(await parseXlsxTables(buffer), this.chunking);
    } else if (document.mimeType.startsWith('image/')) {
      parsed = await parseImage(buffer, ocr);
      kind = 'image';
    } else if (CONVERTED_MIME_TYPES.includes(document.mimeType)) {
      throw new Error('Tệp .doc, .xls, .odt, .ods, .rtf cần ocr-service để chuyển đổi. Hãy bật ocr-service hoặc lưu lại thành .docx/.xlsx.');
    } else {
      throw new Error(`Định dạng không được hỗ trợ: ${document.mimeType}`);
    }
    const notes: string[] = [];
    if (parsed.skippedOcrPages) {
      notes.push(`${parsed.skippedOcrPages} trang scan chưa được OCR vì vượt EXTRACTION_MAX_OCR_PAGES=${this.maxOcrPages}.`);
    }
    const pageKind = (page: ParsedPage) => kind === 'pdf' ? (page.ocrUsed ? 'scan' : 'text') : kind;
    return {
      pages: parsed.pages.map(page => ({
        pageNumber: page.pageNumber,
        text: page.text,
        ocrUsed: page.ocrUsed,
        ocrConfidence: page.ocrConfidence ?? null,
        layout: page.layout ?? null,
        kind: pageKind(page),
        elements: fallbackElements(page),
      })),
      pageCount: parsed.pageCount,
      hasTextLayer: parsed.hasTextLayer,
      ocrUsed: parsed.ocrUsed,
      chunks: chunkFallbackPages(parsed.pages, this.chunking),
      parserVersion: kind === 'pdf' || kind === 'image' ? 'fallback pdf.js + tesseract' : `fallback ${kind}`,
      notes,
      stats: {
        parser: 'fallback',
        pages: parsed.pages.length,
        ocrPages: parsed.pages.filter(page => page.ocrUsed).length,
        skippedOcrPages: parsed.skippedOcrPages ?? 0,
        pageKinds: countBy(parsed.pages.map(pageKind)),
      },
    };
  }

  /**
   * Văn bản chia phần theo đơn vị (phụ lục giao chỉ tiêu cho mọi xã, phường): các trang của địa phương mình và ghi chú
   * phạm vi. Văn bản không chia phần (văn bản của chính phường, quyết định chung) trả về null — đọc toàn văn bản.
   */
  private async localitySection(documentId: string) {
    const locality = await loadLocality(this.prisma);
    const term = locality.configured ? locality.shortName?.trim() || locality.name : '';
    if (!term) return null;
    const pages = await this.prisma.documentPage.findMany({ where: { documentId }, select: { pageNumber: true, text: true } });
    const section = unitSection(pages.map(page => textLayoutPage(page.pageNumber, page.text)), term);
    if (!section.multiUnit) return null;
    const units = section.otherUnits + (section.pages.length ? 1 : 0);
    if (!section.pages.length) {
      // Không nhận ra phần của mình (tên trên văn bản viết khác?): đọc toàn văn bản để không bỏ sót, cán bộ loại đề xuất thừa.
      return { pages: null, note: `Văn bản giao cho ${units} đơn vị nhưng không nhận ra phần của ${term}: AI đọc toàn văn bản.` };
    }
    const ranges = pageRanges(section.pages);
    return { pages: new Set(section.pages), note: `Văn bản giao cho ${units} đơn vị: chỉ trích xuất phần của ${term} (trang ${ranges}).` };
  }

  /**
   * Lĩnh vực chuẩn của từng chỉ tiêu, theo thứ tự ưu tiên: từ khoá trong tên chỉ tiêu (cụ thể nhất: "số giường bệnh"
   * là Y tế dù nằm dưới đề mục "văn hoá - xã hội"); từ khoá trong đề mục của văn bản; so nghĩa (bge-m3) giữa
   * "đề mục + tên chỉ tiêu" với mô tả từng lĩnh vực; gợi ý của mô hình.
   * Không đủ căn cứ thì để trống cho người duyệt chọn.
   */
  private async resolveCategories(
    items: { headingPath: string[]; group: string | null; name: string; catalogGroup?: string | null; modelCategory: string | null }[],
    canEmbed: boolean,
    signal: AbortSignal,
  ): Promise<(string | null)[]> {
    // Đề mục của chính văn bản là căn cứ mạnh nhất (người soạn đã xếp nhóm); đề mục "Văn hoá - xã hội" là nhóm rộng
    // nên tên chỉ tiêu nói rõ Y tế hay Giáo dục thì theo tên. Không có đề mục thì theo mục gần nhất trong danh mục
    // chuẩn (bge-m3), rồi mới tới từ khoá trong tên.
    const result = items.map((item) => {
      const byHeading = categoryFromHeadings(item.headingPath);
      const byName = categoryByKeywords(item.name);
      if (byHeading && byName && NARROWER_CATEGORIES[byHeading]?.includes(byName)) return byName;
      return byHeading ?? categoryByKeywords(item.catalogGroup) ?? byName;
    });
    const missing = result.map((value, index) => (value ? -1 : index)).filter(index => index >= 0);
    if (missing.length && canEmbed) {
      try {
        const prototypes = (await this.ollama.embed(STANDARD_CATEGORIES.map(category => category.prototype))).map(normalizeVector);
        for (let start = 0; start < missing.length; start += 32) {
          throwIfAborted(signal);
          const batch = missing.slice(start, start + 32);
          const vectors = await this.ollama.embed(batch.map(index => [items[index].group, items[index].name].filter(Boolean).join(': ')));
          vectors.forEach((vector, offset) => {
            const unit = normalizeVector(vector);
            result[batch[offset]] = pickCategoryByScore(prototypes.map(prototype => dot(prototype, unit)));
          });
        }
      } catch (error) {
        if (signal.aborted) throw error;
        this.logger.warn(`Không so nghĩa được lĩnh vực bằng ${this.ollama.embedModel}: dùng gợi ý của mô hình và từ khoá.`);
      }
    }
    return result.map((value, index) => value ?? categoryByKeywords(items[index].modelCategory));
  }

  /**
   * Bộ nhớ kết quả Qwen theo đoạn cho một lượt. Khoá gồm digest của model trong Ollama, nên tạo lại model cùng tên từ
   * trọng số khác thì không dùng nhầm kết quả cũ; không hỏi được digest hoặc EXTRACTION_LLM_CACHE_DAYS=0 thì không nhớ.
   */
  private async openLlmCache(documentId: string, signal: AbortSignal): Promise<{ store: LlmResultCache; modelDigest: string } | undefined> {
    if (!this.llmCacheDays || typeof this.ollama.modelDigest !== 'function') return undefined;
    const modelDigest = await this.ollama.modelDigest(this.ollama.extractModel, signal);
    if (!modelDigest) return undefined;
    const cutoff = new Date(Date.now() - this.llmCacheDays * 86_400_000);
    await this.prisma.llmExtractionCache.deleteMany({ where: { createdAt: { lt: cutoff } } }).catch(() => undefined);
    const store: LlmResultCache = {
      get: async (key) => {
        const row = await this.prisma.llmExtractionCache.findUnique({ where: { key }, select: { content: true, createdAt: true } });
        return row && row.createdAt >= cutoff ? row.content : null;
      },
      put: async (key, entry) => {
        await this.prisma.llmExtractionCache.upsert({
          where: { key },
          create: { key, model: entry.model, content: entry.content, durationMs: entry.durationMs, documentId },
          update: { model: entry.model, content: entry.content, durationMs: entry.durationMs, createdAt: new Date() },
        });
      },
    };
    return { store, modelDigest };
  }

  /** Gia hạn lease job trích xuất giữa hai lần gọi Qwen (một đoạn có thể gọi hai lần, mỗi lần tới 8 phút). */
  private async touchExtractJob(job: ClaimedJob, chunksDone?: number): Promise<void> {
    const touched = await this.prisma.extractionJob.updateMany({
      where: { id: job.id, status: ExtractionJobStatus.PROCESSING, lockedBy: this.workerId, cancelRequestedAt: null },
      data: { lockedAt: new Date(), ...(chunksDone !== undefined ? { chunksDone } : {}) },
    });
    if (touched.count !== 1) throw await this.resolveExtractJobStop(job);
  }

  private async processExtractJob(job: ClaimedJob, signal: AbortSignal): Promise<void> {
    await this.assertExtractJobActive(job, signal);
    const startedAt = Date.now();
    const document = await this.prisma.sourceDocument.findUnique({
      where: { id: job.documentId },
      select: { id: true, title: true, docNumber: true, year: true, status: true, docType: true },
    });
    if (!document) {
      await this.completeJob(job, {});
      return;
    }
    const allChunks = await this.prisma.documentChunk.findMany({
      where: { documentId: document.id },
      select: {
        id: true, chunkIndex: true, pageFrom: true, pageTo: true, text: true,
        kind: true, hasDigits: true, headingPath: true, elementIds: true, leadSentence: true,
      },
      orderBy: { chunkIndex: 'asc' },
    });
    if (!allChunks.length) {
      throw new Error('Tài liệu chưa có nội dung được phân tích.');
    }
    // Văn bản giao chỉ tiêu cho nhiều đơn vị (phụ lục cho mọi xã, phường): chỉ đọc phần của địa phương mình —
    // không sinh đề xuất từ chỉ tiêu của đơn vị khác, và nhanh hơn nhiều với văn bản hàng trăm trang.
    const section = await this.localitySection(document.id);
    const own = section?.pages;
    const chunks = own
      ? allChunks.filter(chunk => Array.from({ length: chunk.pageTo - chunk.pageFrom + 1 }, (_, offset) => chunk.pageFrom + offset).some(page => own.has(page)))
      : allChunks;
    const sectionNote = section?.note ?? null;
    if (sectionNote) this.logger.log(`Tài liệu ${document.id}: ${sectionNote}`);

    // Phần tử B6 của các trang (id → phần tử) để gắn nguồn tới từng dòng/ô và cờ OCR cho bản ghi.
    const pageRows = await this.prisma.documentPage.findMany({
      where: { documentId: document.id },
      select: { pageNumber: true, elements: true },
    });
    const elementById = new Map<string, StructuredElement>();
    const elementsByPage = new Map<number, StructuredElement[]>();
    for (const row of pageRows) {
      const elements = Array.isArray(row.elements) ? (row.elements as unknown as StructuredElement[]) : [];
      elementsByPage.set(row.pageNumber, elements);
      for (const element of elements) if (element?.id) elementById.set(element.id, element);
    }

    // Bảng có cấu trúc hàng/cột: code đọc thẳng từng hàng theo hàng tiêu đề (D-022), không gửi Qwen. Gắn bản ghi vào
    // đoạn chứa hàng của nó; bảng nào còn hàng không khớp được với đoạn (văn bản đọc từ bản cũ) thì để Qwen đọc.
    const locality = await loadLocality(this.prisma);
    const tableRows = new Map<string, TableChunkRows>();
    if (this.tableReader) {
      const readings = readDocumentTables(
        pageRows.map(row => ({ pageNumber: row.pageNumber, elements: elementsByPage.get(row.pageNumber) ?? [] })),
        {
          format: this.chunking.tableFormat,
          defaultYear: document.year,
          localityTerms: locality.configured ? [locality.shortName?.trim() || locality.name.replace(/^(phường|xã|thị trấn|đặc khu)\s+/iu, '')] : [],
        },
      );
      const assigned = new Map<string, { rows: Set<number>; chunkIds: string[] }>();
      for (const chunk of allChunks) {
        const ids = Array.isArray(chunk.elementIds) ? (chunk.elementIds as string[]) : [];
        const reading = chunk.kind === 'table' && ids.length === 1 ? readings.get(ids[0]) : undefined;
        if (!reading?.recognized) continue;
        const entry = assigned.get(ids[0]) ?? { rows: new Set<number>(), chunkIds: [] };
        assigned.set(ids[0], entry);
        entry.chunkIds.push(chunk.id);
        tableRows.set(chunk.id, tableRowsInChunk(reading, chunkBody(chunk.text), entry.rows));
      }
      for (const [elementId, entry] of assigned) {
        const reading = readings.get(elementId)!;
        if (reading.records.every(record => entry.rows.has(record.row))) continue;
        for (const chunkId of entry.chunkIds) tableRows.delete(chunkId);
      }
    }

    // Hỏi lại tối đa 3 lần với thời gian chờ dài: kết luận nhầm "Ollama không hoạt động" sẽ đẩy cả văn bản sang bộ luật.
    const llmAvailable = await this.ollama.isAvailable(signal, { timeoutMs: this.ollama.healthTimeoutMs, attempts: 3 });
    const initialized = await this.prisma.extractionJob.updateMany({
      where: {
        id: job.id,
        status: ExtractionJobStatus.PROCESSING,
        lockedBy: this.workerId,
        cancelRequestedAt: null,
      },
      data: {
        chunksTotal: chunks.length,
        chunksDone: 0,
        lockedAt: new Date(),
        ...(sectionNote ? { note: sectionNote } : {}),
        model: null,
        promptVersion: llmAvailable ? EXTRACTION_PROMPT_VERSION : 'rule-only',
      },
    });
    if (initialized.count !== 1) throw await this.resolveExtractJobStop(job);

    interface PendingCandidate {
      chunk: (typeof chunks)[number];
      method: ExtractionMethod;
      payload: LlmExtractedIndicator | RuleExtractedIndicator;
      /** Qwen không đọc được đoạn này nên bản ghi do bộ luật dự phòng tạo (lý do hiển thị cho người duyệt). */
      fallbackReason: string | null;
      repaired: boolean;
      formTemplate?: string | null;
      /** Bản ghi do bộ đọc bảng tạo: giữ mã số, ô kế hoạch nguyên văn, số thực hiện, nhóm trong bảng và vị trí hàng. */
      table?: TableRecord;
      position?: number;
      /** Nhiệm vụ bóc từ câu giao việc trong văn xuôi (kế hoạch, công văn, chỉ thị). */
      proseTask?: ProseTask;
    }
    const isTask = (item: PendingCandidate) => !!item.proseTask || item.table?.kind === 'task';
    const profile = documentProfile(document.docType);
    const stats = {
      chunks: chunks.length,
      skippedNoDigits: 0,
      skippedNoSignal: 0,
      skippedNoTarget: 0,
      taskCandidates: 0,
      droppedUnsupported: 0,
      formChunks: 0,
      tableChunks: 0,
      llmChunks: 0,
      llmSucceeded: 0,
      llmFailed: 0,
      llmTimedOut: 0,
      llmParseErrors: 0,
      llmRetried: 0,
      llmCapped: 0,
      ruleFallbackChunks: 0,
      llmMs: 0,
      recheckCalls: 0,
      recheckRecovered: 0,
      llmCached: 0,
    };
    const llmCache = llmAvailable ? await this.openLlmCache(document.id, signal) : undefined;
    let llmChunksUsed = 0;
    // Kết quả và ghi chú gom theo đoạn rồi nối lại theo thứ tự đoạn, để chạy nhiều đoạn cùng lúc vẫn cho đúng thứ tự:
    // - missing: mục đánh số có số liệu mà sau khi hỏi lại vẫn không có đề xuất nào;
    // - table: hàng của bảng có tên nhưng không có giá trị để lập đề xuất;
    // - uncovered: con số ghi rõ là mức cần đạt mà không thuộc đề xuất nào (văn bản không đánh số).
    const perChunk = chunks.map(() => ({ pending: [] as PendingCandidate[], missing: [] as string[], table: [] as string[], uncovered: [] as string[] }));
    // Số đoạn gửi Qwen cùng lúc. "auto": bắt đầu bằng 1; sau lần gọi Qwen thật đầu tiên, nếu Ollama báo model đang nằm
    // trên GPU thì tăng lên 2. Trên CPU một yêu cầu đã dùng hết nhân, chạy song song chỉ làm các yêu cầu chờ nhau hết giờ.
    let concurrency = this.llmConcurrency === 'auto' ? 1 : this.llmConcurrency;
    let processorChecked = this.llmConcurrency !== 'auto';
    let chunksDone = 0;

    await runLimited(chunks, () => concurrency, async (chunk, index) => {
      throwIfAborted(signal);
      const { pending, missing: missingNotes, table: tableNotes, uncovered: uncoveredNotes } = perChunk[index];
      // Phần của văn bản theo đề mục: phần nhiệm vụ, giải pháp đầy con số không phải mức cần đạt (ngày hạn, "02 đợt").
      const chunkHeadings = Array.isArray(chunk.headingPath) ? (chunk.headingPath as string[]) : [];
      const section = sectionKind(chunkHeadings);
      // Hồ sơ theo loại văn bản: kế hoạch, chương trình bóc nhiệm vụ ở phần nhiệm vụ/tổ chức thực hiện; công văn, chỉ thị,
      // thông báo bóc ở mọi phần không phải phần chỉ tiêu. Bằng luật, không gọi Qwen.
      if (profile.tasks !== 'none' && chunk.kind !== 'table' && chunk.kind !== 'form' && section !== 'target'
        && (profile.tasks === 'all' || section === 'task')) {
        for (const task of extractTasks(chunk.text, { headingPath: chunkHeadings, defaultYear: document.year, inTaskSection: section === 'task' })) {
          stats.taskCandidates += 1;
          pending.push({
            chunk, method: ExtractionMethod.RULE_BASED, payload: taskPayload(task, document.year), fallbackReason: null, repaired: false,
            proseTask: task, position: task.position,
          });
        }
      }
      if (chunk.kind === 'form') {
        // Biểu mẫu cố định: luật tạo bản ghi từ ô đã khớp mẫu, không gọi Qwen (nhanh và đúng hơn).
        stats.formChunks += 1;
        for (const item of formIndicators(chunk, elementById, document.year)) {
          pending.push({ chunk, method: ExtractionMethod.FORM_TEMPLATE, payload: item.payload, fallbackReason: null, repaired: false, formTemplate: item.template });
        }
      } else if (tableRows.has(chunk.id)) {
        stats.tableChunks += 1;
        const rows = tableRows.get(chunk.id)!;
        for (const { record, position, line } of rows.records) {
          pending.push({
            chunk, method: ExtractionMethod.TABLE, payload: tablePayload(record, line), fallbackReason: null, repaired: false,
            table: record, position,
          });
        }
        for (const item of rows.unread) {
          const text = item.line.replace(/\s+/g, ' ');
          tableNotes.push(`trang ${chunk.pageFrom}: ${text.length > 70 ? `${text.slice(0, 69)}…` : text} (${item.reason})`);
        }
      } else if (!chunk.hasDigits) {
        // Căn cứ pháp lý, lời mở đầu: không có chữ số nào thì không có chỉ tiêu, không gửi Qwen.
        stats.skippedNoDigits += 1;
      } else if (!chunkLikelyHasIndicators(chunk.text)) {
        stats.skippedNoSignal += 1;
      } else if (this.chunkFilter === 'target' && !hasTargetFigure(chunkBody(chunk.text), section === 'task')) {
        // Chỉ còn số hiệu văn bản, ngày tháng, năm (căn cứ pháp lý, nơi nhận, điều khoản thi hành), hoặc đoạn giao việc
        // không ghi mức cần đạt: không gửi Qwen.
        stats.skippedNoTarget += 1;
      } else {
        const ruleResults = extractIndicatorsFromText(chunk.text);
        let llmResults: LlmExtractedIndicator[] = [];
        let llmOk = false;
        let repaired = false;
        let fallbackReason: string | null = null;
        if (!llmAvailable) {
          fallbackReason = 'Ollama không hoạt động';
        } else if (llmChunksUsed >= this.maxLlmChunks) {
          stats.llmCapped += 1;
          fallbackReason = `vượt trần ${this.maxLlmChunks} đoạn gửi Qwen`;
        } else {
          llmChunksUsed += 1;
          stats.llmChunks += 1;
          try {
            const result = await this.llmExtractor.extractFromChunk(chunk.text, {
              documentTitle: document.title,
              docNumber: document.docNumber,
              defaultYear: document.year,
            }, signal, () => this.touchExtractJob(job), llmCache);
            stats.llmMs += result.durationMs;
            if (result.cached) stats.llmCached += 1;
            if (result.retried) stats.llmRetried += 1;
            if (!processorChecked && !result.cached) {
              processorChecked = true;
              if (typeof this.ollama.modelOnGpu === 'function' && await this.ollama.modelOnGpu(this.ollama.extractModel, signal)) {
                concurrency = AUTO_GPU_CONCURRENCY;
              }
            }
            if (result.parseError) {
              stats.llmParseErrors += 1;
              fallbackReason = 'Qwen trả JSON sai cấu trúc cả hai lần';
            } else {
              llmOk = true;
              repaired = result.repaired;
              llmResults = result.indicators;
              stats.llmSucceeded += 1;
            }
          } catch (error) {
            throwIfAborted(signal);
            // Model không còn trong Ollama: dừng cả lượt và báo rõ, không âm thầm dùng luật cho mọi đoạn còn lại.
            if (error instanceof OllamaModelMissingError) throw error;
            const timedOut = error instanceof Error && (error.name === 'TimeoutError' || /hết giờ|timeout/i.test(error.message));
            stats.llmFailed += 1;
            if (timedOut) stats.llmTimedOut += 1;
            fallbackReason = timedOut ? 'Qwen hết giờ' : 'Qwen lỗi';
            this.logger.warn(
              `LLM lỗi ở đoạn ${chunk.chunkIndex} của tài liệu ${document.id}: ${error instanceof Error ? error.name : 'unknown'}`,
            );
          }
        }
        if (llmOk) {
          // Kiểm tra đủ mục: mục "(22)…" hay hàng STT có số liệu mà Qwen không trích thì hỏi lại riêng các mục đó.
          const refs = () => llmResults.map(item => ({ sourceQuote: item.sourceQuote, targetValue: item.targetValue, ordinal: item.ordinal }));
          let missing = missingItems(chunk.text, chunk.kind, refs(), section === 'task');
          if (missing.length && stats.recheckCalls < this.recheckMax) {
            stats.recheckCalls += 1;
            try {
              const again = await this.llmExtractor.extractFromChunk(recheckText(chunk.text, chunk.kind, missing), {
                documentTitle: document.title,
                docNumber: document.docNumber,
                defaultYear: document.year,
              }, signal, () => this.touchExtractJob(job), llmCache);
              stats.llmMs += again.durationMs;
              if (!again.parseError) {
                const body = chunkBody(chunk.text);
                const gaps = missing;
                const recovered = again.indicators.filter((item) => {
                  const position = locateQuote(body, item.sourceQuote, item.targetValue);
                  return position !== null && gaps.some(gap => position >= gap.start && position < gap.end);
                });
                for (const item of recovered) item.warnings.push('Mục này Qwen bỏ sót ở lượt đầu, được trích ở lượt hỏi lại (kiểm tra đủ mục).');
                stats.recheckRecovered += recovered.length;
                llmResults = [...llmResults, ...recovered];
                missing = missingItems(chunk.text, chunk.kind, refs(), section === 'task');
              }
            } catch (error) {
              throwIfAborted(signal);
              if (error instanceof OllamaModelMissingError) throw error;
              this.logger.warn(`Hỏi lại mục thiếu lỗi ở đoạn ${chunk.chunkIndex} của tài liệu ${document.id}: ${error instanceof Error ? error.name : 'unknown'}`);
            }
          }
          for (const item of missing) missingNotes.push(describeMissing(item, chunk.pageFrom));
          for (const figure of uncoveredFigures(chunk.text, refs(), { planYear: document.year, skip: missing })) {
            uncoveredNotes.push(`trang ${chunk.pageFrom}: "${figure.snippet}"`);
          }
        }
        if (!llmOk) stats.ruleFallbackChunks += 1;
        for (const item of llmResults) {
          pending.push({ chunk, method: ExtractionMethod.LLM, payload: item, fallbackReason: null, repaired });
        }
        // Đoạn Qwen đọc được thì tin Qwen (D-016): luật bắt cả câu số liệu nền ("năm 2025 là 80 hộ") thành ứng viên rác.
        // Luật chỉ thay Qwen khi Qwen lỗi/tắt/vượt trần; EXTRACTION_RULE_FILL_IN=true bật lại bổ khuyết kiểu D-007.
        for (const item of llmOk && !this.ruleFillIn ? [] : ruleResults) {
          const covered = llmResults.some(llmItem =>
            llmItem.targetValue !== null
            && item.targetValue !== null
            && Math.abs(llmItem.targetValue - item.targetValue) < 1e-9);
          if (!covered) {
            pending.push({ chunk, method: ExtractionMethod.RULE_BASED, payload: item, fallbackReason: llmOk ? null : fallbackReason, repaired: false });
          }
        }
      }
      chunksDone += 1;
      const progressed = await this.prisma.extractionJob.updateMany({
        where: {
          id: job.id,
          status: ExtractionJobStatus.PROCESSING,
          lockedBy: this.workerId,
          cancelRequestedAt: null,
        },
        data: { chunksDone, lockedAt: new Date() },
      });
      if (progressed.count !== 1) throw await this.resolveExtractJobStop(job);
    });
    const pending = perChunk.flatMap(entry => entry.pending);
    const missingNotes = perChunk.flatMap(entry => entry.missing);
    const tableNotes = perChunk.flatMap(entry => entry.table);
    const uncoveredNotes = perChunk.flatMap(entry => entry.uncovered);

    await this.assertExtractJobActive(job, signal);
    const departments = await this.prisma.department.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true },
    });

    // Vùng chồng lấn giữa hai chunk có thể sinh hai phiên bản của cùng một chỉ
    // tiêu (một bản thường bị đứt dòng, tên lệch nhẹ): giữ bản confidence cao.
    // Chỉ coi là trùng khi tên rất giống VÀ cùng giá trị+đơn vị — các họ chỉ tiêu
    // thành phần ("Tỷ lệ nước thải... xử lý" vs "... thu gom") có tên gần nhau
    // nhưng giá trị khác, tuyệt đối không được gộp.
    const deduplicated: typeof pending = [];
    const exactKey = (item: PendingCandidate) => `${item.payload.name.toLowerCase().trim()}|${item.payload.targetValue ?? ''}|${item.payload.unit ?? ''}`;
    // Hàng bảng và câu giao việc là bản ghi "theo dòng": nguồn là bảng (phần tử) hoặc đoạn chứa câu.
    const rowLike = (item: PendingCandidate) => !!item.table || !!item.proseTask;
    const tableOf = (item: PendingCandidate) => (item.table && Array.isArray(item.chunk.elementIds)
      ? `t:${String((item.chunk.elementIds as string[])[0] ?? '')}`
      : `c:${item.chunk.id}`);
    const isDuplicate = (kept: PendingCandidate, item: PendingCandidate) => {
      // Hai hàng của cùng một bảng (hai câu giao việc của cùng một đoạn) luôn là hai bản ghi riêng: nhiệm vụ cùng quy
      // ước 100% có tên gần nhau là chuyện thường. Khác nguồn thì chỉ trùng khi giống hệt tên, giá trị, đơn vị và hạn.
      if (rowLike(kept) && rowLike(item)) {
        return tableOf(kept) !== tableOf(item)
          && exactKey(kept) === exactKey(item)
          && (kept.payload.deadline ?? '') === (item.payload.deadline ?? '');
      }
      if (exactKey(kept) === exactKey(item)) return true;
      return diceSimilarity(kept.payload.name, item.payload.name) >= 0.8
        && kept.payload.targetValue !== null
        && item.payload.targetValue !== null
        && Math.abs(kept.payload.targetValue - item.payload.targetValue) < 1e-9
        && (kept.payload.unit ?? '').toLowerCase().trim() === (item.payload.unit ?? '').toLowerCase().trim();
    };
    // "đạt 2 - 3% GRDP" đôi khi ra thêm một bản ghi lấy cận trên (3): cùng đoạn, tên giống, giá trị là cận của
    // khoảng mà bản ghi kia đã mang thì bỏ. Hàng của bảng là bản ghi riêng nên không xét.
    const isBound = (range: PendingCandidate, bound: PendingCandidate) => !rowLike(range) && !rowLike(bound) && isRangeBoundDuplicate(range, bound);
    // Phần nhiệm vụ, giải pháp hay nhắc lại chỉ tiêu đã giao ở phần chỉ tiêu bằng tên dài hơn hoặc đơn vị viết khác
    // ("Tỷ trọng kinh tế số" 30 "% trong GRDP" ở Điều 3, "… trong GDP" 30 "%/GRDP" ở Điều 4): cùng giá trị, cùng đơn vị
    // gốc, tên này là phần đầu của tên kia thì bỏ bản nhắc lại. Chỉ xét khi một bên ở phần chỉ tiêu, bên kia ở phần khác.
    const sectionOf = (item: PendingCandidate) => sectionKind(Array.isArray(item.chunk.headingPath) ? (item.chunk.headingPath as string[]) : []);
    const plainName = (item: PendingCandidate) => item.payload.name.toLowerCase().replace(/\s+/g, ' ').trim();
    const baseUnit = (item: PendingCandidate) => (item.payload.unit ?? '').toLowerCase().trim().split(/[\s/]/)[0];
    const isRestated = (target: PendingCandidate, restated: PendingCandidate) => !rowLike(target) && !rowLike(restated)
      && sectionOf(target) === 'target' && sectionOf(restated) !== 'target'
      && target.payload.targetValue !== null && target.payload.targetValue === restated.payload.targetValue
      && baseUnit(target) === baseUnit(restated)
      && (plainName(restated).startsWith(plainName(target)) || plainName(target).startsWith(plainName(restated)));
    for (const item of [...pending].sort((a, b) => b.payload.confidence - a.payload.confidence)) {
      if (deduplicated.some(kept => isDuplicate(kept, item) || isBound(kept, item) || isRestated(kept, item))) continue;
      const restated = deduplicated.findIndex(kept => isRestated(item, kept));
      if (restated >= 0) deduplicated.splice(restated, 1);
      const bound = deduplicated.findIndex(kept => isBound(item, kept));
      if (bound >= 0) deduplicated.splice(bound, 1);
      deduplicated.push(item);
    }
    const distinct = deduplicated;
    // Thứ tự đọc của văn bản: mô hình chỉ thấy từng đoạn, nên app tự xếp theo vị trí câu trích dẫn trong văn bản.
    // Bỏ trùng ở trên giữ bản tin cậy cao nhưng không được làm đổi thứ tự hiển thị.
    const pendingIndex = new Map(pending.map((item, index) => [item, index]));
    const placed = distinct
      .map((item) => {
        const body = chunkBody(item.chunk.text);
        const position = item.position ?? locateQuote(body, item.payload.sourceQuote, item.payload.targetValue);
        return { item, body, position, order: documentOrderKey(item.chunk.chunkIndex, position) };
      })
      .sort((a, b) => a.order - b.order || (pendingIndex.get(a.item) ?? 0) - (pendingIndex.get(b.item) ?? 0));
    const unique = placed.map(entry => entry.item);

    // B11–B14: so trùng với chỉ tiêu đang có và gợi ý mã trong danh mục (bge-m3; Ollama tắt thì Dice).
    throwIfAborted(signal);
    const matching = await this.matcher.matchMany(unique.map(item => ({
      name: item.payload.name,
      unit: item.payload.unit,
      targetYear: item.payload.targetYear ?? document.year ?? null,
      frequency: item.payload.frequency ?? null,
    })), { scope: locality.configured ? locality.name : null, year: document.year });
    await this.touchExtractJob(job);

    // B10: luật kiểm tra từng bản ghi, rồi luật Nhất quán trên cả văn bản.
    const sources = unique.map(item => resolveSourceElements(item.chunk, item.payload, elementById, elementsByPage));
    const validationInputs: ValidationRecord[] = unique.map((item, index) => {
      const match = matching.results[index];
      return {
        name: item.payload.name,
        unit: item.payload.unit,
        targetValue: item.payload.targetValue,
        targetYear: item.payload.targetYear ?? document.year ?? null,
        deadline: item.payload.deadline,
        sourceQuote: item.payload.sourceQuote,
        parentName: 'parentName' in item.payload ? item.payload.parentName : null,
        structureRepaired: item.repaired,
        task: isTask(item),
        planYear: document.year,
        section: item.table || item.proseTask || item.method === ExtractionMethod.FORM_TEMPLATE
          ? undefined
          : sectionKind(Array.isArray(item.chunk.headingPath) ? (item.chunk.headingPath as string[]) : []),
        expectedUnits: [match?.suggestion?.unit, match && match.matchClass !== 'MOI' ? match.best?.unit : null].filter(Boolean),
        ocr: sources[index].ocr,
      };
    });
    const consistency = validateConsistency(validationInputs);

    // Nhóm theo đề mục của chính văn bản; lĩnh vực chuẩn (cho dashboard) ưu tiên tên chỉ tiêu, đề mục, rồi so nghĩa, rồi mô hình.
    // Đề mục nhóm nằm trong bảng ("I. CHỈ TIÊU KINH TẾ") nối tiếp chuỗi đề mục của đoạn chứa bảng.
    const headingPaths = unique.map(item => [
      ...(Array.isArray(item.chunk.headingPath) ? (item.chunk.headingPath as string[]) : []),
      ...(item.table?.groups ?? []),
    ]);
    const groups = documentGroups(headingPaths);
    const categories = await this.resolveCategories(
      unique.map((item, index) => ({
        headingPath: headingPaths[index],
        group: groups[index],
        name: item.payload.name,
        catalogGroup: matching.results[index]?.suggestion?.group ?? null,
        modelCategory: item.method === ExtractionMethod.LLM ? (item.payload as LlmExtractedIndicator).category : null,
      })),
      matching.method !== 'dice',
      signal,
    );
    const candidateRows: Prisma.IndicatorCandidateCreateManyInput[] = [];
    const ruleCounts: Record<string, number> = {};
    for (const [index, item] of unique.entries()) {
      const payload = item.payload;
      const match = matching.results[index];
      const source = sources[index];
      const flags: ValidationFlag[] = [
        ...validateRecord(validationInputs[index], item.chunk.text),
        ...(consistency.get(index) ?? []),
      ];
      // Bản ghi Qwen mà tên không khớp câu trích và giá trị không có (hoặc không nằm trong câu trích) là bịa từ câu bên cạnh:
      // không có gì để người duyệt giữ lại, nên bỏ hẳn và chỉ đếm vào ghi chú.
      const rules = new Set(flags.map(flag => flag.rule));
      if (item.method === ExtractionMethod.LLM && flags.some(flag => flag.rule === 'ten_chi_tieu' && /không khớp câu trích/.test(flag.message))
        && (payload.targetValue === null || flags.some(flag => flag.rule === 'bam_nguon' && /^Giá trị /.test(flag.message)))) {
        stats.droppedUnsupported += 1;
        continue;
      }
      for (const rule of rules) ruleCounts[rule] = (ruleCounts[rule] ?? 0) + 1;
      const departmentMatch = payload.responsibleDepartmentName
        ? matchDepartmentByName(payload.responsibleDepartmentName, departments)
        : null;
      const isLlm = item.method === ExtractionMethod.LLM;
      // Bản ghi của bộ đọc bảng mang đủ trường như bản ghi của Qwen (số thứ tự, chỉ tiêu cha, mô tả).
      const llmPayload = isLlm || item.table || item.proseTask ? (payload as LlmExtractedIndicator) : null;
      const rulePayload = !llmPayload ? (payload as RuleExtractedIndicator) : null;
      const warnings = [...payload.warnings];
      if (item.fallbackReason) {
        warnings.unshift(`${item.fallbackReason} ở đoạn này: bản ghi do bộ luật dự phòng tạo, cần đối chiếu kỹ với văn bản.`);
      }
      const headingPath = headingPaths[index];
      // Số thứ tự như văn bản ghi ("(9)", "9.", ô STT): dò trong văn bản gốc trước, mô hình chỉ là phương án phụ.
      const ordinal = item.table || item.proseTask
        ? (item.table ?? item.proseTask)!.ordinal
        : detectOrdinal(placed[index].body, placed[index].position, item.chunk.kind) ?? llmPayload?.ordinal ?? null;

      candidateRows.push({
        documentId: document.id,
        chunkId: item.chunk.id,
        pageNumber: source.page ?? item.chunk.pageFrom,
        kind: CandidateKind.NEW_INDICATOR,
        status: CandidateStatus.PROPOSED,
        extractionMethod: item.method,
        model: isLlm ? this.ollama.extractModel : null,
        promptVersion: isLlm ? EXTRACTION_PROMPT_VERSION
          : item.table ? TABLE_READER_VERSION
            : item.proseTask ? TASK_RULE_VERSION
            : item.method === ExtractionMethod.FORM_TEMPLATE ? `form:${item.formTemplate ?? 'mau'}` : 'rule-v1',
        ...(isTask(item) ? { targetKind: FrameworkKind.TASK } : {}),
        standardCode: item.table?.code ?? null,
        targetText: item.table?.targetText ?? (item.proseTask ? TASK_TARGET_TEXT : null),
        actualValue: item.table?.actualValue ?? null,
        name: payload.name,
        ordinal,
        parentName: llmPayload?.parentName ?? null,
        description: llmPayload?.description ?? null,
        category: categories[index],
        groupName: groups[index],
        documentOrder: placed[index].order,
        unit: item.table || item.proseTask ? payload.unit : unitWithDenominator(payload.unit, payload.sourceQuote),
        targetValue: payload.targetValue,
        targetYear: payload.targetYear ?? document.year ?? null,
        direction: payload.direction ?? TargetDirection.HIGHER_IS_BETTER,
        frequency: resolveFrequency(payload.frequency, payload.sourceQuote, payload.targetYear ?? document.year ?? null),
        // Mô hình bỏ trống hạn nhưng câu trích dẫn ghi rõ ("hoàn thành trước ngày 30/09/2026"): lấy hạn từ câu trích dẫn,
        // không mặc định cuối năm.
        deadline: resolveDeadline(payload.deadline ?? detectDeadline(payload.sourceQuote ?? '', null), payload.targetYear ?? document.year ?? null),
        responsibleDepartmentName: payload.responsibleDepartmentName,
        responsibleDepartmentId: departmentMatch?.id ?? null,
        coordinatingDepartments: rulePayload?.coordinatingDepartments ?? llmPayload?.coordinatingDepartments ?? null,
        legalBasis: llmPayload?.legalBasis ?? document.docNumber ?? null,
        sourceQuote: payload.sourceQuote,
        confidence: adjustedConfidence(payload.confidence, flags),
        fieldConfidence: payload.fieldConfidence as Prisma.InputJsonValue,
        warnings: warnings.length ? (warnings as Prisma.InputJsonValue) : undefined,
        isDuplicateSuspect: Boolean(match && match.matchClass !== 'MOI'),
        matchedTargetId: match?.best?.id ?? null,
        sourceElementIds: source.ids.length ? source.ids : undefined,
        headingPath: headingPath.length ? headingPath : undefined,
        validationFlags: flags.length ? (flags as unknown as Prisma.InputJsonValue) : undefined,
        ocrFlags: source.ocr?.flags.length ? source.ocr.flags : undefined,
        ocrReadings: source.readings.length ? (source.readings as unknown as Prisma.InputJsonValue) : undefined,
        matchClass: match?.matchClass ?? null,
        matchScore: match?.score ?? null,
        similarTargets: match?.similar.length
          ? ({ method: match.method, items: match.similar } as unknown as Prisma.InputJsonValue)
          : undefined,
        suggestedCode: match?.suggestion?.code ?? null,
        suggestedCodeScore: match?.suggestion?.score ?? null,
      });
    }

    await this.assertExtractJobActive(job, signal);
    const llmBroken = stats.llmFailed + stats.llmParseErrors;
    const note = [
      sectionNote,
      !llmAvailable
        ? 'Ollama không hoạt động: toàn bộ trích xuất dùng bộ luật, bản ghi gắn nhãn "Kết quả từ luật".'
        : null,
      llmAvailable && llmBroken
        ? `Qwen lỗi ở ${llmBroken}/${stats.llmChunks} đoạn${stats.llmTimedOut ? ` (${stats.llmTimedOut} đoạn hết giờ)` : ''}: các đoạn này dùng bộ luật dự phòng, bản ghi gắn nhãn "Kết quả từ luật".`
        : null,
      stats.llmCapped
        ? `Tài liệu lớn: ${stats.llmCapped} đoạn vượt trần ${this.maxLlmChunks} đoạn gửi Qwen nên dùng bộ luật. Tăng EXTRACTION_MAX_LLM_CHUNKS nếu cần đọc sâu hơn.`
        : null,
      stats.llmCached
        ? `${stats.llmCached}/${stats.llmChunks} đoạn dùng lại kết quả Qwen đã lưu (nội dung, model và prompt không đổi).`
        : null,
      missingNotes.length
        ? `Còn ${missingNotes.length} mục đánh số có số liệu nhưng chưa có đề xuất, cần đối chiếu với văn bản: ${missingNotes.slice(0, 8).join('; ')}${missingNotes.length > 8 ? '; …' : ''}.`
        : null,
      stats.droppedUnsupported
        ? `Bỏ ${stats.droppedUnsupported} bản ghi Qwen có tên không khớp câu trích và giá trị không có trong câu trích.`
        : null,
      stats.taskCandidates
        ? `Văn bản loại ${profile.label}: bóc thêm ${stats.taskCandidates} nhiệm vụ từ câu giao việc (bằng luật, cần đối chiếu đơn vị và hạn).`
        : null,
      profile.reportsResults
        ? 'Văn bản là báo cáo: con số trong câu văn có thể là kết quả đã thực hiện, không phải mức giao; cột "Thực hiện" của bảng được ghi vào số thực hiện.'
        : null,
      uncoveredNotes.length
        ? `Có ${uncoveredNotes.length} con số ghi như mức cần đạt nhưng chưa thuộc đề xuất nào, cần đối chiếu: ${uncoveredNotes.slice(0, 6).join('; ')}${uncoveredNotes.length > 6 ? '; …' : ''}.`
        : null,
      tableNotes.length
        ? `Bảng có ${tableNotes.length} hàng không lập được đề xuất: ${tableNotes.slice(0, 6).join('; ')}${tableNotes.length > 6 ? '; …' : ''}.`
        : null,
      matching.method === 'dice' && unique.length
        ? `Không nhúng được bằng ${this.ollama.embedModel}: so trùng theo chữ thay vì theo nghĩa.`
        : null,
    ].filter(Boolean).join(' ') || null;
    const jobStats = {
      ...stats,
      skipped: stats.skippedNoDigits + stats.skippedNoSignal,
      candidates: candidateRows.length,
      byMethod: countBy(candidateRows.map(row => row.extractionMethod)),
      ruleFallbackCandidates: unique.filter(item => item.fallbackReason).length,
      validation: ruleCounts,
      missingItems: missingNotes.slice(0, 30),
      llmConcurrency: concurrency,
      tableUnreadRows: tableNotes.slice(0, 30),
      uncoveredNumbers: uncoveredNotes.slice(0, 30),
      flaggedCandidates: candidateRows.filter(row => row.validationFlags !== undefined).length,
      matchMethod: matching.method,
      matchClasses: countBy(candidateRows.map(row => row.matchClass ?? 'MOI')),
      embedded: matching.embedded,
      elapsedMs: Date.now() - startedAt,
    };
    await this.prisma.$transaction(async (tx) => {
      // Khóa chuyển trạng thái trước khi đụng vào ứng viên. Endpoint hủy dùng cùng mức
      // cô lập Serializable: chỉ một phía (hoàn tất hoặc hủy) có thể thắng race này.
      const completed = await tx.extractionJob.updateMany({
        where: {
          id: job.id,
          status: ExtractionJobStatus.PROCESSING,
          lockedBy: this.workerId,
          cancelRequestedAt: null,
        },
        data: {
          status: ExtractionJobStatus.COMPLETED,
          chunksTotal: chunks.length,
          chunksDone: chunks.length,
          // Chỉ ghi tên model khi Qwen thật sự đọc được ít nhất một đoạn (không còn job "COMPLETED" giả).
          model: stats.llmSucceeded ? this.ollama.extractModel : null,
          promptVersion: stats.llmSucceeded ? EXTRACTION_PROMPT_VERSION : 'rule-v1',
          note,
          stats: jobStats as Prisma.InputJsonValue,
          finishedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          lastError: null,
        },
      });
      if (completed.count !== 1) {
        const current = await tx.extractionJob.findUnique({
          where: { id: job.id },
          select: { status: true, cancelRequestedAt: true },
        });
        if (current?.status === ExtractionJobStatus.CANCELLED || current?.cancelRequestedAt) {
          throw new ExtractionJobCancelledError(job.id);
        }
        throw new ExtractionJobOwnershipLostError(job.id);
      }
      // Trích xuất lại là idempotent: xóa đề xuất cũ chưa ai đụng tới, giữ nguyên
      // các ứng viên đã duyệt/từ chối/chỉnh sửa để không mất công sức con người.
      await tx.indicatorCandidate.deleteMany({
        where: {
          documentId: document.id,
          status: CandidateStatus.PROPOSED,
          humanEdited: false,
        },
      });
      if (candidateRows.length) {
        await tx.indicatorCandidate.createMany({ data: candidateRows });
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    this.logger.log(
      `Đã trích xuất ${candidateRows.length} chỉ tiêu ứng viên từ tài liệu ${document.id} (Qwen đọc ${stats.llmSucceeded}/${stats.llmChunks} đoạn, so trùng ${matching.method})`,
    );
  }
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new DOMException('The operation was aborted', 'AbortError');
}

function resolveDeadline(deadline: string | null, targetYear: number | null): Date | null {
  if (deadline && /^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
    try {
      return parsePlanningDueDate(deadline);
    } catch {
      return null;
    }
  }
  if (targetYear) {
    try {
      return parsePlanningDueDate(`${targetYear}-12-31`);
    } catch {
      return null;
    }
  }
  return null;
}

/** "101–102, 110" — dãy trang liền nhau gộp thành khoảng. */
function pageRanges(pages: number[]) {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const start = sorted[index];
    while (index + 1 < sorted.length && sorted[index + 1] === sorted[index] + 1) index += 1;
    parts.push(sorted[index] === start ? `${start}` : `${start}–${sorted[index]}`);
  }
  return parts.join(', ');
}

function countBy(values: (string | null | undefined)[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    const key = value ?? 'khac';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/** Nhóm rộng trong văn bản kế hoạch bao gồm các lĩnh vực hẹp hơn: tên chỉ tiêu nói rõ lĩnh vực hẹp thì theo tên. */
const NARROWER_CATEGORIES: Record<string, string[]> = {
  'Văn hoá - xã hội': ['Y tế', 'Giáo dục'],
};

/** Số đoạn gửi Qwen cùng lúc khi tự nhận thấy model chạy trên GPU (Ollama cần OLLAMA_NUM_PARALLEL từ 2 trở lên). */
const AUTO_GPU_CONCURRENCY = 2;

/**
 * Chạy `task` cho từng phần tử theo thứ tự, tối đa `limit()` việc cùng lúc; giới hạn được hỏi lại mỗi khi một việc
 * xong nên có thể tăng giữa chừng. Việc đầu tiên lỗi thì không nhận việc mới, chờ các việc đang chạy xong rồi báo lỗi đó.
 */
export function runLimited<T>(items: readonly T[], limit: () => number, task: (item: T, index: number) => Promise<void>): Promise<void> {
  return new Promise((resolve, reject) => {
    let next = 0;
    let active = 0;
    let failed = false;
    let failure: unknown;
    const settle = () => {
      if (failed) {
        if (active === 0) reject(failure);
        return;
      }
      if (next >= items.length && active === 0) {
        resolve();
        return;
      }
      while (active < Math.max(1, limit()) && next < items.length) {
        const index = next;
        next += 1;
        active += 1;
        task(items[index], index).then(
          () => { active -= 1; settle(); },
          (error) => { active -= 1; if (!failed) { failed = true; failure = error; } settle(); },
        );
      }
    };
    settle();
  });
}

/** Mục tiêu quy ước của nhiệm vụ: hoàn thành 100% (màn duyệt bắt buộc đủ đơn vị, giá trị, năm, hạn cho mọi loại). */
const TASK_TARGET_TEXT = 'Hoàn thành';

/** Nhiệm vụ bóc từ văn xuôi theo đúng khuôn bản ghi trích xuất; hạn không ghi thì cuối năm kế hoạch. */
export function taskPayload(task: ProseTask, year: number | null): LlmExtractedIndicator {
  return {
    name: task.name,
    ordinal: task.ordinal,
    parentName: null,
    description: null,
    category: null,
    targetValue: 100,
    unit: '%',
    direction: TargetDirection.HIGHER_IS_BETTER,
    frequency: task.frequency,
    deadline: task.deadline ?? (year ? `${year}-12-31` : null),
    targetYear: year,
    responsibleDepartmentName: task.responsibleDepartmentName,
    coordinatingDepartments: task.coordinatingDepartments,
    legalBasis: null,
    sourceQuote: task.sourceQuote,
    confidence: task.confidence,
    fieldConfidence: { name: task.confidence, responsibleDepartment: task.responsibleDepartmentName ? task.confidence : 0.3, deadline: task.deadline ? 0.8 : 0.3 },
    warnings: [...task.warnings],
  };
}

/** Phiên bản bộ đọc bảng, ghi vào promptVersion của đề xuất để biết bản ghi do bản luật nào tạo. */
export const TABLE_READER_VERSION = 'table-v1';

/** Bản ghi của bộ đọc bảng theo đúng khuôn bản ghi trích xuất; câu trích là dòng của hàng trong đoạn. */
export function tablePayload(record: TableRecord, line: string): LlmExtractedIndicator {
  return {
    name: record.name,
    ordinal: record.ordinal,
    parentName: record.parentName,
    description: record.description,
    category: null,
    targetValue: record.targetValue,
    unit: record.unit,
    direction: record.direction,
    frequency: record.frequency,
    deadline: record.deadline,
    targetYear: record.targetYear,
    responsibleDepartmentName: record.responsibleDepartmentName,
    coordinatingDepartments: record.coordinatingDepartments,
    legalBasis: null,
    sourceQuote: line.length > 600 ? `${line.slice(0, 597)}...` : line,
    confidence: record.confidence,
    fieldConfidence: record.fieldConfidence,
    warnings: [...record.warnings],
  };
}

/** Bộ đọc của phần tử OCR (để đo tỷ lệ dòng phải rà soát và áp luật Chất lượng OCR). */
const OCR_SOURCES = new Set(['vietocr', 'paddle', 'merged', 'tesseract', 'opencv']);

export interface ParsedPageRecord {
  pageNumber: number;
  text: string;
  ocrUsed: boolean;
  ocrConfidence: number | null;
  layout: LayoutSpan[] | null;
  kind: string | null;
  elements: StructuredElement[] | null;
}

export interface ParseOutcome {
  pages: ParsedPageRecord[];
  pageCount: number;
  hasTextLayer: boolean;
  ocrUsed: boolean;
  chunks: StructuredChunk[];
  parserVersion: string;
  notes: string[];
  stats: Record<string, unknown>;
}

/**
 * Excel đọc ngay trong API: mỗi sheet là một trang có một bảng có cấu trúc (ô, ô gộp, địa chỉ ô), cùng khuôn với
 * ocr-service. Nhờ vậy bảng Excel được chia đoạn theo hàng, lặp hàng tiêu đề và được bộ đọc bảng đọc bằng code.
 */
export function xlsxOutcome(sheets: XlsxSheetTable[], chunking: ChunkingOptions): ParseOutcome {
  const pages: ParsedPageRecord[] = sheets.map((sheet, index) => {
    const page = index + 1;
    const base = { page, bbox: null, confidence: null, source: 'xlsx', flags: [] as string[] };
    const elements: StructuredElement[] = [
      { ...base, id: `p${page}-e0`, type: 'heading', label: 'sheet', text: `Bảng: ${sheet.sheet}`, level: 1 },
      {
        ...base, id: `p${page}-e1`, type: 'table', label: 'table', text: sheet.text,
        table: {
          numRows: sheet.numRows,
          numCols: sheet.numCols,
          sheet: sheet.sheet,
          cells: sheet.cells.map(cell => ({ ...cell, header: false, rowHeader: false, bbox: null, confidence: null, source: 'xlsx', flags: [] })),
        },
      },
    ];
    return { pageNumber: page, text: `Bảng: ${sheet.sheet}\n${sheet.text}`, ocrUsed: false, ocrConfidence: null, layout: null, kind: 'xlsx', elements };
  });
  return {
    pages,
    pageCount: pages.length,
    hasTextLayer: pages.length > 0,
    ocrUsed: false,
    chunks: chunkStructuredPages(pages.map(page => ({ page: page.pageNumber, elements: page.elements ?? [] })), chunking),
    parserVersion: 'fallback xlsx',
    notes: [],
    stats: { parser: 'fallback', pages: pages.length, ocrPages: 0, skippedOcrPages: 0, pageKinds: pages.length ? { xlsx: pages.length } : {} },
  };
}

function normalizeForSearch(value: string) {
  return value.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

interface ChunkRef {
  pageFrom: number;
  pageTo: number;
  elementIds: Prisma.JsonValue | null;
}

export interface SourceElements {
  ids: string[];
  page: number | null;
  ocr: { flags: string[]; minConfidence: number | null } | null;
  readings: { text: string; vietocr?: string | null; second?: string | null; invalidSyllables?: string[] }[];
}

/**
 * B9: nguồn của bản ghi tới từng phần tử (đoạn, dòng, ô): phần tử chứa câu trích, hoặc nằm trong câu trích, hoặc
 * chứa giá trị. Kèm cờ OCR, độ tin cậy OCR thấp nhất và hai bản đọc của các dòng nguồn mang cờ.
 */
export function resolveSourceElements(
  chunk: ChunkRef,
  payload: { sourceQuote: string; targetValue: number | null },
  elementById: Map<string, StructuredElement>,
  elementsByPage: Map<number, StructuredElement[]>,
): SourceElements {
  const ids = Array.isArray(chunk.elementIds) ? (chunk.elementIds as string[]) : [];
  let elements = ids.map(id => elementById.get(id)).filter((element): element is StructuredElement => Boolean(element));
  if (!elements.length) {
    for (let page = chunk.pageFrom; page <= chunk.pageTo; page += 1) elements.push(...(elementsByPage.get(page) ?? []));
    elements = elements.filter(element => element.type !== 'stamp');
  }
  if (!elements.length) return { ids: [], page: null, ocr: null, readings: [] };
  const quote = normalizeForSearch(payload.sourceQuote ?? '');
  const valueTokens = payload.targetValue === null ? [] : numberSpellings(payload.targetValue);
  const flags = new Set<string>();
  const confidences: number[] = [];
  const readings: SourceElements['readings'] = [];
  let ocrSeen = false;
  const hits: StructuredElement[] = [];

  for (const element of elements) {
    if (element.type === 'table' && element.table) {
      // Ô bảng: lấy các ô có chữ nằm trong câu trích (một hàng của chỉ tiêu).
      const cells = element.table.cells.filter(cell => {
        const text = normalizeForSearch(cell.text ?? '');
        return text.length >= 2 && quote.includes(text);
      });
      if (!cells.length) continue;
      hits.push(element);
      for (const cell of cells) {
        cell.flags?.forEach(flag => flags.add(flag));
        if (cell.confidence !== null && cell.confidence !== undefined && OCR_SOURCES.has(cell.source ?? '')) {
          ocrSeen = true;
          confidences.push(cell.confidence);
        }
        if (cell.readings && cell.flags?.includes('can_ra_soat')) {
          readings.push({ text: cell.text, vietocr: cell.readings.vietocr ?? null, second: cell.readings.second ?? null });
        }
      }
      continue;
    }
    const text = normalizeForSearch(element.text ?? '');
    if (!text) continue;
    const contains = quote.length >= 8 && text.includes(quote);
    const inside = text.length >= 12 && quote.includes(text);
    if (contains || inside) hits.push(element);
  }
  if (!hits.length && valueTokens.length) {
    hits.push(...elements.filter(element => element.type !== 'table'
      && valueTokens.some(token => normalizeForSearch(element.text ?? '').includes(token))).slice(0, 2));
  }
  for (const element of hits) {
    if (element.type === 'table') continue;
    element.flags?.forEach(flag => flags.add(flag));
    if (OCR_SOURCES.has(element.source)) {
      ocrSeen = true;
      if (element.confidence !== null && element.confidence !== undefined) confidences.push(element.confidence);
    }
    for (const reading of element.readings ?? []) readings.push(reading);
  }
  const unique = [...new Set(hits.map(element => element.id))];
  return {
    ids: unique.length ? unique.slice(0, 20) : ids.slice(0, 20),
    page: hits[0]?.page ?? null,
    ocr: ocrSeen || flags.size ? { flags: [...flags], minConfidence: confidences.length ? Math.min(...confidences) : null } : null,
    readings: readings.slice(0, 8),
  };
}

/** Các cách viết một giá trị trong văn bản Việt: 3450 → "3450", "3.450"; 95.5 → "95,5". */
function numberSpellings(value: number): string[] {
  const plain = String(value);
  const [integer, decimal] = plain.split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const spellings = new Set([plain, decimal ? `${integer},${decimal}` : integer, decimal ? `${grouped},${decimal}` : grouped]);
  return [...spellings].filter(spelling => spelling.length >= 2 || /\d/.test(spelling));
}

/** B8 không cần Qwen: ô biểu mẫu đã khớp mẫu tọa độ và gắn sẵn chỉ tiêu thì luật tạo bản ghi luôn. */
export function formIndicators(
  chunk: ChunkRef,
  elementById: Map<string, StructuredElement>,
  defaultYear: number | null,
): { payload: RuleExtractedIndicator; template: string | null }[] {
  const ids = Array.isArray(chunk.elementIds) ? (chunk.elementIds as string[]) : [];
  const results: { payload: RuleExtractedIndicator; template: string | null }[] = [];
  for (const id of ids) {
    const element = elementById.get(id);
    const field = element?.field;
    if (!element || element.type !== 'form_field' || !field?.indicator?.name) continue;
    const value = parseVietnameseNumber(field.value ?? '');
    const flagged = element.flags.includes('can_ra_soat');
    const quote = `${field.label}: ${field.value}`.trim();
    results.push({
      template: field.template ?? null,
      payload: {
        name: field.indicator.name,
        targetValue: value,
        unit: field.indicator.unit ?? null,
        direction: TargetDirection.HIGHER_IS_BETTER,
        frequency: null,
        deadline: null,
        targetYear: defaultYear,
        responsibleDepartmentName: null,
        coordinatingDepartments: null,
        sourceQuote: quote,
        confidence: flagged ? 0.6 : value === null ? 0.5 : 0.9,
        fieldConfidence: { name: 1, targetValue: value === null ? 0.3 : flagged ? 0.6 : 0.9, unit: 1 },
        warnings: value === null ? ['Ô biểu mẫu không chứa giá trị số đọc được.'] : [],
      },
    });
  }
  return results;
}

/**
 * Kỳ báo cáo: mô hình → cụm từ trong câu trích ("hằng quý") → chỉ tiêu giao theo năm kế hoạch thì mặc định Năm. Câu
 * ghi chu kỳ 6 tháng (hệ thống chưa hỗ trợ) thì để trống cho người duyệt chọn.
 */
export function resolveFrequency(model: TargetFrequency | null | undefined, quote: string | null | undefined, targetYear: number | null): TargetFrequency | null {
  if (model) return model;
  const detected = detectFrequency(quote ?? '');
  if (detected.frequency || detected.warning) return detected.frequency;
  return targetYear ? TargetFrequency.YEARLY : null;
}

/**
 * `bound` chỉ là cận trên của khoảng giá trị mà `range` đã mang ("2 - 3%" và bản ghi lẻ "3%"): cùng đoạn, tên rất
 * giống, câu trích của `range` đọc ra khoảng có cận trên bằng giá trị của `bound`.
 */
export function isRangeBoundDuplicate(
  range: { chunk: { id: string }; payload: { name: string; targetValue: number | null; sourceQuote?: string | null } },
  bound: { chunk: { id: string }; payload: { name: string; targetValue: number | null; sourceQuote?: string | null } },
): boolean {
  if (range.chunk.id !== bound.chunk.id || range.payload.targetValue === null || bound.payload.targetValue === null) return false;
  if (diceSimilarity(range.payload.name, bound.payload.name) < 0.8) return false;
  const threshold = detectThreshold(range.payload.sourceQuote, range.payload.targetValue);
  if (threshold?.operator !== 'range' || threshold.upper === null) return false;
  return Math.abs(threshold.upper - bound.payload.targetValue) < 1e-9;
}
