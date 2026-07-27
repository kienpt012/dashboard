import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  CandidateStatus,
  Prisma,
  Role,
  TargetDirection,
  TargetFrequency,
} from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { audit, getActor } from './access';
import { JwtAuthGuard, Roles, RolesGuard } from './common';
import { PrismaService } from './prisma.service';
import { createTargetWithGeneratedCode } from './target-create';

const Trim = () => Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value,
);
const ValidateIfDefined = () => ValidateIf((_object, value) => value !== undefined);
const ValidateIfDefinedAndNotNull = () => ValidateIf(
  (_object, value) => value !== undefined && value !== null,
);

export class UpdateCandidateDto {
  @IsInt() @Min(1)
  expectedVersion!: number;

  @ValidateIfDefined() @Trim() @IsString() @MinLength(3, { message: 'Tên chỉ tiêu phải có ít nhất 3 ký tự' })
  @MaxLength(300, { message: 'Tên chỉ tiêu không được vượt quá 300 ký tự' })
  name?: string;

  @ValidateIfDefinedAndNotNull() @Trim() @IsString() @MaxLength(1000)
  description?: string | null;

  @ValidateIfDefinedAndNotNull() @Trim() @IsString() @MaxLength(100)
  category?: string | null;

  @ValidateIfDefinedAndNotNull() @Trim() @IsString() @MinLength(1, { message: 'Đơn vị đo không được để trống' })
  @MaxLength(50, { message: 'Đơn vị đo không được vượt quá 50 ký tự' })
  unit?: string | null;

  @ValidateIfDefinedAndNotNull() @IsNumber({}, { message: 'Giá trị mục tiêu phải là số' })
  @Min(0, { message: 'Giá trị mục tiêu không được âm' })
  targetValue?: number | null;

  @ValidateIfDefinedAndNotNull() @IsInt() @Min(2000) @Max(2100)
  targetYear?: number | null;

  @ValidateIfDefined() @IsEnum(TargetDirection, { message: 'Chiều hướng không hợp lệ' })
  direction?: TargetDirection;

  @ValidateIfDefinedAndNotNull() @IsEnum(TargetFrequency, { message: 'Tần suất báo cáo không hợp lệ' })
  frequency?: TargetFrequency | null;

  @ValidateIfDefinedAndNotNull()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Hạn hoàn thành phải có định dạng YYYY-MM-DD' })
  @IsDateString({}, { message: 'Hạn hoàn thành không hợp lệ' })
  deadline?: string | null;

  @ValidateIfDefinedAndNotNull() @Trim() @IsString()
  responsibleDepartmentId?: string | null;

  @ValidateIfDefinedAndNotNull() @Trim() @IsString() @MaxLength(300)
  coordinatingDepartments?: string | null;

  @ValidateIfDefinedAndNotNull() @Trim() @IsString() @MaxLength(200)
  legalBasis?: string | null;
}

class ApproveCandidateDto {
  @IsInt() @Min(1)
  expectedVersion!: number;

  @ValidateIfDefined() @IsNumber({}, { message: 'Trọng số không hợp lệ' })
  @Min(0.1, { message: 'Trọng số tối thiểu là 0.1' }) @Max(10, { message: 'Trọng số tối đa là 10' })
  weight?: number;
}

class RejectCandidateDto {
  @IsInt() @Min(1)
  expectedVersion!: number;

  @Trim() @IsString() @MinLength(5, { message: 'Vui lòng ghi rõ lý do từ chối (tối thiểu 5 ký tự)' })
  @MaxLength(500, { message: 'Lý do từ chối không được vượt quá 500 ký tự' })
  reason!: string;
}

const CANDIDATE_SELECT = {
  id: true,
  documentId: true,
  document: { select: { id: true, code: true, title: true, docNumber: true } },
  chunkId: true,
  pageNumber: true,
  kind: true,
  status: true,
  extractionMethod: true,
  model: true,
  promptVersion: true,
  name: true,
  ordinal: true,
  parentName: true,
  description: true,
  category: true,
  unit: true,
  targetValue: true,
  actualValue: true,
  targetYear: true,
  direction: true,
  frequency: true,
  deadline: true,
  responsibleDepartmentName: true,
  responsibleDepartmentId: true,
  responsibleDepartment: { select: { id: true, code: true, name: true } },
  coordinatingDepartments: true,
  legalBasis: true,
  sourceQuote: true,
  confidence: true,
  fieldConfidence: true,
  warnings: true,
  isDuplicateSuspect: true,
  matchedTargetId: true,
  matchedTarget: { select: { id: true, code: true, title: true } },
  humanEdited: true,
  editedFields: true,
  reviewNote: true,
  reviewedBy: { select: { id: true, username: true, fullName: true } },
  reviewedAt: true,
  createdTargetId: true,
  createdTarget: { select: { id: true, code: true, title: true } },
  version: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.IndicatorCandidateSelect;

function isConcurrencyError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError
    && (error.code === 'P2025' || error.code === 'P2034');
}

