import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  DocumentStatus,
  DocumentType,
  ExtractionJobKind,
  ExtractionJobStatus,
  Prisma,
  Role,
} from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { createHash } from 'node:crypto';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { audit, getActor, resolveDepartmentScope } from './access';
import { JwtAuthGuard, Roles, RolesGuard } from './common';
import { detectDocumentKind } from './document-processing';
import { ExtractionWorker } from './extraction-worker';
import { PrismaService } from './prisma.service';

const Trim = () => Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value,
);
const ValidateIfDefined = () => ValidateIf((_object, value) => value !== undefined);

export const DOCUMENT_MAX_BYTES = 25 * 1024 * 1024;
const DOCUMENT_CODE_PREFIX = 'VB';

export function nextDocumentCode(year: number, existingCodes: string[]): string {
  const prefix = `${DOCUMENT_CODE_PREFIX}-${year}-`;
  const highest = existingCodes.reduce((max, code) => {
    if (!code.startsWith(prefix)) return max;
    const sequence = Number(code.slice(prefix.length));
    return Number.isSafeInteger(sequence) && sequence > max ? sequence : max;
  }, 0);
  return `${prefix}${String(highest + 1).padStart(4, '0')}`;
}

class UploadDocumentDto {
  @ValidateIfDefined() @Trim() @IsString() @MinLength(3, { message: 'Tiêu đề tài liệu phải có ít nhất 3 ký tự' })
  @MaxLength(300, { message: 'Tiêu đề tài liệu không được vượt quá 300 ký tự' })
  title?: string;

  @ValidateIfDefined() @IsEnum(DocumentType, { message: 'Loại văn bản không hợp lệ' })
  docType?: DocumentType;

  @ValidateIfDefined() @Trim() @IsString() @MaxLength(100, { message: 'Số văn bản không được vượt quá 100 ký tự' })
  docNumber?: string;

  @ValidateIfDefined() @Trim() @IsString() @MaxLength(200, { message: 'Cơ quan ban hành không được vượt quá 200 ký tự' })
  issuedBy?: string;

  @ValidateIfDefined()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày ban hành phải có định dạng YYYY-MM-DD' })
  @IsDateString({}, { message: 'Ngày ban hành không hợp lệ' })
  issuedDate?: string;

  @ValidateIfDefined() @Type(() => Number) @IsInt({ message: 'Năm kế hoạch không hợp lệ' })
  @Min(2000, { message: 'Năm kế hoạch không hợp lệ' }) @Max(2100, { message: 'Năm kế hoạch không hợp lệ' })
  year?: number;

  @ValidateIfDefined() @Trim() @IsString()
  departmentId?: string;

  @ValidateIfDefined() @Trim() @IsString() @MaxLength(1000, { message: 'Mô tả không được vượt quá 1000 ký tự' })
  description?: string;
}

