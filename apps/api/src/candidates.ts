import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
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
  CandidateOrigin,
  CandidateStatus,
  ExtractionMethod,
  FrameworkKind,
  IssuingLevel,
  Prisma,
  Role,
  TargetDirection,
  TargetFrequency,
} from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  type Actor,
  audit,
  canSuperviseDepartment,
  getActor,
  isGlobalRole,
  isLeadership,
  resolveDepartmentScope,
  WORKING_ROLES,
} from './access';
import { JwtAuthGuard, Roles, RolesGuard } from './common';
import { PrismaService } from './prisma.service';
import { createTargetInTransaction, isTargetCodeAllocationError } from './target-create';
import { departmentManagerIds, leaderIds, notifyUsers, recordWorkEvent, targetLink } from './work';

// Đề xuất chỉ tiêu — "không để việc bị treo".
// Nguồn đề xuất: AI trích xuất từ văn bản (origin AI) hoặc bất kỳ cán bộ nào phát hiện (origin HUMAN).
// PROPOSED (bản nháp, văn thư rà soát) → SUBMITTED (đã trình, bắt đầu đếm hạn tự thông qua) → APPROVED (tạo chỉ tiêu)
//                                                                                          ↘ REJECTED (bắt buộc lý do).
// Kết quả AI KHÔNG BAO GIỜ tự vào hàng chờ tự thông qua: phải có một người xem và bấm trình (D-006 vẫn giữ).

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

  @ValidateIfDefinedAndNotNull() @Trim() @IsString() @MaxLength(300)
  targetText?: string | null;

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

  @ValidateIfDefinedAndNotNull() @IsString()
  frameworkId?: string | null;

  @ValidateIfDefined() @IsEnum(FrameworkKind)
  targetKind?: FrameworkKind;

  @ValidateIfDefinedAndNotNull() @IsEnum(IssuingLevel)
  issuingLevel?: IssuingLevel | null;

  @ValidateIfDefinedAndNotNull() @Trim() @IsString() @MaxLength(40)
  standardCode?: string | null;
}

export class CreateProposalDto {
  @Trim() @IsString() @MinLength(3, { message: 'Tên chỉ tiêu phải có ít nhất 3 ký tự' }) @MaxLength(300) name!: string;
  @IsOptional() @Trim() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(50) unit?: string;
  @IsOptional() @IsNumber() @Min(0) targetValue?: number;
  @IsOptional() @Trim() @IsString() @MaxLength(300) targetText?: string;
  @IsOptional() @IsInt() @Min(2000) @Max(2100) targetYear?: number;
  @IsOptional() @IsEnum(TargetDirection) direction?: TargetDirection;
  @IsOptional() @IsEnum(TargetFrequency) frequency?: TargetFrequency;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Hạn hoàn thành phải có định dạng YYYY-MM-DD' }) deadline?: string;
  @IsOptional() @IsString() responsibleDepartmentId?: string;
  @IsOptional() @IsString() frameworkId?: string;
  @IsOptional() @IsEnum(FrameworkKind) targetKind?: FrameworkKind;
  @IsOptional() @IsEnum(IssuingLevel) issuingLevel?: IssuingLevel;
  @IsOptional() @Trim() @IsString() @MaxLength(40) standardCode?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(200) legalBasis?: string;
  @IsOptional() @IsString() documentId?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(2000) sourceQuote?: string;
  @IsOptional() @IsBoolean() submit?: boolean;
}