@Controller('candidates')
@UseGuards(JwtAuthGuard)
export class CandidatesController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list(
    @Req() req: any,
    @Query('status') status?: string,
    @Query('documentId') documentId?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    getActor(req);
    const where: Prisma.IndicatorCandidateWhereInput = {};
    if (status && status in CandidateStatus) where.status = status as CandidateStatus;
    if (documentId?.trim()) where.documentId = documentId.trim();
    if (departmentId?.trim()) where.responsibleDepartmentId = departmentId.trim();
    return this.prisma.indicatorCandidate.findMany({
      where,
      select: CANDIDATE_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 300,
    });
  }

  @Get(':id')
  async detail(@Req() req: any, @Param('id') id: string) {
    getActor(req);
    const candidate = await this.prisma.indicatorCandidate.findUnique({
      where: { id },
      select: {
        ...CANDIDATE_SELECT,
        chunk: { select: { id: true, chunkIndex: true, pageFrom: true, pageTo: true, text: true } },
      },
    });
    if (!candidate) throw new NotFoundException('Không tìm thấy chỉ tiêu ứng viên');
    return candidate;
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateCandidateDto) {
    const actor = getActor(req);
    const { expectedVersion, ...changes } = dto;
    const changedFields = Object.keys(changes).filter(
      key => (changes as Record<string, unknown>)[key] !== undefined,
    );
    if (!changedFields.length) {
      throw new BadRequestException('Không có trường nào được thay đổi');
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const candidate = await tx.indicatorCandidate.findUnique({
          where: { id },
          select: { id: true, status: true, version: true, editedFields: true, responsibleDepartmentId: true },
        });
        if (!candidate) throw new NotFoundException('Không tìm thấy chỉ tiêu ứng viên');
        if (candidate.status !== CandidateStatus.PROPOSED) {
          throw new ConflictException('Chỉ tiêu ứng viên đã được xử lý nên không thể chỉnh sửa');
        }
        if (candidate.version !== expectedVersion) {
          throw new ConflictException('Chỉ tiêu ứng viên vừa được người khác thay đổi. Vui lòng tải lại.');
        }
        if (dto.responsibleDepartmentId) {
          const department = await tx.department.findUnique({ where: { id: dto.responsibleDepartmentId } });
          if (!department || !department.isActive) {
            throw new BadRequestException('Phòng ban phụ trách không tồn tại hoặc đã ngừng hoạt động');
          }
        }
        const previousEdited = Array.isArray(candidate.editedFields)
          ? (candidate.editedFields as string[])
          : [];
        const mergedEdited = Array.from(new Set([...previousEdited, ...changedFields]));
        const changed = await tx.indicatorCandidate.updateMany({
          where: { id, version: expectedVersion, status: CandidateStatus.PROPOSED },
          data: {
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.description !== undefined ? { description: dto.description } : {}),
            ...(dto.category !== undefined ? { category: dto.category } : {}),
            ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
            ...(dto.targetValue !== undefined ? { targetValue: dto.targetValue } : {}),
            ...(dto.targetYear !== undefined ? { targetYear: dto.targetYear } : {}),
            ...(dto.direction !== undefined ? { direction: dto.direction } : {}),
            ...(dto.frequency !== undefined ? { frequency: dto.frequency } : {}),
            ...(dto.deadline !== undefined
              ? { deadline: dto.deadline ? new Date(`${dto.deadline}T16:59:59.999Z`) : null }
              : {}),
            ...(dto.responsibleDepartmentId !== undefined
              ? { responsibleDepartmentId: dto.responsibleDepartmentId }
              : {}),
            ...(dto.coordinatingDepartments !== undefined
              ? { coordinatingDepartments: dto.coordinatingDepartments }
              : {}),
            ...(dto.legalBasis !== undefined ? { legalBasis: dto.legalBasis } : {}),
            humanEdited: true,
            editedFields: mergedEdited,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) {
          throw new ConflictException('Chỉ tiêu ứng viên vừa được người khác thay đổi. Vui lòng tải lại.');
        }
        const fresh = await tx.indicatorCandidate.findUniqueOrThrow({
          where: { id },
          select: CANDIDATE_SELECT,
        });
        await audit(tx, actor, {
          action: 'AI_CANDIDATE_EDITED',
          entityType: 'IndicatorCandidate',
          entityId: id,
          departmentId: fresh.responsibleDepartmentId,
          metadata: { changedFields: mergedEdited, candidateName: fresh.name },
        });
        return fresh;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (isConcurrencyError(error)) {
        throw new ConflictException('Chỉ tiêu ứng viên vừa thay đổi. Vui lòng tải lại và thử lại.');
      }
      throw error;
    }
  }

  // Duyệt: tạo chỉ tiêu chính thức từ ứng viên. Chỉ ADMIN vì tạo Target là quyền ADMIN.
  @Post(':id/approve')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async approve(@Req() req: any, @Param('id') id: string, @Body() dto: ApproveCandidateDto) {
    const actor = getActor(req);
    return approveCandidateById(this.prisma, actor, id, {
      expectedVersion: dto.expectedVersion,
      weight: dto.weight,
    });
  }

  @Post(':id/reject')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  async reject(@Req() req: any, @Param('id') id: string, @Body() dto: RejectCandidateDto) {
    const actor = getActor(req);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const candidate = await tx.indicatorCandidate.findUnique({
          where: { id },
          select: { id: true, status: true, version: true, name: true, responsibleDepartmentId: true },
        });
        if (!candidate) throw new NotFoundException('Không tìm thấy chỉ tiêu ứng viên');
        if (candidate.status !== CandidateStatus.PROPOSED) {
          throw new ConflictException('Chỉ tiêu ứng viên đã được xử lý trước đó');
        }
        const changed = await tx.indicatorCandidate.updateMany({
          where: { id, version: dto.expectedVersion, status: CandidateStatus.PROPOSED },
          data: {
            status: CandidateStatus.REJECTED,
            reviewNote: dto.reason,
            reviewedById: actor.id,
            reviewedAt: new Date(),
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) {
          throw new ConflictException('Chỉ tiêu ứng viên vừa được thay đổi. Vui lòng tải lại.');
        }
        await audit(tx, actor, {
          action: 'AI_CANDIDATE_REJECTED',
          entityType: 'IndicatorCandidate',
          entityId: id,
          departmentId: candidate.responsibleDepartmentId,
          metadata: { candidateName: candidate.name, reason: dto.reason },
        });
        return tx.indicatorCandidate.findUniqueOrThrow({ where: { id }, select: CANDIDATE_SELECT });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (isConcurrencyError(error)) {
        throw new ConflictException('Chỉ tiêu ứng viên vừa thay đổi. Vui lòng tải lại và thử lại.');
      }
      throw error;
    }
  }
}

// Lõi duyệt ứng viên dùng chung cho API duyệt tay và Copilot duyệt hàng loạt:
// validate đủ trường → tạo Target qua luồng cấp mã chung → chuyển trạng thái + audit.
// Không truyền expectedVersion (chế độ hàng loạt) thì dùng version hiện tại của ứng viên.
export async function approveCandidateById(
  prisma: PrismaService,
  actor: import('./access').Actor,
  id: string,
  options: { expectedVersion?: number; weight?: number },
) {
  const candidate = await prisma.indicatorCandidate.findUnique({
    where: { id },
    select: {
      ...CANDIDATE_SELECT,
      document: { select: { id: true, code: true, title: true, docNumber: true } },
    },
  });
  if (!candidate) throw new NotFoundException('Không tìm thấy chỉ tiêu ứng viên');
  if (candidate.status !== CandidateStatus.PROPOSED) {
    throw new ConflictException('Chỉ tiêu ứng viên đã được xử lý trước đó');
  }
  const expectedVersion = options.expectedVersion ?? candidate.version;
  if (candidate.version !== expectedVersion) {
    throw new ConflictException('Chỉ tiêu ứng viên vừa được thay đổi. Vui lòng tải lại.');
  }
  const missing = missingApprovalFields(candidate);
  if (missing.length) {
    throw new BadRequestException(
      `Cần bổ sung trước khi duyệt: ${missing.join(', ')}. Hãy chỉnh sửa ứng viên rồi duyệt lại.`,
    );
  }

  // Tạo Target bằng đúng luồng cấp mã dùng chung với tạo thủ công.
  const created = await createTargetWithGeneratedCode(prisma, actor, {
    title: candidate.name,
    description: candidate.description ?? buildCandidateDescription(candidate),
    unit: candidate.unit!,
    targetValue: candidate.targetValue!,
    weight: options.weight ?? 1,
    year: candidate.targetYear!,
    frequency: candidate.frequency!,
    direction: candidate.direction ?? TargetDirection.HIGHER_IS_BETTER,
    dueDate: candidate.deadline!,
    departmentId: candidate.responsibleDepartmentId!,
    isHighlighted: false,
    legalBasis: candidate.legalBasis ?? candidate.document.docNumber ?? undefined,
    sourceDocumentId: candidate.documentId,
  }, {
    fromCandidate: candidate.id,
    documentCode: candidate.document.code,
    extractionMethod: candidate.extractionMethod,
    aiModel: candidate.model ?? 'rule-based',
    confidence: candidate.confidence,
  });

  try {
    return await prisma.$transaction(async (tx) => {
      const changed = await tx.indicatorCandidate.updateMany({
        where: { id, version: expectedVersion, status: CandidateStatus.PROPOSED },
        data: {
          status: CandidateStatus.APPROVED,
          reviewedById: actor.id,
          reviewedAt: new Date(),
          createdTargetId: created.id,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) {
        // Target đã được tạo nhưng ứng viên bị thay đổi song song: báo lỗi rõ ràng
        // để người duyệt kiểm tra; audit của Target vẫn ghi nguồn từ ứng viên này.
        throw new ConflictException(
          `Chỉ tiêu ${created.code} đã được tạo nhưng trạng thái ứng viên thay đổi song song. Vui lòng tải lại để kiểm tra.`,
        );
      }
      await audit(tx, actor, {
        action: 'AI_CANDIDATE_APPROVED',
        entityType: 'IndicatorCandidate',
        entityId: id,
        departmentId: candidate.responsibleDepartmentId,
        metadata: {
          candidateName: candidate.name,
          targetCode: created.code,
          documentCode: candidate.document.code,
          extractionMethod: candidate.extractionMethod,
          confidence: candidate.confidence,
          humanEdited: candidate.humanEdited,
        },
      });
      const fresh = await tx.indicatorCandidate.findUniqueOrThrow({
        where: { id },
        select: CANDIDATE_SELECT,
      });
      return { candidate: fresh, target: created };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (isConcurrencyError(error)) {
      throw new ConflictException('Chỉ tiêu ứng viên vừa thay đổi. Vui lòng tải lại và thử lại.');
    }
    throw error;
  }
}

// Các trường bắt buộc để một ứng viên trở thành chỉ tiêu chính thức.
export function missingApprovalFields(candidate: {
  name: string;
  unit: string | null;
  targetValue: number | null;
  targetYear: number | null;
  responsibleDepartmentId: string | null;
  frequency: unknown;
  deadline: Date | null;
}): string[] {
  const missing: string[] = [];
  if (!candidate.name || candidate.name.trim().length < 3) missing.push('tên chỉ tiêu');
  if (!candidate.unit) missing.push('đơn vị đo');
  if (candidate.targetValue === null || candidate.targetValue < 0) missing.push('giá trị mục tiêu');
  if (!candidate.targetYear) missing.push('năm kế hoạch');
  if (!candidate.responsibleDepartmentId) missing.push('phòng ban phụ trách');
  if (!candidate.frequency) missing.push('tần suất báo cáo');
  if (!candidate.deadline) missing.push('hạn hoàn thành');
  return missing;
}

function buildCandidateDescription(candidate: {
  sourceQuote: string;
  document: { code: string; title: string };
}): string {
  const quote = candidate.sourceQuote.length > 300
    ? `${candidate.sourceQuote.slice(0, 297)}...`
    : candidate.sourceQuote;
  return `Trích từ ${candidate.document.code} (${candidate.document.title}): "${quote}"`;
}