const DOCUMENT_LIST_SELECT = {
  id: true,
  code: true,
  title: true,
  originalName: true,
  mimeType: true,
  size: true,
  docType: true,
  docNumber: true,
  issuedBy: true,
  issuedDate: true,
  status: true,
  processingError: true,
  pageCount: true,
  hasTextLayer: true,
  ocrUsed: true,
  year: true,
  departmentId: true,
  department: { select: { id: true, code: true, name: true, color: true } },
  uploadedBy: { select: { id: true, username: true, fullName: true } },
  version: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SourceDocumentSelect;

@Controller('documents')
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly extractionWorker: ExtractionWorker,
  ) {}

  @Get()
  async list(
    @Req() req: any,
    @Query('status') status?: string,
    @Query('departmentId') departmentId?: string,
    @Query('search') search?: string,
  ) {
    const actor = getActor(req);
    // Văn bản điều hành dùng chung trong phường: mọi vai trò đăng nhập đều xem được
    // danh mục; bộ lọc phòng ban là tùy chọn, không phải rào chắn phạm vi.
    const where: Prisma.SourceDocumentWhereInput = {};
    if (status && status in DocumentStatus) {
      where.status = status as DocumentStatus;
    }
    if (departmentId?.trim()) where.departmentId = departmentId.trim();
    const trimmedSearch = search?.trim();
    if (trimmedSearch) {
      where.OR = [
        { title: { contains: trimmedSearch, mode: 'insensitive' } },
        { code: { contains: trimmedSearch, mode: 'insensitive' } },
        { docNumber: { contains: trimmedSearch, mode: 'insensitive' } },
        { originalName: { contains: trimmedSearch, mode: 'insensitive' } },
      ];
    }
    const documents = await this.prisma.sourceDocument.findMany({
      where,
      select: {
        ...DOCUMENT_LIST_SELECT,
        _count: { select: { candidates: true, pages: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 200,
    });
    return documents.map(document => ({
      ...document,
      candidateCount: document._count.candidates,
      _count: undefined,
    }));
  }

  @Get(':id')
  async detail(@Req() req: any, @Param('id') id: string) {
    getActor(req);
    const document = await this.prisma.sourceDocument.findUnique({
      where: { id },
      select: {
        ...DOCUMENT_LIST_SELECT,
        description: true,
        sha256: true,
        jobs: {
          select: {
            id: true,
            kind: true,
            status: true,
            attempts: true,
            lastError: true,
            model: true,
            promptVersion: true,
            chunksTotal: true,
            chunksDone: true,
            startedAt: true,
            finishedAt: true,
            cancelRequestedAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        _count: { select: { candidates: true, pages: true, chunks: true } },
      },
    });
    if (!document) throw new NotFoundException('Không tìm thấy tài liệu');
    const candidateStats = await this.prisma.indicatorCandidate.groupBy({
      by: ['status'],
      where: { documentId: id },
      _count: { _all: true },
    });
    return {
      ...document,
      counts: {
        candidates: document._count.candidates,
        pages: document._count.pages,
        chunks: document._count.chunks,
        candidatesByStatus: Object.fromEntries(
          candidateStats.map(row => [row.status, row._count._all]),
        ),
      },
      _count: undefined,
    };
  }

  @Get(':id/text')
  async text(@Req() req: any, @Param('id') id: string) {
    getActor(req);
    const document = await this.prisma.sourceDocument.findUnique({
      where: { id },
      select: { id: true, code: true, title: true, status: true, pageCount: true },
    });
    if (!document) throw new NotFoundException('Không tìm thấy tài liệu');
    const pages = await this.prisma.documentPage.findMany({
      where: { documentId: id },
      select: { pageNumber: true, text: true, ocrUsed: true, ocrConfidence: true },
      orderBy: { pageNumber: 'asc' },
    });
    return { ...document, pages };
  }

  @Get(':id/download')
  async download(
    @Req() req: any,
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    getActor(req);
    const document = await this.prisma.sourceDocument.findUnique({
      where: { id },
      select: { originalName: true, mimeType: true, size: true, data: true },
    });
    if (!document) throw new NotFoundException('Không tìm thấy tài liệu');
    const safeName = document.originalName.replace(/[^\x20-\x7e]/g, '_');
    response.setHeader('Content-Type', document.mimeType);
    response.setHeader('Content-Length', String(document.size));
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(document.originalName)}`,
    );
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(Buffer.from(document.data));
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { files: 1, fileSize: DOCUMENT_MAX_BYTES },
  }))
  async upload(
    @Req() req: any,
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const actor = getActor(req);
    if (!file || !file.buffer?.length) {
      throw new BadRequestException('Vui lòng chọn tệp tài liệu để tải lên');
    }
    if (file.size > DOCUMENT_MAX_BYTES) {
      throw new BadRequestException('Tệp vượt quá dung lượng tối đa 25MB');
    }
    const detected = detectDocumentKind(file.buffer);
    if (!detected) {
      throw new BadRequestException('Chỉ chấp nhận tệp PDF, DOCX, XLSX, JPEG, PNG hoặc WEBP hợp lệ');
    }
    const departmentId = dto.departmentId?.trim() || undefined;
    if (departmentId) {
      // Không dùng resolveDepartmentScope vì tài liệu có thể gắn phòng ban khác khi
      // văn thư tải hộ; chỉ cần phòng ban tồn tại và đang hoạt động.
      const department = await this.prisma.department.findUnique({ where: { id: departmentId } });
      if (!department || !department.isActive) {
        throw new BadRequestException('Phòng ban được gắn không tồn tại hoặc đã ngừng hoạt động');
      }
    }
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const duplicate = await this.prisma.sourceDocument.findUnique({
      where: { sha256 },
      select: { id: true, code: true, title: true },
    });
    if (duplicate) {
      throw new ConflictException(
        `Tài liệu này đã được tải lên trước đó với mã ${duplicate.code} (${duplicate.title})`,
      );
    }
    const originalName = sanitizeDocumentFileName(file.originalname);
    const title = dto.title?.trim() || originalName.replace(/\.[a-z0-9]+$/i, '');
    const issuedDate = dto.issuedDate ? new Date(`${dto.issuedDate}T00:00:00.000+07:00`) : undefined;
    const year = dto.year ?? (issuedDate ? issuedDate.getUTCFullYear() : new Date().getUTCFullYear());

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const existingCodes = await tx.sourceDocument.findMany({
            where: { code: { startsWith: `${DOCUMENT_CODE_PREFIX}-${year}-` } },
            select: { code: true },
          });
          const code = nextDocumentCode(year, existingCodes.map(document => document.code));
          const created = await tx.sourceDocument.create({
            data: {
              code,
              title,
              originalName,
              mimeType: detected.mimeType,
              size: file.size,
              sha256,
              data: Uint8Array.from(file.buffer),
              docType: dto.docType ?? DocumentType.KHAC,
              docNumber: dto.docNumber?.trim() || undefined,
              issuedBy: dto.issuedBy?.trim() || undefined,
              issuedDate,
              description: dto.description?.trim() || undefined,
              status: DocumentStatus.UPLOADED,
              year,
              departmentId,
              uploadedById: actor.id,
            },
            select: DOCUMENT_LIST_SELECT,
          });
          await tx.extractionJob.create({
            data: {
              documentId: created.id,
              kind: ExtractionJobKind.DOCUMENT_PARSE,
              createdById: actor.id,
            },
          });
          await audit(tx, actor, {
            action: 'DOCUMENT_UPLOADED',
            entityType: 'SourceDocument',
            entityId: created.id,
            departmentId: departmentId ?? null,
            metadata: { code: created.code, mimeType: detected.mimeType, size: file.size },
          });
          return created;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (isCodeAllocationError(error) && attempt < 3) continue;
        if (isCodeAllocationError(error)) {
          throw new ConflictException('Hệ thống chưa thể cấp mã tài liệu do có thao tác đồng thời. Vui lòng thử lại.');
        }
        throw error;
      }
    }
    throw new ConflictException('Hệ thống chưa thể cấp mã tài liệu. Vui lòng thử lại.');
  }

  @Post(':id/extract')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  async reExtract(@Req() req: any, @Param('id') id: string) {
    const actor = getActor(req);
    return this.prisma.$transaction(async (tx) => {
      const document = await tx.sourceDocument.findUnique({
        where: { id },
        select: { id: true, code: true, status: true, departmentId: true },
      });
      if (!document) throw new NotFoundException('Không tìm thấy tài liệu');
      if (document.status !== DocumentStatus.PROCESSED) {
        throw new ConflictException('Tài liệu chưa được xử lý xong nên chưa thể trích xuất lại');
      }
      const activeJob = await tx.extractionJob.findFirst({
        where: {
          documentId: id,
          status: { in: [ExtractionJobStatus.PENDING, ExtractionJobStatus.PROCESSING] },
        },
        select: { id: true },
      });
      if (activeJob) {
        throw new ConflictException('Tài liệu đang có tiến trình xử lý, vui lòng chờ hoàn tất');
      }
      const job = await tx.extractionJob.create({
        data: {
          documentId: id,
          kind: ExtractionJobKind.INDICATOR_EXTRACT,
          createdById: actor.id,
        },
        select: { id: true, kind: true, status: true, createdAt: true },
      });
      await audit(tx, actor, {
        action: 'DOCUMENT_EXTRACTION_REQUESTED',
        entityType: 'SourceDocument',
        entityId: id,
        departmentId: document.departmentId,
        metadata: { code: document.code },
      });
      return job;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  @Post(':id/extraction-jobs/:jobId/cancel')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  async cancelExtractionJob(
    @Req() req: any,
    @Param('id') id: string,
    @Param('jobId') jobId: string,
  ) {
    const actor = getActor(req);
    let cancelledJob;
    try {
      cancelledJob = await this.prisma.$transaction(async (tx) => {
        const document = await tx.sourceDocument.findUnique({
          where: { id },
          select: { id: true, code: true, departmentId: true },
        });
        if (!document) throw new NotFoundException('Không tìm thấy tài liệu');

        const job = await tx.extractionJob.findUnique({
          where: { id: jobId },
          select: {
            id: true,
            documentId: true,
            kind: true,
            status: true,
            chunksTotal: true,
            chunksDone: true,
            cancelRequestedAt: true,
            finishedAt: true,
          },
        });
        if (!job || job.documentId !== document.id) {
          throw new NotFoundException('Không tìm thấy tiến trình trích xuất của tài liệu');
        }
        if (job.kind !== ExtractionJobKind.INDICATOR_EXTRACT) {
          throw new ConflictException('Chỉ có thể dừng tiến trình trích xuất chỉ tiêu AI');
        }
        if (job.status === ExtractionJobStatus.CANCELLED) return job;
        if (job.status !== ExtractionJobStatus.PENDING && job.status !== ExtractionJobStatus.PROCESSING) {
          throw new ConflictException('Tiến trình trích xuất đã kết thúc nên không thể dừng');
        }

        const now = new Date();
        const changed = await tx.extractionJob.updateMany({
          where: {
            id: job.id,
            documentId: document.id,
            kind: ExtractionJobKind.INDICATOR_EXTRACT,
            status: { in: [ExtractionJobStatus.PENDING, ExtractionJobStatus.PROCESSING] },
            cancelRequestedAt: null,
          },
          data: {
            status: ExtractionJobStatus.CANCELLED,
            cancelRequestedAt: now,
            finishedAt: now,
            lockedAt: null,
            lockedBy: null,
            lastError: null,
            note: 'Đã dừng theo yêu cầu của người dùng.',
          },
        });
        if (changed.count !== 1) {
          throw new ConflictException('Tiến trình trích xuất vừa được xử lý ở nơi khác. Vui lòng tải lại.');
        }
        await audit(tx, actor, {
          action: 'DOCUMENT_EXTRACTION_CANCELLED',
          entityType: 'ExtractionJob',
          entityId: job.id,
          departmentId: document.departmentId,
          metadata: { code: document.code },
        });
        return {
          ...job,
          status: ExtractionJobStatus.CANCELLED,
          cancelRequestedAt: now,
          finishedAt: now,
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (isPrismaMutationConflict(error)) {
        throw new ConflictException('Tiến trình trích xuất vừa được xử lý ở nơi khác. Vui lòng tải lại.');
      }
      throw error;
    }

    // Chỉ phát tín hiệu sau khi trạng thái CANCELLED đã commit. Worker vẫn kiểm tra DB
    // trước khi ghi kết quả, còn tín hiệu này giúp đóng ngay luồng fetch đang giữ Ollama.
    this.extractionWorker.requestCancellation(jobId);
    return cancelledJob;
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async remove(@Req() req: any, @Param('id') id: string) {
    const actor = getActor(req);
    return this.prisma.$transaction(async (tx) => {
      const document = await tx.sourceDocument.findUnique({
        where: { id },
        select: { id: true, code: true, title: true, departmentId: true },
      });
      if (!document) throw new NotFoundException('Không tìm thấy tài liệu');
      const approvedCount = await tx.indicatorCandidate.count({
        where: { documentId: id, status: 'APPROVED' },
      });
      if (approvedCount > 0) {
        throw new ConflictException(
          'Tài liệu đã có chỉ tiêu được duyệt nên không thể xóa để bảo toàn nguồn gốc dữ liệu',
        );
      }
      await tx.sourceDocument.delete({ where: { id } });
      await audit(tx, actor, {
        action: 'DOCUMENT_DELETED',
        entityType: 'SourceDocument',
        entityId: id,
        departmentId: document.departmentId,
        metadata: { code: document.code },
      });
      return { deleted: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}

function isCodeAllocationError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError
    && (error.code === 'P2002' || error.code === 'P2034');
}

function isPrismaMutationConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError
    && (error.code === 'P2002' || error.code === 'P2025' || error.code === 'P2034');
}

export function sanitizeDocumentFileName(value: string): string {
  const normalized = (value || 'tai-lieu')
    .split(/[\\/]/)
    .pop()!
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>:"|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
  return normalized || 'tai-lieu';
}
