import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CandidateKind,
  CandidateStatus,
  DocumentStatus,
  ExtractionJobKind,
  ExtractionJobStatus,
  ExtractionMethod,
  Prisma,
  TargetDirection,
  TargetFrequency,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  chunkParsedPages,
  parseDocx,
  parseImage,
  parsePdf,
  parseXlsx,
  resolveOcrConfig,
  type ParsedDocument,
} from './document-processing';
import { EXTRACTION_PROMPT_VERSION, LlmIndicatorExtractor, type LlmExtractedIndicator } from './extraction-llm';
import { chunkLikelyHasIndicators, extractIndicatorsFromText, type RuleExtractedIndicator } from './extraction-rules';
import { diceSimilarity, matchDepartmentByName } from './matching';
import { OllamaService } from './ollama';
import { parsePlanningDueDate } from './planning-date';
import { PrismaService } from './prisma.service';

interface ClaimedJob {
  id: string;
  documentId: string;
  kind: ExtractionJobKind;
  attempts: number;
  createdById: string;
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
  private readonly pollIntervalMs: number;
  private readonly maxAttempts: number;
  private readonly maxOcrPages: number;
  private readonly maxLlmChunks: number;
  private readonly llmExtractor: LlmIndicatorExtractor;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ollama: OllamaService,
    config: ConfigService,
  ) {
    this.pollIntervalMs = parseBoundedInteger(config.get<string>('EXTRACTION_POLL_MS'), 4_000, 1_000, 60_000);
    this.maxAttempts = parseBoundedInteger(config.get<string>('EXTRACTION_MAX_ATTEMPTS'), 3, 1, 10);
    this.maxOcrPages = parseBoundedInteger(config.get<string>('EXTRACTION_MAX_OCR_PAGES'), 20, 1, 100);
    // Tài liệu hàng trăm trang: mỗi đoạn LLM tốn 2–5 phút GPU nên phải có trần;
    // đoạn vượt trần vẫn được bộ luật xử lý và job ghi chú rõ để người dùng biết.
    this.maxLlmChunks = parseBoundedInteger(config.get<string>('EXTRACTION_MAX_LLM_CHUNKS'), 40, 1, 500);
    this.llmExtractor = new LlmIndicatorExtractor(ollama);
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
    if (this.activeRun) await this.activeRun;
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
    try {
      if (claimed.kind === ExtractionJobKind.DOCUMENT_PARSE) {
        await this.processParseJob(claimed);
      } else {
        await this.processExtractJob(claimed);
      }
      return 1;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 280) : 'UNKNOWN_ERROR';
      this.logger.error(`Job ${claimed.id} thất bại: ${message}`);
      await this.markFailed(claimed, message);
      return 0;
    }
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
      where: { id: job.id, status: ExtractionJobStatus.PROCESSING, lockedBy: this.workerId },
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
      where: { id: job.id, status: ExtractionJobStatus.PROCESSING, lockedBy: this.workerId },
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

  private async processParseJob(job: ClaimedJob): Promise<void> {
    const document = await this.prisma.sourceDocument.findUnique({
      where: { id: job.documentId },
      select: { id: true, mimeType: true, data: true, status: true },
    });
    if (!document) {
      await this.completeJob(job, {});
      return;
    }
    await this.prisma.sourceDocument.updateMany({
      where: { id: document.id },
      data: { status: DocumentStatus.PROCESSING, processingError: null },
    });

    const buffer = Buffer.from(document.data);
    const ocr = resolveOcrConfig();
    let parsed: ParsedDocument;
    if (document.mimeType === 'application/pdf') {
      parsed = await parsePdf(buffer, { ocr, maxOcrPages: this.maxOcrPages });
    } else if (document.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      parsed = await parseDocx(buffer);
    } else if (document.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      parsed = await parseXlsx(buffer);
    } else if (document.mimeType.startsWith('image/')) {
      parsed = await parseImage(buffer, ocr);
    } else {
      throw new Error(`Định dạng không được hỗ trợ: ${document.mimeType}`);
    }

    const totalText = parsed.pages.reduce((sum, page) => sum + page.text.length, 0);
    if (!totalText) {
      throw new Error('Không đọc được nội dung văn bản nào từ tài liệu (kể cả sau OCR).');
    }

    const chunks = chunkParsedPages(parsed.pages);
    await this.prisma.$transaction(async (tx) => {
      await tx.documentPage.deleteMany({ where: { documentId: document.id } });
      await tx.documentChunk.deleteMany({ where: { documentId: document.id } });
      await tx.documentPage.createMany({
        data: parsed.pages.map(page => ({
          documentId: document.id,
          pageNumber: page.pageNumber,
          text: page.text,
          ocrUsed: page.ocrUsed,
          ocrConfidence: page.ocrConfidence,
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
        })),
      });
      await tx.sourceDocument.updateMany({
        where: { id: document.id },
        data: {
          status: DocumentStatus.PROCESSED,
          pageCount: parsed.pageCount,
          hasTextLayer: parsed.hasTextLayer,
          ocrUsed: parsed.ocrUsed,
          processingError: null,
        },
      });
      // Nối tiếp tự động sang bước trích xuất chỉ tiêu.
      await tx.extractionJob.create({
        data: {
          documentId: document.id,
          kind: ExtractionJobKind.INDICATOR_EXTRACT,
          createdById: job.createdById,
        },
      });
    });
    await this.completeJob(job, { chunksTotal: chunks.length, chunksDone: chunks.length });
    this.logger.log(`Đã phân tích tài liệu ${document.id}: ${parsed.pageCount} trang, ${chunks.length} đoạn`);
  }

  private async processExtractJob(job: ClaimedJob): Promise<void> {
    const document = await this.prisma.sourceDocument.findUnique({
      where: { id: job.documentId },
      select: { id: true, title: true, docNumber: true, year: true, status: true },
    });
    if (!document) {
      await this.completeJob(job, {});
      return;
    }
    const chunks = await this.prisma.documentChunk.findMany({
      where: { documentId: document.id },
      select: { id: true, chunkIndex: true, pageFrom: true, pageTo: true, text: true },
      orderBy: { chunkIndex: 'asc' },
    });
    if (!chunks.length) {
      throw new Error('Tài liệu chưa có nội dung được phân tích.');
    }

    const llmAvailable = await this.ollama.isAvailable();
    await this.prisma.extractionJob.updateMany({
      where: { id: job.id, lockedBy: this.workerId },
      data: {
        chunksTotal: chunks.length,
        chunksDone: 0,
        model: llmAvailable ? this.ollama.extractModel : null,
        promptVersion: llmAvailable ? EXTRACTION_PROMPT_VERSION : 'rule-only',
      },
    });

    interface PendingCandidate {
      chunkId: string;
      pageNumber: number;
      method: ExtractionMethod;
      payload: LlmExtractedIndicator | RuleExtractedIndicator;
    }
    const pending: PendingCandidate[] = [];
    let llmChunksUsed = 0;
    let likelyChunksTotal = 0;

    for (const [index, chunk] of chunks.entries()) {
      const likely = chunkLikelyHasIndicators(chunk.text);
      if (likely) likelyChunksTotal += 1;
      const ruleResults = likely ? extractIndicatorsFromText(chunk.text) : [];
      let llmResults: LlmExtractedIndicator[] = [];
      if (llmAvailable && likely && llmChunksUsed < this.maxLlmChunks) {
        llmChunksUsed += 1;
        try {
          const result = await this.llmExtractor.extractFromChunk(chunk.text, {
            documentTitle: document.title,
            docNumber: document.docNumber,
            defaultYear: document.year,
          });
          llmResults = result.indicators;
        } catch (error) {
          this.logger.warn(
            `LLM lỗi ở đoạn ${chunk.chunkIndex} của tài liệu ${document.id}: ${error instanceof Error ? error.name : 'unknown'}`,
          );
        }
      }
      for (const item of llmResults) {
        pending.push({ chunkId: chunk.id, pageNumber: chunk.pageFrom, method: ExtractionMethod.LLM, payload: item });
      }
      // Luật bổ khuyết: chỉ thêm khi LLM không tìm được mục có cùng giá trị trong đoạn.
      for (const item of ruleResults) {
        const covered = llmResults.some(llmItem =>
          llmItem.targetValue !== null
          && item.targetValue !== null
          && Math.abs(llmItem.targetValue - item.targetValue) < 1e-9);
        if (!covered) {
          pending.push({ chunkId: chunk.id, pageNumber: chunk.pageFrom, method: ExtractionMethod.RULE_BASED, payload: item });
        }
      }
      await this.prisma.extractionJob.updateMany({
        where: { id: job.id, lockedBy: this.workerId },
        data: { chunksDone: index + 1 },
      });
    }

    const departments = await this.prisma.department.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true },
    });
    const existingTargets = await this.prisma.target.findMany({
      where: { isArchived: false, ...(document.year ? { year: document.year } : {}) },
      select: { id: true, title: true, unit: true },
    });

    // Vùng chồng lấn giữa hai chunk có thể sinh hai phiên bản của cùng một chỉ
    // tiêu (một bản thường bị đứt dòng, tên lệch nhẹ): giữ bản confidence cao.
    // Chỉ coi là trùng khi tên rất giống VÀ cùng giá trị+đơn vị — các họ chỉ tiêu
    // thành phần ("Tỷ lệ nước thải... xử lý" vs "... thu gom") có tên gần nhau
    // nhưng giá trị khác, tuyệt đối không được gộp.
    const deduplicated: typeof pending = [];
    for (const item of [...pending].sort((a, b) => b.payload.confidence - a.payload.confidence)) {
      const nearDuplicate = deduplicated.some(kept =>
        diceSimilarity(kept.payload.name, item.payload.name) >= 0.8
        && kept.payload.targetValue !== null
        && item.payload.targetValue !== null
        && Math.abs(kept.payload.targetValue - item.payload.targetValue) < 1e-9
        && (kept.payload.unit ?? '').toLowerCase().trim() === (item.payload.unit ?? '').toLowerCase().trim());
      if (!nearDuplicate) deduplicated.push(item);
    }

    const candidateRows: Prisma.IndicatorCandidateCreateManyInput[] = [];
    const seenKeys = new Set<string>();
    for (const item of deduplicated) {
      const payload = item.payload;
      const key = `${payload.name.toLowerCase().trim()}|${payload.targetValue ?? ''}|${payload.unit ?? ''}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      const departmentMatch = payload.responsibleDepartmentName
        ? matchDepartmentByName(payload.responsibleDepartmentName, departments)
        : null;
      let duplicate: { id: string; score: number } | null = null;
      for (const target of existingTargets) {
        const score = diceForDuplicate(payload.name, target.title);
        if (score >= 0.72 && (!duplicate || score > duplicate.score)) {
          duplicate = { id: target.id, score };
        }
      }
      const isLlm = item.method === ExtractionMethod.LLM;
      const llmPayload = isLlm ? (payload as LlmExtractedIndicator) : null;
      const rulePayload = !isLlm ? (payload as RuleExtractedIndicator) : null;

      candidateRows.push({
        documentId: document.id,
        chunkId: item.chunkId,
        pageNumber: item.pageNumber,
        kind: CandidateKind.NEW_INDICATOR,
        status: CandidateStatus.PROPOSED,
        extractionMethod: item.method,
        model: isLlm ? this.ollama.extractModel : null,
        promptVersion: isLlm ? EXTRACTION_PROMPT_VERSION : 'rule-v1',
        name: payload.name,
        ordinal: llmPayload?.ordinal ?? null,
        parentName: llmPayload?.parentName ?? null,
        description: llmPayload?.description ?? null,
        category: llmPayload?.category ?? null,
        unit: payload.unit,
        targetValue: payload.targetValue,
        targetYear: payload.targetYear ?? document.year ?? null,
        direction: payload.direction ?? TargetDirection.HIGHER_IS_BETTER,
        frequency: payload.frequency ?? null,
        deadline: resolveDeadline(payload.deadline, payload.targetYear ?? document.year ?? null),
        responsibleDepartmentName: payload.responsibleDepartmentName,
        responsibleDepartmentId: departmentMatch?.id ?? null,
        coordinatingDepartments: rulePayload?.coordinatingDepartments ?? llmPayload?.coordinatingDepartments ?? null,
        legalBasis: llmPayload?.legalBasis ?? document.docNumber ?? null,
        sourceQuote: payload.sourceQuote,
        confidence: payload.confidence,
        fieldConfidence: payload.fieldConfidence as Prisma.InputJsonValue,
        warnings: payload.warnings.length ? (payload.warnings as Prisma.InputJsonValue) : undefined,
        isDuplicateSuspect: Boolean(duplicate),
        matchedTargetId: duplicate?.id ?? null,
      });
    }

    await this.prisma.$transaction(async (tx) => {
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
    });

    const capped = llmAvailable && likelyChunksTotal > this.maxLlmChunks;
    await this.completeJob(job, {
      chunksTotal: chunks.length,
      chunksDone: chunks.length,
      model: llmAvailable ? this.ollama.extractModel : null,
      promptVersion: llmAvailable ? EXTRACTION_PROMPT_VERSION : 'rule-v1',
      note: capped
        ? `Tài liệu lớn: LLM đọc ${this.maxLlmChunks}/${likelyChunksTotal} đoạn có tín hiệu chỉ tiêu, phần còn lại dùng bộ luật. Tăng EXTRACTION_MAX_LLM_CHUNKS nếu cần đọc sâu hơn.`
        : llmAvailable ? null : 'Ollama không hoạt động: toàn bộ trích xuất dùng bộ luật.',
    });
    this.logger.log(
      `Đã trích xuất ${candidateRows.length} chỉ tiêu ứng viên từ tài liệu ${document.id} (LLM ${llmAvailable ? 'bật' : 'tắt'})`,
    );
  }
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

function diceForDuplicate(candidateName: string, targetTitle: string): number {
  return diceSimilarity(candidateName, targetTitle);
}