class SubmitCandidateDto {
  @IsInt() @Min(1) expectedVersion!: number;
  @IsOptional() @Trim() @IsString() @MaxLength(500) note?: string;
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

export const CANDIDATE_SELECT = {
  id: true,
  documentId: true,
  document: { select: { id: true, code: true, title: true, docNumber: true } },
  chunkId: true,
  pageNumber: true,
  kind: true,
  status: true,
  origin: true,
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
  targetText: true,
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
  frameworkId: true,
  framework: { select: { id: true, code: true, name: true, kind: true } },
  targetKind: true,
  issuingLevel: true,
  standardCode: true,
  sourceQuote: true,
  confidence: true,
  fieldConfidence: true,
  warnings: true,
  isDuplicateSuspect: true,
  matchedTargetId: true,
  matchedTarget: { select: { id: true, code: true, title: true } },
  humanEdited: true,
  editedFields: true,
  proposedById: true,
  submittedById: true,
  submittedAt: true,
  autoApproveAt: true,
  autoApproved: true,
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

function deadlineDate(value: string) {
  return new Date(`${value}T16:59:59.999Z`);
}

/** Phạm vi đề xuất một người được xem: toàn bộ (vai trò toàn địa phương) hoặc của phòng mình và do mình đề xuất. */
function candidateScope(actor: Actor): Prisma.IndicatorCandidateWhereInput {
  if (isGlobalRole(actor.role)) return {};
  return {
    OR: [
      { responsibleDepartmentId: actor.departmentId ?? '__none__' },
      { proposedById: actor.id },
    ],
  };
}

/** Người được sửa đề xuất đang ở bản nháp/đã trình: văn thư, lãnh đạo; trưởng phòng của phòng phụ trách; người đề xuất. */
function canEditCandidate(actor: Actor, candidate: { responsibleDepartmentId: string | null; proposedById: string | null }) {
  if (isGlobalRole(actor.role)) return true;
  if (candidate.proposedById === actor.id) return true;
  return Boolean(candidate.responsibleDepartmentId && canSuperviseDepartment(actor, candidate.responsibleDepartmentId));
}

/** Người được duyệt hoặc từ chối: lãnh đạo UBND, hoặc trưởng phòng của phòng phụ trách (không tự duyệt đề xuất của mình). */
export function canDecideCandidate(actor: Actor, candidate: { responsibleDepartmentId: string | null; proposedById: string | null }) {
  if (candidate.proposedById === actor.id && !isLeadership(actor)) return false;
  if (isLeadership(actor)) return true;
  return Boolean(candidate.responsibleDepartmentId && canSuperviseDepartment(actor, candidate.responsibleDepartmentId));
}

async function approverIds(tx: Prisma.TransactionClient, departmentId: string | null) {
  return [...await leaderIds(tx), ...await departmentManagerIds(tx, departmentId)];
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
    @Query('origin') origin?: string,
    @Query('frameworkId') frameworkId?: string,
  ) {
    const actor = getActor(req);
    const scopedDepartment = resolveDepartmentScope(actor, departmentId);
    const where: Prisma.IndicatorCandidateWhereInput = { AND: [candidateScope(actor)] };
    if (status && status in CandidateStatus) where.status = status as CandidateStatus;
    if (origin && origin in CandidateOrigin) where.origin = origin as CandidateOrigin;
    if (documentId?.trim()) where.documentId = documentId.trim();
    if (frameworkId?.trim()) where.frameworkId = frameworkId.trim();
    if (scopedDepartment && isGlobalRole(actor.role)) where.responsibleDepartmentId = scopedDepartment;
    const rows = await this.prisma.indicatorCandidate.findMany({
      where,
      select: CANDIDATE_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 300,
    });
    const proposerIds = [...new Set(rows.map(row => row.proposedById).filter((id): id is string => Boolean(id)))];
    const proposers = proposerIds.length ? await this.prisma.user.findMany({ where: { id: { in: proposerIds } }, select: { id: true, fullName: true } }) : [];
    const names = new Map(proposers.map(user => [user.id, user.fullName]));
    return rows.map(row => ({
      ...row,
      proposedByName: row.proposedById ? names.get(row.proposedById) ?? null : null,
      canEdit: (row.status === CandidateStatus.PROPOSED || row.status === CandidateStatus.SUBMITTED) && canEditCandidate(actor, row),
      canDecide: (row.status === CandidateStatus.PROPOSED || row.status === CandidateStatus.SUBMITTED) && canDecideCandidate(actor, row),
    }));
  }

  @Get(':id')
  async detail(@Req() req: any, @Param('id') id: string) {
    const actor = getActor(req);
    const candidate = await this.prisma.indicatorCandidate.findFirst({
      where: { id, AND: [candidateScope(actor)] },
      select: {
        ...CANDIDATE_SELECT,
        chunk: { select: { id: true, chunkIndex: true, pageFrom: true, pageTo: true, text: true } },
        workEvents: { orderBy: { createdAt: 'desc' }, take: 30 },
      },
    });
    if (!candidate) throw new NotFoundException('Không tìm thấy đề xuất chỉ tiêu');
    return {
      ...candidate,
      canEdit: (candidate.status === CandidateStatus.PROPOSED || candidate.status === CandidateStatus.SUBMITTED) && canEditCandidate(actor, candidate),
      canDecide: (candidate.status === CandidateStatus.PROPOSED || candidate.status === CandidateStatus.SUBMITTED) && canDecideCandidate(actor, candidate),
    };
  }

  /** Cán bộ bất kỳ đề xuất chỉ tiêu mới phát hiện trong văn bản (kèm văn bản làm minh chứng). */
  @Post()
  @UseGuards(RolesGuard)
  @Roles(...WORKING_ROLES)
  async propose(@Req() req: any, @Body() dto: CreateProposalDto) {
    const actor = getActor(req);
    const departmentId = dto.responsibleDepartmentId || (isGlobalRole(actor.role) ? undefined : actor.departmentId ?? undefined);
    const setting = await this.prisma.systemSetting.findUnique({ where: { id: 'default' } });
    try {
      return await this.prisma.$transaction(async tx => {
        if (departmentId) {
          const department = await tx.department.findUnique({ where: { id: departmentId } });
          if (!department?.isActive) throw new BadRequestException('Phòng ban phụ trách không tồn tại hoặc đã ngừng hoạt động');
        }
        if (dto.documentId && !(await tx.sourceDocument.count({ where: { id: dto.documentId } }))) {
          throw new BadRequestException('Văn bản căn cứ không tồn tại trong kho');
        }
        if (dto.frameworkId && !(await tx.framework.count({ where: { id: dto.frameworkId, isActive: true } }))) {
          throw new BadRequestException('Bộ chỉ tiêu không tồn tại');
        }
        const now = new Date();
        const submitting = dto.submit === true;
        const draft = {
          name: dto.name,
          unit: dto.unit ?? null,
          targetValue: dto.targetValue ?? null,
          targetYear: dto.targetYear ?? null,
          responsibleDepartmentId: departmentId ?? null,
          frequency: dto.frequency ?? null,
          deadline: dto.deadline ? deadlineDate(dto.deadline) : null,
        };
        if (submitting) {
          const missing = missingApprovalFields(draft);
          if (missing.length) throw new BadRequestException(`Cần bổ sung trước khi trình: ${missing.join(', ')}.`);
        }
        const autoDays = setting?.proposalAutoApproveDays ?? 3;
        const candidate = await tx.indicatorCandidate.create({
          data: {
            ...draft,
            origin: CandidateOrigin.HUMAN,
            status: submitting ? CandidateStatus.SUBMITTED : CandidateStatus.PROPOSED,
            extractionMethod: ExtractionMethod.RULE_BASED,
            model: null,
            description: dto.description ?? null,
            targetText: dto.targetText ?? null,
            direction: dto.direction ?? TargetDirection.HIGHER_IS_BETTER,
            frameworkId: dto.frameworkId ?? null,
            targetKind: dto.targetKind ?? FrameworkKind.PLAN,
            issuingLevel: dto.issuingLevel ?? null,
            standardCode: dto.standardCode ?? null,
            legalBasis: dto.legalBasis ?? null,
            documentId: dto.documentId ?? null,
            sourceQuote: dto.sourceQuote ?? '',
            confidence: 1,
            humanEdited: true,
            proposedById: actor.id,
            ...(submitting ? { submittedById: actor.id, submittedAt: now, autoApproveAt: autoDays > 0 ? new Date(now.getTime() + autoDays * 86_400_000) : null } : {}),
          },
          select: CANDIDATE_SELECT,
        });
        await recordWorkEvent(tx, {
          action: submitting ? 'PROPOSAL_SUBMITTED' : 'PROPOSAL_CREATED',
          actor, candidateId: candidate.id, departmentId: departmentId ?? null,
          note: submitting && autoDays > 0 ? `Trình đề xuất; tự thông qua sau ${autoDays} ngày nếu không ai xử lý` : 'Tạo đề xuất',
        });
        await audit(tx, actor, { action: 'PROPOSAL_CREATED', entityType: 'IndicatorCandidate', entityId: candidate.id, departmentId: departmentId ?? null, metadata: { candidateName: candidate.name } });
        if (submitting) {
          await notifyUsers(tx, await approverIds(tx, departmentId ?? null), {
            kind: 'PROPOSAL_SUBMITTED', title: `${actor.fullName} đề xuất chỉ tiêu mới: ${candidate.name}`,
            body: autoDays > 0 ? `Tự thông qua sau ${autoDays} ngày nếu không ai duyệt hoặc từ chối.` : null,
            link: `/admin/proposals?id=${candidate.id}`, entityType: 'IndicatorCandidate', entityId: candidate.id,
            dedupeKey: `proposal-submitted:${candidate.id}`,
          }, actor.id);
        }
        return candidate;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (isConcurrencyError(error)) throw new ConflictException('Dữ liệu vừa thay đổi. Vui lòng thử lại.');
      throw error;
    }
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(...WORKING_ROLES)
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
          select: { id: true, status: true, version: true, editedFields: true, responsibleDepartmentId: true, proposedById: true },
        });
        if (!candidate) throw new NotFoundException('Không tìm thấy đề xuất chỉ tiêu');
        if (candidate.status !== CandidateStatus.PROPOSED && candidate.status !== CandidateStatus.SUBMITTED) {
          throw new ConflictException('Đề xuất đã được xử lý nên không thể chỉnh sửa');
        }
        if (!canEditCandidate(actor, candidate)) throw new ForbiddenException('Bạn không được sửa đề xuất của phòng khác');
        if (candidate.version !== expectedVersion) {
          throw new ConflictException('Đề xuất vừa được người khác thay đổi. Vui lòng tải lại.');
        }
        if (dto.responsibleDepartmentId) {
          const department = await tx.department.findUnique({ where: { id: dto.responsibleDepartmentId } });
          if (!department || !department.isActive) {
            throw new BadRequestException('Phòng ban phụ trách không tồn tại hoặc đã ngừng hoạt động');
          }
          if (!isGlobalRole(actor.role) && dto.responsibleDepartmentId !== actor.departmentId && candidate.proposedById !== actor.id) {
            throw new ForbiddenException('Chỉ văn thư hoặc lãnh đạo được chuyển đề xuất sang phòng khác');
          }
        }
        if (dto.frameworkId && !(await tx.framework.count({ where: { id: dto.frameworkId } }))) {
          throw new BadRequestException('Bộ chỉ tiêu không tồn tại');
        }
        const previousEdited = Array.isArray(candidate.editedFields)
          ? (candidate.editedFields as string[])
          : [];
        const mergedEdited = Array.from(new Set([...previousEdited, ...changedFields]));
        const changed = await tx.indicatorCandidate.updateMany({
          where: { id, version: expectedVersion, status: { in: [CandidateStatus.PROPOSED, CandidateStatus.SUBMITTED] } },
          data: {
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.description !== undefined ? { description: dto.description } : {}),
            ...(dto.category !== undefined ? { category: dto.category } : {}),
            ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
            ...(dto.targetValue !== undefined ? { targetValue: dto.targetValue } : {}),
            ...(dto.targetText !== undefined ? { targetText: dto.targetText } : {}),
            ...(dto.targetYear !== undefined ? { targetYear: dto.targetYear } : {}),
            ...(dto.direction !== undefined ? { direction: dto.direction } : {}),
            ...(dto.frequency !== undefined ? { frequency: dto.frequency } : {}),
            ...(dto.deadline !== undefined ? { deadline: dto.deadline ? deadlineDate(dto.deadline) : null } : {}),
            ...(dto.responsibleDepartmentId !== undefined ? { responsibleDepartmentId: dto.responsibleDepartmentId } : {}),
            ...(dto.coordinatingDepartments !== undefined ? { coordinatingDepartments: dto.coordinatingDepartments } : {}),
            ...(dto.legalBasis !== undefined ? { legalBasis: dto.legalBasis } : {}),
            ...(dto.frameworkId !== undefined ? { frameworkId: dto.frameworkId } : {}),
            ...(dto.targetKind !== undefined ? { targetKind: dto.targetKind } : {}),
            ...(dto.issuingLevel !== undefined ? { issuingLevel: dto.issuingLevel } : {}),
            ...(dto.standardCode !== undefined ? { standardCode: dto.standardCode } : {}),
            humanEdited: true,
            editedFields: mergedEdited,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) {
          throw new ConflictException('Đề xuất vừa được người khác thay đổi. Vui lòng tải lại.');
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
        throw new ConflictException('Đề xuất vừa thay đổi. Vui lòng tải lại và thử lại.');
      }
      throw error;
    }
  }

  /** Trình đề xuất (văn thư sau khi rà soát kết quả AI, hoặc người đề xuất): bắt đầu đếm hạn tự thông qua. */
  @Post(':id/submit')
  @UseGuards(RolesGuard)
  @Roles(...WORKING_ROLES)
  async submit(@Req() req: any, @Param('id') id: string, @Body() dto: SubmitCandidateDto) {
    const actor = getActor(req);
    const setting = await this.prisma.systemSetting.findUnique({ where: { id: 'default' } });
    const autoDays = setting?.proposalAutoApproveDays ?? 3;
    try {
      return await this.prisma.$transaction(async tx => {
        const candidate = await tx.indicatorCandidate.findUnique({ where: { id }, select: { ...CANDIDATE_SELECT } });
        if (!candidate) throw new NotFoundException('Không tìm thấy đề xuất chỉ tiêu');
        if (candidate.status !== CandidateStatus.PROPOSED) throw new ConflictException('Đề xuất đã được trình hoặc đã xử lý');
        if (!canEditCandidate(actor, candidate)) throw new ForbiddenException('Bạn không được trình đề xuất này');
        const missing = missingApprovalFields(candidate);
        if (missing.length) throw new BadRequestException(`Cần bổ sung trước khi trình: ${missing.join(', ')}.`);
        const now = new Date();
        const changed = await tx.indicatorCandidate.updateMany({
          where: { id, version: dto.expectedVersion, status: CandidateStatus.PROPOSED },
          data: {
            status: CandidateStatus.SUBMITTED,
            submittedById: actor.id,
            submittedAt: now,
            autoApproveAt: autoDays > 0 ? new Date(now.getTime() + autoDays * 86_400_000) : null,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) throw new ConflictException('Đề xuất vừa thay đổi. Vui lòng tải lại.');
        await recordWorkEvent(tx, {
          action: 'PROPOSAL_SUBMITTED', actor, candidateId: id, departmentId: candidate.responsibleDepartmentId,
          note: (dto.note ? `${dto.note}. ` : '') + (autoDays > 0 ? `Tự thông qua sau ${autoDays} ngày nếu không ai xử lý` : ''),
        });
        await audit(tx, actor, { action: 'PROPOSAL_SUBMITTED', entityType: 'IndicatorCandidate', entityId: id, departmentId: candidate.responsibleDepartmentId, metadata: { candidateName: candidate.name } });
        await notifyUsers(tx, await approverIds(tx, candidate.responsibleDepartmentId), {
          kind: 'PROPOSAL_SUBMITTED', title: `Đề xuất chỉ tiêu chờ duyệt: ${candidate.name}`,
          body: autoDays > 0 ? `${actor.fullName} trình. Tự thông qua sau ${autoDays} ngày nếu không ai xử lý.` : `${actor.fullName} trình.`,
          link: `/admin/proposals?id=${id}`, entityType: 'IndicatorCandidate', entityId: id, dedupeKey: `proposal-submitted:${id}`,
        }, actor.id);
        return tx.indicatorCandidate.findUniqueOrThrow({ where: { id }, select: CANDIDATE_SELECT });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (isConcurrencyError(error)) throw new ConflictException('Đề xuất vừa thay đổi. Vui lòng tải lại.');
      throw error;
    }
  }

  @Post(':id/approve')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.LEADER, Role.MANAGER)
  async approve(@Req() req: any, @Param('id') id: string, @Body() dto: ApproveCandidateDto) {
    const actor = getActor(req);
    return approveCandidateById(this.prisma, actor, id, {
      expectedVersion: dto.expectedVersion,
      weight: dto.weight,
    });
  }

  @Post(':id/reject')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.LEADER, Role.MANAGER, Role.CLERK)
  async reject(@Req() req: any, @Param('id') id: string, @Body() dto: RejectCandidateDto) {
    const actor = getActor(req);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const candidate = await tx.indicatorCandidate.findUnique({
          where: { id },
          select: { id: true, status: true, version: true, name: true, responsibleDepartmentId: true, proposedById: true, origin: true },
        });
        if (!candidate) throw new NotFoundException('Không tìm thấy đề xuất chỉ tiêu');
        if (candidate.status !== CandidateStatus.PROPOSED && candidate.status !== CandidateStatus.SUBMITTED) {
          throw new ConflictException('Đề xuất đã được xử lý trước đó');
        }
        // Văn thư chỉ được loại kết quả AI chưa trình (rà soát); đề xuất đã trình do người duyệt quyết định.
        const clerkScreening = actor.role === Role.CLERK && candidate.origin === CandidateOrigin.AI && candidate.status === CandidateStatus.PROPOSED;
        if (!clerkScreening && !canDecideCandidate(actor, candidate)) {
          throw new ForbiddenException('Bạn không có quyền từ chối đề xuất này');
        }
        const changed = await tx.indicatorCandidate.updateMany({
          where: { id, version: dto.expectedVersion, status: candidate.status },
          data: {
            status: CandidateStatus.REJECTED,
            reviewNote: dto.reason,
            reviewedById: actor.id,
            reviewedAt: new Date(),
            autoApproveAt: null,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) {
          throw new ConflictException('Đề xuất vừa được thay đổi. Vui lòng tải lại.');
        }
        // responsibleUserId = người từ chối: lãnh đạo UBND thấy mỗi trưởng phòng từ chối bao nhiêu đề xuất và vì sao.
        await recordWorkEvent(tx, {
          action: 'PROPOSAL_REJECTED', actor, candidateId: id, departmentId: candidate.responsibleDepartmentId,
          responsibleUserId: actor.id, note: dto.reason,
        });
        await audit(tx, actor, {
          action: 'AI_CANDIDATE_REJECTED',
          entityType: 'IndicatorCandidate',
          entityId: id,
          departmentId: candidate.responsibleDepartmentId,
          metadata: { candidateName: candidate.name, reason: dto.reason },
        });
        if (candidate.proposedById) {
          await notifyUsers(tx, [candidate.proposedById], {
            kind: 'PROPOSAL_REJECTED', title: `Đề xuất "${candidate.name}" bị từ chối`, body: `${actor.fullName}: ${dto.reason}`,
            link: `/admin/proposals?id=${id}`, entityType: 'IndicatorCandidate', entityId: id, dedupeKey: `proposal-rejected:${id}`,
          }, actor.id);
        }
        return tx.indicatorCandidate.findUniqueOrThrow({ where: { id }, select: CANDIDATE_SELECT });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (isConcurrencyError(error)) {
        throw new ConflictException('Đề xuất vừa thay đổi. Vui lòng tải lại và thử lại.');
      }
      throw error;
    }
  }
}

/**
 * Lõi duyệt đề xuất dùng chung cho API, Copilot duyệt hàng loạt và bộ giám sát tự thông qua.
 * Giữ đề xuất, cấp mã, tạo chỉ tiêu, đổi trạng thái, ghi dòng thời gian và audit trong MỘT transaction Serializable
 * (thử lại khi đụng độ mã) — hai lượt duyệt đồng thời không thể sinh hai chỉ tiêu.
 */
export async function approveCandidateById(
  prisma: PrismaService,
  actor: Actor,
  id: string,
  options: { expectedVersion?: number; weight?: number; auto?: boolean },
) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const candidate = await tx.indicatorCandidate.findUnique({ where: { id }, select: CANDIDATE_SELECT });
        if (!candidate) throw new NotFoundException('Không tìm thấy đề xuất chỉ tiêu');
        if (candidate.status !== CandidateStatus.PROPOSED && candidate.status !== CandidateStatus.SUBMITTED) {
          throw new ConflictException('Đề xuất đã được xử lý trước đó');
        }
        if (!options.auto && !canDecideCandidate(actor, candidate)) {
          throw new ForbiddenException('Chỉ lãnh đạo UBND hoặc trưởng phòng phụ trách được duyệt đề xuất này');
        }
        if (options.auto && candidate.status !== CandidateStatus.SUBMITTED) {
          throw new ConflictException('Chỉ đề xuất đã trình mới được tự thông qua');
        }
        const expectedVersion = options.expectedVersion ?? candidate.version;
        if (candidate.version !== expectedVersion) {
          throw new ConflictException('Đề xuất vừa được thay đổi. Vui lòng tải lại.');
        }
        const missing = missingApprovalFields(candidate);
        if (missing.length) {
          throw new BadRequestException(
            `Cần bổ sung trước khi duyệt: ${missing.join(', ')}. Hãy chỉnh sửa đề xuất rồi duyệt lại.`,
          );
        }
        const claimed = await tx.indicatorCandidate.updateMany({
          where: { id, version: expectedVersion, status: candidate.status },
          data: {
            status: CandidateStatus.APPROVED,
            reviewedById: options.auto ? null : actor.id,
            reviewedAt: new Date(),
            autoApproved: Boolean(options.auto),
            autoApproveAt: null,
            version: { increment: 1 },
          },
        });
        if (claimed.count !== 1) throw new ConflictException('Đề xuất vừa được xử lý ở nơi khác. Vui lòng tải lại.');
        const created = await createTargetInTransaction(tx, actor, {
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
          legalBasis: candidate.legalBasis ?? candidate.document?.docNumber ?? undefined,
          sourceDocumentId: candidate.documentId ?? undefined,
          frameworkId: candidate.frameworkId,
          kind: candidate.targetKind,
          issuingLevel: candidate.issuingLevel ?? undefined,
          standardCode: candidate.standardCode,
          targetText: candidate.targetText,
        }, {
          fromCandidate: candidate.id,
          documentCode: candidate.document?.code ?? null,
          extractionMethod: candidate.extractionMethod,
          aiModel: candidate.model ?? (candidate.origin === CandidateOrigin.HUMAN ? 'human' : 'rule-based'),
          confidence: candidate.confidence,
        });
        await tx.indicatorCandidate.update({ where: { id }, data: { createdTargetId: created.id } });
        // Văn bản căn cứ của đề xuất trở thành văn bản chỉ đạo đầu tiên trong hồ sơ chỉ tiêu.
        if (candidate.document) {
          await tx.targetDirective.create({
            data: {
              targetId: created.id, kind: 'KHAC', title: candidate.document.title, docNumber: candidate.document.docNumber,
              sourceDocumentId: candidate.document.id, createdById: actor.id, createdByName: actor.fullName,
              note: candidate.sourceQuote ? `Trích: "${candidate.sourceQuote.slice(0, 500)}"` : null,
            },
          });
        }
        await recordWorkEvent(tx, {
          action: options.auto ? 'PROPOSAL_AUTO_APPROVED' : 'PROPOSAL_APPROVED',
          actor: options.auto ? null : actor,
          candidateId: id,
          targetId: created.id,
          departmentId: created.departmentId,
          note: options.auto ? 'Quá hạn xử lý nên hệ thống tự thông qua thành chỉ tiêu' : `Tạo chỉ tiêu ${created.code}`,
        });
        await audit(tx, actor, {
          action: options.auto ? 'PROPOSAL_AUTO_APPROVED' : 'AI_CANDIDATE_APPROVED',
          entityType: 'IndicatorCandidate',
          entityId: id,
          departmentId: candidate.responsibleDepartmentId,
          metadata: {
            candidateName: candidate.name,
            targetCode: created.code,
            documentCode: candidate.document?.code ?? null,
            extractionMethod: candidate.extractionMethod,
            confidence: candidate.confidence,
            humanEdited: candidate.humanEdited,
          },
        });
        const recipients = [candidate.proposedById, candidate.submittedById, ...await departmentManagerIds(tx, created.departmentId)];
        await notifyUsers(tx, recipients, {
          kind: options.auto ? 'PROPOSAL_AUTO_APPROVED' : 'PROPOSAL_APPROVED',
          title: options.auto ? `Đề xuất "${candidate.name}" tự thành chỉ tiêu ${created.code} do quá hạn xử lý` : `Đề xuất "${candidate.name}" đã thành chỉ tiêu ${created.code}`,
          body: 'Trưởng phòng hãy giao chuyên viên phụ trách.',
          link: targetLink(created.id), entityType: 'Target', entityId: created.id, dedupeKey: `proposal-approved:${id}`,
        }, options.auto ? null : actor.id);
        const fresh = await tx.indicatorCandidate.findUniqueOrThrow({ where: { id }, select: CANDIDATE_SELECT });
        return { candidate: fresh, target: created };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if ((isTargetCodeAllocationError(error) || isConcurrencyError(error)) && attempt < 3) continue;
      if (isConcurrencyError(error) || isTargetCodeAllocationError(error)) {
        throw new ConflictException('Đề xuất vừa thay đổi hoặc có thao tác đồng thời. Vui lòng tải lại và thử lại.');
      }
      throw error;
    }
  }
  throw new ConflictException('Chưa thể duyệt đề xuất do thao tác đồng thời. Vui lòng thử lại.');
}

// Các trường bắt buộc để một đề xuất trở thành chỉ tiêu chính thức.
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
  document: { code: string; title: string } | null;
}): string | undefined {
  if (!candidate.document || !candidate.sourceQuote) return undefined;
  const quote = candidate.sourceQuote.length > 300
    ? `${candidate.sourceQuote.slice(0, 297)}...`
    : candidate.sourceQuote;
  return `Trích từ ${candidate.document.code} (${candidate.document.title}): "${quote}"`;
}
