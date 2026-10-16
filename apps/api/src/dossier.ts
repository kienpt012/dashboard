import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  DirectiveKind,
  EvaluationResult,
  EvidenceKind,
  ExplanationStatus,
  Prisma,
  ProgressReviewStatus,
  Role,
  ValueSource,
} from '@prisma/client';
import { Transform } from 'class-transformer';
import {
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
import { createHash } from 'node:crypto';
import type { Response } from 'express';
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
import { describeTargetFormula } from './datasets';
import { detectAllowedAttachmentMime, sanitizeAttachmentFileName } from './feedback';
import { evaluateTarget } from './metrics';
import { dueReportPeriods, isValidPeriodKey, periodKeyFor, periodLabel } from './periods';
import { PrismaService } from './prisma.service';
import {
  departmentManagerIds,
  leaderIds,
  notifyUsers,
  recordWorkEvent,
  targetLink,
  vietnamDayKey,
  WORK_ACTIONS,
} from './work';

// Hồ sơ chỉ tiêu ba phần (chỉ đạo điều hành – thực hiện – đánh giá) và các thao tác trách nhiệm.
// Mọi thao tác ghi WorkEvent + audit trong cùng transaction và báo cho đúng người.

const Trim = () => Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));
const ValidateIfDefined = () => ValidateIf((_object, value) => value !== undefined && value !== null && value !== '');
const MAX_EVIDENCE_SIZE = 10 * 1024 * 1024;
const BOUNCE_ESCALATION = 3;

export const DIRECTIVE_KIND_LABELS: Record<DirectiveKind, string> = {
  KE_HOACH: 'Kế hoạch',
  CHUONG_TRINH: 'Chương trình',
  THONG_BAO_KET_LUAN: 'Thông báo kết luận',
  CONG_VAN: 'Công văn',
  QUYET_DINH: 'Quyết định',
  NGHI_QUYET: 'Nghị quyết',
  CHI_THI: 'Chỉ thị',
  BAO_CAO: 'Báo cáo',
  KHAC: 'Văn bản khác',
};

export const EVALUATION_LABELS: Record<EvaluationResult, string> = {
  EXCEEDED: 'Vượt',
  ACHIEVED: 'Đạt',
  PARTIAL: 'Đạt một phần',
  NOT_ACHIEVED: 'Không đạt',
};

class DirectiveDto {
  @IsEnum(DirectiveKind, { message: 'Loại văn bản chỉ đạo không hợp lệ' }) kind!: DirectiveKind;
  @Trim() @IsString() @MinLength(3, { message: 'Trích yếu phải có ít nhất 3 ký tự' }) @MaxLength(500) title!: string;
  @ValidateIfDefined() @Trim() @IsString() @MaxLength(80) docNumber?: string;
  @ValidateIfDefined() @IsDateString({}, { message: 'Ngày ban hành không hợp lệ' }) issuedDate?: string;
  @ValidateIfDefined() @Trim() @IsString() @MaxLength(200) issuer?: string;
  @ValidateIfDefined() @Trim() @IsString() @MaxLength(1000) note?: string;
  @ValidateIfDefined() @IsString() sourceDocumentId?: string;
}

class EvidenceLinkDto {
  @IsEnum(EvidenceKind) kind!: EvidenceKind;
  @Trim() @IsString() @MinLength(3) @MaxLength(300) title!: string;
  @ValidateIfDefined() @Trim() @Matches(/^https?:\/\/\S{3,1000}$/, { message: 'Đường dẫn phải bắt đầu bằng http:// hoặc https://' }) url?: string;
  @ValidateIfDefined() @IsString() sourceDocumentId?: string;
  @ValidateIfDefined() @Trim() @IsString() @MaxLength(1000) note?: string;
  @ValidateIfDefined() @IsString() progressUpdateId?: string;
  @ValidateIfDefined() @IsString() directiveId?: string;
  @ValidateIfDefined() @IsString() evaluationId?: string;
}

class AssignDto {
  @IsString() assigneeId!: string;
  @ValidateIfDefined() @Trim() @IsString() @MaxLength(500) note?: string;
}

class TransferDto {
  @IsString() toUserId!: string;
  @Trim() @IsString() @MinLength(5, { message: 'Vui lòng nêu lý do chuyển việc (ít nhất 5 ký tự)' }) @MaxLength(500) reason!: string;
}

class ReturnDto {
  @Trim() @IsString() @MinLength(5, { message: 'Vui lòng nêu lý do trả lại (ít nhất 5 ký tự)' }) @MaxLength(500) reason!: string;
}

class EvaluationDto {
  @Trim() @IsString() periodKey!: string;
  @IsEnum(EvaluationResult, { message: 'Kết quả đánh giá không hợp lệ' }) result!: EvaluationResult;
  @ValidateIfDefined() @IsNumber() @Min(0) @Max(1000) score?: number;
  @ValidateIfDefined() @Trim() @IsString() @MaxLength(2000) note?: string;
  @ValidateIfDefined() @Trim() @IsString() @MaxLength(2000) correctiveAction?: string;
  @IsOptional() @IsInt() @Min(1) expectedVersion?: number;
}

class ExplanationRequestDto {
  @Trim() @IsString() @MinLength(5, { message: 'Nội dung yêu cầu giải trình phải có ít nhất 5 ký tự' }) @MaxLength(1000) message!: string;
  @IsOptional() @IsInt() @Min(1) @Max(30) dueDays?: number;
}

class ExplanationResponseDto {
  @Trim() @IsString() @MinLength(10, { message: 'Nội dung giải trình phải có ít nhất 10 ký tự' }) @MaxLength(4000) response!: string;
  @IsInt() @Min(1) expectedVersion!: number;
}

class SourceCardDto {
  @IsInt() @Min(1) expectedVersion!: number;
  @IsOptional() @Trim() @IsString() @MaxLength(500) dataSourceSystem?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(500) dataSourceAgency?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(4000) collectionGuide?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(1000) dataSourceUrl?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(1000) evidenceRequirement?: string;
  @IsOptional() @IsInt() @Min(1) @Max(31) reportDueDay?: number;
}

type DossierTarget = Prisma.TargetGetPayload<{ include: { department: true } }>;

function blankToNull(value: string | undefined | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

@Controller('targets')
@UseGuards(JwtAuthGuard)
export class DossierController {
  constructor(private readonly prisma: PrismaService) {}

  private async loadTarget(actor: Actor, id: string): Promise<DossierTarget> {
    const departmentId = resolveDepartmentScope(actor);
    const target = await this.prisma.target.findFirst({
      where: {
        id,
        ...(departmentId
          ? { OR: [{ departmentId }, { coordinators: { some: { departmentId } } }] }
          : {}),
      },
      include: { department: true },
    });
    if (!target) throw new NotFoundException('Không tìm thấy chỉ tiêu');
    return target;
  }

  /** Người được cập nhật hồ sơ: lãnh đạo, văn thư, trưởng phòng chủ trì, chuyên viên phụ trách hoặc cán bộ phòng chủ trì. */
  private canContribute(actor: Actor, target: Pick<DossierTarget, 'departmentId' | 'assigneeId'>) {
    if (isGlobalRole(actor.role)) return true;
    if (actor.role === Role.VIEWER) return false;
    return actor.departmentId === target.departmentId;
  }

  private permissions(actor: Actor, target: DossierTarget, maxTransfers: number) {
    const supervise = canSuperviseDepartment(actor, target.departmentId);
    const isAssignee = target.assigneeId === actor.id;
    return {
      canReport: this.canContribute(actor, target) && !target.isArchived && target.valueSource === ValueSource.MANUAL,
      canContribute: this.canContribute(actor, target) && !target.isArchived,
      canAssign: supervise && !target.isArchived,
      canTransfer: isAssignee && target.transferCount < maxTransfers && !target.isArchived,
      canReturn: isAssignee && !target.isArchived,
      canEvaluate: supervise,
      canRequestExplanation: isLeadership(actor),
      canRespondExplanation: supervise || isAssignee,
      canEditSourceCard: supervise || isAssignee || isGlobalRole(actor.role),
    };
  }

  @Get(':id/dossier')
  async dossier(@Req() req: any, @Param('id') id: string) {
    const actor = getActor(req);
    const base = await this.loadTarget(actor, id);
    const setting = await this.prisma.systemSetting.findUnique({ where: { id: 'default' } });
    const target = await this.prisma.target.findUniqueOrThrow({
      where: { id: base.id },
      include: {
        department: { select: { id: true, code: true, name: true, color: true } },
        framework: { select: { id: true, code: true, name: true, kind: true, issuingLevel: true, legalBasis: true, maxScore: true } },
        parent: { select: { id: true, code: true, title: true } },
        children: {
          where: { isArchived: false },
          orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
          select: {
            id: true, code: true, title: true, unit: true, targetValue: true, targetText: true, currentValue: true, maxScore: true, kind: true,
            direction: true, dueDate: true, lastReportedAt: true, ordinal: true, standardCode: true,
            department: { select: { id: true, name: true, color: true } }, assignee: { select: { id: true, fullName: true } },
          },
        },
        coordinators: { include: { department: { select: { id: true, name: true, color: true } } } },
        assignee: { select: { id: true, fullName: true, position: true, username: true } },
        sourceDocument: { select: { id: true, code: true, title: true, docNumber: true } },
        directives: {
          orderBy: [{ issuedDate: 'desc' }, { createdAt: 'desc' }],
          include: {
            sourceDocument: { select: { id: true, code: true, title: true } },
            evidences: { select: { id: true, title: true, kind: true, mimeType: true, size: true, url: true, createdAt: true } },
          },
        },
        updates: {
          orderBy: { createdAt: 'desc' },
          take: 60,
          include: {
            user: { select: { id: true, fullName: true } },
            evidences: {
              select: { id: true, title: true, kind: true, mimeType: true, size: true, url: true, note: true, capturedAt: true, createdAt: true, createdByName: true, sourceDocumentId: true },
            },
          },
        },
        evaluations: {
          orderBy: { evaluatedAt: 'desc' },
          include: { evidences: { select: { id: true, title: true, kind: true, mimeType: true, url: true } } },
        },
        evidences: {
          where: { progressUpdateId: null, directiveId: null, evaluationId: null },
          orderBy: { createdAt: 'desc' },
          select: { id: true, title: true, kind: true, mimeType: true, size: true, url: true, note: true, capturedAt: true, createdAt: true, createdByName: true },
        },
        workEvents: { orderBy: { createdAt: 'desc' }, take: 80 },
        explanationRequests: { orderBy: { createdAt: 'desc' }, include: { requestedBy: { select: { fullName: true, position: true } } } },
      },
    });
    const reviewerIds = [...new Set(target.updates.map(update => update.reviewedBy).filter((value): value is string => Boolean(value)))];
    const reviewers = reviewerIds.length ? await this.prisma.user.findMany({ where: { id: { in: reviewerIds } }, select: { id: true, fullName: true } }) : [];
    const reviewerNames = new Map(reviewers.map(user => [user.id, user.fullName]));
    const threshold = setting?.riskThreshold ?? 70;
    const metric = evaluateTarget({
      targetValue: target.targetValue, currentValue: target.currentValue, direction: target.direction, dueDate: target.dueDate,
      riskThreshold: threshold, hasReport: Boolean(target.lastReportedAt), kind: target.kind,
    });
    const reportedPeriods = new Set(target.updates.filter(update => update.reviewStatus !== ProgressReviewStatus.REJECTED && update.periodKey).map(update => update.periodKey!));
    const periods = target.valueSource === ValueSource.MANUAL
      ? dueReportPeriods(target.frequency, target.year, target.reportDueDay, new Date(), target.createdAt).map(period => ({
          key: period.key, label: periodLabel(period.key), deadline: period.deadline, overdue: period.overdue, reported: reportedPeriods.has(period.key),
        }))
      : [];
    const formula = target.valueSource === ValueSource.COMPUTED && target.formula
      ? await describeTargetFormula(this.prisma, target.formula, target.year).catch(() => null)
      : null;
    const managers = await this.prisma.user.findMany({
      where: { departmentId: target.departmentId, role: Role.MANAGER, isActive: true },
      select: { id: true, fullName: true, position: true, lastLoginAt: true },
    });
    const staff = await this.prisma.user.findMany({
      where: { departmentId: target.departmentId, role: { in: [Role.MANAGER, Role.STAFF] }, isActive: true },
      select: { id: true, fullName: true, position: true, role: true },
      orderBy: { fullName: 'asc' },
    });
    const { updates, ...rest } = target;
    return {
      ...rest,
      ...metric,
      currentPeriodKey: periodKeyFor(target.frequency),
      periods,
      completeness: {
        directive: target.directives.length > 0,
        execution: Boolean(target.lastReportedAt),
        evaluation: target.evaluations.length > 0,
      },
      reports: updates.map(update => ({
        ...update,
        periodLabel: update.periodKey ? periodLabel(update.periodKey) : null,
        reviewerName: update.reviewedBy ? reviewerNames.get(update.reviewedBy) ?? null : null,
      })),
      workEvents: target.workEvents.map(event => ({ ...event, label: WORK_ACTIONS[event.action as keyof typeof WORK_ACTIONS] ?? event.action })),
      directives: target.directives.map(directive => ({ ...directive, kindLabel: DIRECTIVE_KIND_LABELS[directive.kind] })),
      evaluations: target.evaluations.map(evaluation => ({ ...evaluation, resultLabel: EVALUATION_LABELS[evaluation.result], periodLabel: periodLabel(evaluation.periodKey) })),
      formula,
      managers,
      staff,
      maxTransfers: setting?.maxTransfers ?? 1,
      permissions: this.permissions(actor, base, setting?.maxTransfers ?? 1),
    };
  }

  // ───── Phần 1: chỉ đạo điều hành ─────

  @Post(':id/directives')
  @UseGuards(RolesGuard)
  @Roles(...WORKING_ROLES)
  async addDirective(@Req() req: any, @Param('id') id: string, @Body() dto: DirectiveDto) {
    const actor = getActor(req);
    const target = await this.loadTarget(actor, id);
    if (!this.canContribute(actor, target)) throw new ForbiddenException('Bạn không được cập nhật hồ sơ chỉ tiêu này');
    return this.prisma.$transaction(async tx => {
      if (dto.sourceDocumentId) {
        const document = await tx.sourceDocument.findUnique({ where: { id: dto.sourceDocumentId }, select: { id: true } });
        if (!document) throw new BadRequestException('Văn bản trong kho không tồn tại');
      }
      const directive = await tx.targetDirective.create({
        data: {
          targetId: target.id,
          kind: dto.kind,
          title: dto.title,
          docNumber: blankToNull(dto.docNumber),
          issuedDate: dto.issuedDate ? new Date(dto.issuedDate) : null,
          issuer: blankToNull(dto.issuer),
          note: blankToNull(dto.note),
          sourceDocumentId: dto.sourceDocumentId || null,
          createdById: actor.id,
          createdByName: actor.fullName,
        },
      });
      await recordWorkEvent(tx, {
        action: 'DIRECTIVE_ADDED', actor, targetId: target.id, departmentId: target.departmentId,
        note: `${DIRECTIVE_KIND_LABELS[dto.kind]}${dto.docNumber ? ` số ${dto.docNumber}` : ''}: ${dto.title}`,
      });
      await audit(tx, actor, { action: 'TARGET_DIRECTIVE_ADDED', entityType: 'Target', entityId: target.id, departmentId: target.departmentId, metadata: { code: target.code } });
      return directive;
    });
  }

  @Delete(':id/directives/:directiveId')
  @UseGuards(RolesGuard)
  @Roles(...WORKING_ROLES)
  async removeDirective(@Req() req: any, @Param('id') id: string, @Param('directiveId') directiveId: string) {
    const actor = getActor(req);
    const target = await this.loadTarget(actor, id);
    const directive = await this.prisma.targetDirective.findFirst({ where: { id: directiveId, targetId: target.id } });
    if (!directive) throw new NotFoundException('Không tìm thấy văn bản chỉ đạo');
    if (directive.createdById !== actor.id && !canSuperviseDepartment(actor, target.departmentId)) {
      throw new ForbiddenException('Chỉ người bổ sung hoặc lãnh đạo, trưởng phòng được gỡ văn bản chỉ đạo');
    }
    await this.prisma.$transaction(async tx => {
      await tx.targetDirective.delete({ where: { id: directive.id } });
      await recordWorkEvent(tx, { action: 'DIRECTIVE_REMOVED', actor, targetId: target.id, departmentId: target.departmentId, note: directive.title });
      await audit(tx, actor, { action: 'TARGET_DIRECTIVE_REMOVED', entityType: 'Target', entityId: target.id, departmentId: target.departmentId, metadata: { code: target.code } });
    });
    return { ok: true };
  }

  // ───── Minh chứng ─────

  private async assertEvidenceLinks(tx: Prisma.TransactionClient, targetId: string, links: { progressUpdateId?: string; directiveId?: string; evaluationId?: string; sourceDocumentId?: string }) {
    if (links.progressUpdateId && !(await tx.progressUpdate.count({ where: { id: links.progressUpdateId, targetId } }))) {
      throw new BadRequestException('Báo cáo được gắn minh chứng không thuộc chỉ tiêu này');
    }
    if (links.directiveId && !(await tx.targetDirective.count({ where: { id: links.directiveId, targetId } }))) {
      throw new BadRequestException('Văn bản chỉ đạo được gắn minh chứng không thuộc chỉ tiêu này');
    }
    if (links.evaluationId && !(await tx.targetEvaluation.count({ where: { id: links.evaluationId, targetId } }))) {
      throw new BadRequestException('Đánh giá được gắn minh chứng không thuộc chỉ tiêu này');
    }
    if (links.sourceDocumentId && !(await tx.sourceDocument.count({ where: { id: links.sourceDocumentId } }))) {
      throw new BadRequestException('Văn bản trong kho không tồn tại');
    }
  }

  @Post(':id/evidence/upload')
  @UseGuards(RolesGuard)
  @Roles(...WORKING_ROLES)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_EVIDENCE_SIZE, files: 1 } }))
  async uploadEvidence(@Req() req: any, @Param('id') id: string, @UploadedFile() file: Express.Multer.File, @Body() body: Record<string, string>) {
    const actor = getActor(req);
    const target = await this.loadTarget(actor, id);
    if (!this.canContribute(actor, target)) throw new ForbiddenException('Bạn không được bổ sung minh chứng cho chỉ tiêu này');
    if (!file?.buffer?.length) throw new BadRequestException('Vui lòng chọn tệp minh chứng');
    if (file.size > MAX_EVIDENCE_SIZE) throw new BadRequestException('Tệp minh chứng vượt quá 10MB');
    const mimeType = detectAllowedAttachmentMime(file.buffer);
    if (!mimeType) throw new BadRequestException('Chỉ nhận ảnh JPEG, PNG, WEBP hoặc tệp PDF. Văn bản Word/Excel hãy tải vào Kho văn bản rồi liên kết.');
    const title = (body.title || file.originalname || 'Minh chứng').trim().slice(0, 300);
    const capturedAt = body.capturedAt && !Number.isNaN(Date.parse(body.capturedAt)) ? new Date(body.capturedAt) : null;
    const links = { progressUpdateId: body.progressUpdateId || undefined, directiveId: body.directiveId || undefined, evaluationId: body.evaluationId || undefined };
    return this.prisma.$transaction(async tx => {
      await this.assertEvidenceLinks(tx, target.id, links);
      const evidence = await tx.evidence.create({
        data: {
          targetId: target.id,
          ...links,
          kind: EvidenceKind.FILE,
          title,
          originalName: sanitizeAttachmentFileName(file.originalname),
          mimeType,
          size: file.size,
          sha256: createHash('sha256').update(file.buffer).digest('hex'),
          data: Uint8Array.from(file.buffer),
          note: blankToNull(body.note)?.slice(0, 1000) ?? null,
          capturedAt,
          createdById: actor.id,
          createdByName: actor.fullName,
        },
        select: { id: true, title: true, kind: true, mimeType: true, size: true, createdAt: true },
      });
      await recordWorkEvent(tx, { action: 'EVIDENCE_ADDED', actor, targetId: target.id, departmentId: target.departmentId, note: title });
      await audit(tx, actor, { action: 'TARGET_EVIDENCE_ADDED', entityType: 'Target', entityId: target.id, departmentId: target.departmentId, metadata: { code: target.code, mimeType, size: file.size } });
      return evidence;
    });
  }

  @Post(':id/evidence')
  @UseGuards(RolesGuard)
  @Roles(...WORKING_ROLES)
  async addEvidenceLink(@Req() req: any, @Param('id') id: string, @Body() dto: EvidenceLinkDto) {
    const actor = getActor(req);
    const target = await this.loadTarget(actor, id);
    if (!this.canContribute(actor, target)) throw new ForbiddenException('Bạn không được bổ sung minh chứng cho chỉ tiêu này');
    if (dto.kind === EvidenceKind.FILE) throw new BadRequestException('Tệp minh chứng phải tải lên qua chức năng tải tệp');
    if (dto.kind === EvidenceKind.LINK && !dto.url) throw new BadRequestException('Vui lòng nhập đường dẫn minh chứng');
    if (dto.kind === EvidenceKind.DOCUMENT && !dto.sourceDocumentId) throw new BadRequestException('Vui lòng chọn văn bản trong kho');
    return this.prisma.$transaction(async tx => {
      await this.assertEvidenceLinks(tx, target.id, dto);
      const evidence = await tx.evidence.create({
        data: {
          targetId: target.id, kind: dto.kind, title: dto.title, url: dto.kind === EvidenceKind.LINK ? dto.url : null,
          sourceDocumentId: dto.kind === EvidenceKind.DOCUMENT ? dto.sourceDocumentId : null,
          progressUpdateId: dto.progressUpdateId || null, directiveId: dto.directiveId || null, evaluationId: dto.evaluationId || null,
          note: blankToNull(dto.note), createdById: actor.id, createdByName: actor.fullName,
        },
        select: { id: true, title: true, kind: true, url: true, createdAt: true },
      });
      await recordWorkEvent(tx, { action: 'EVIDENCE_ADDED', actor, targetId: target.id, departmentId: target.departmentId, note: dto.title });
      return evidence;
    });
  }

  @Get(':id/evidence/:evidenceId/download')
  async downloadEvidence(@Req() req: any, @Param('id') id: string, @Param('evidenceId') evidenceId: string, @Res() res: Response) {
    const actor = getActor(req);
    const target = await this.loadTarget(actor, id);
    const evidence = await this.prisma.evidence.findFirst({ where: { id: evidenceId, targetId: target.id, kind: EvidenceKind.FILE } });
    if (!evidence?.data || !evidence.mimeType) throw new NotFoundException('Không tìm thấy tệp minh chứng');
    const name = evidence.originalName ?? 'minh-chung';
    res.setHeader('Content-Type', evidence.mimeType);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(name)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
    return res.send(Buffer.from(evidence.data));
  }

  // ───── Giao việc, chuyển việc, trả lại ─────

  @Post(':id/assign')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.LEADER, Role.MANAGER)
  async assign(@Req() req: any, @Param('id') id: string, @Body() dto: AssignDto) {
    const actor = getActor(req);
    const target = await this.loadTarget(actor, id);
    if (!canSuperviseDepartment(actor, target.departmentId)) throw new ForbiddenException('Chỉ lãnh đạo hoặc trưởng phòng chủ trì được giao chuyên viên');
    if (target.isArchived) throw new ConflictException('Chỉ tiêu đã lưu trữ');
    const assignee = await this.prisma.user.findUnique({ where: { id: dto.assigneeId } });
    if (!assignee?.isActive || assignee.departmentId !== target.departmentId || !([Role.MANAGER, Role.STAFF] as Role[]).includes(assignee.role)) {
      throw new BadRequestException('Người được giao phải là trưởng phòng hoặc chuyên viên đang hoạt động của phòng chủ trì');
    }
    return this.prisma.$transaction(async tx => {
      const changed = await tx.target.updateMany({
        where: { id: target.id, version: target.version, isArchived: false },
        data: { assigneeId: assignee.id, assignedAt: new Date(), assignedById: actor.id, transferCount: 0 },
      });
      if (changed.count !== 1) throw new ConflictException('Chỉ tiêu vừa thay đổi. Vui lòng tải lại.');
      await recordWorkEvent(tx, {
        action: 'ASSIGNED', actor, targetId: target.id, departmentId: target.departmentId, responsibleUserId: assignee.id,
        note: `Giao ${assignee.fullName} phụ trách${dto.note ? `: ${dto.note}` : ''}`,
      });
      await audit(tx, actor, { action: 'TARGET_ASSIGNED', entityType: 'Target', entityId: target.id, departmentId: target.departmentId, metadata: { code: target.code, username: assignee.username } });
      await notifyUsers(tx, [assignee.id], {
        kind: 'ASSIGNED', title: `Bạn được giao phụ trách chỉ tiêu ${target.code}`, body: target.title,
        link: targetLink(target.id), entityType: 'Target', entityId: target.id, dedupeKey: `assign:${target.id}:${Date.now()}`,
      }, actor.id);
      return tx.target.findUniqueOrThrow({ where: { id: target.id }, include: { assignee: { select: { id: true, fullName: true } } } });
    });
  }

  @Post(':id/transfer')
  @UseGuards(RolesGuard)
  @Roles(Role.MANAGER, Role.STAFF)
  async transfer(@Req() req: any, @Param('id') id: string, @Body() dto: TransferDto) {
    const actor = getActor(req);
    const target = await this.loadTarget(actor, id);
    if (target.assigneeId !== actor.id) throw new ForbiddenException('Chỉ người đang phụ trách mới được chuyển việc');
    const setting = await this.prisma.systemSetting.findUnique({ where: { id: 'default' } });
    const maxTransfers = setting?.maxTransfers ?? 1;
    if (target.transferCount >= maxTransfers) {
      throw new ConflictException(`Chỉ tiêu đã được chuyển ${target.transferCount} lần (tối đa ${maxTransfers}). Nếu không đúng việc của bạn, hãy trả lại trưởng phòng để phân công lại.`);
    }
    if (dto.toUserId === actor.id) throw new BadRequestException('Không thể chuyển cho chính mình');
    const receiver = await this.prisma.user.findUnique({ where: { id: dto.toUserId } });
    if (!receiver?.isActive || receiver.departmentId !== target.departmentId || !([Role.MANAGER, Role.STAFF] as Role[]).includes(receiver.role)) {
      throw new BadRequestException('Chỉ chuyển cho cán bộ đang hoạt động cùng phòng chủ trì');
    }
    return this.prisma.$transaction(async tx => {
      const changed = await tx.target.updateMany({
        where: { id: target.id, version: target.version, assigneeId: actor.id, transferCount: target.transferCount },
        data: { assigneeId: receiver.id, assignedAt: new Date(), assignedById: actor.id, transferCount: { increment: 1 }, bounceCount: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictException('Chỉ tiêu vừa thay đổi. Vui lòng tải lại.');
      await recordWorkEvent(tx, {
        action: 'TRANSFERRED', actor, targetId: target.id, departmentId: target.departmentId, responsibleUserId: receiver.id,
        note: `Chuyển cho ${receiver.fullName}. Lý do: ${dto.reason}`, metadata: { bounceCount: target.bounceCount + 1 },
      });
      const managers = await departmentManagerIds(tx, target.departmentId);
      await notifyUsers(tx, [receiver.id, ...managers], {
        kind: 'TRANSFERRED', title: `${actor.fullName} chuyển chỉ tiêu ${target.code} cho ${receiver.fullName}`, body: dto.reason,
        link: targetLink(target.id), entityType: 'Target', entityId: target.id, dedupeKey: `transfer:${target.id}:${target.bounceCount + 1}`,
      }, actor.id);
      await this.escalateBounces(tx, target, target.bounceCount + 1, actor);
      return { ok: true };
    });
  }

  @Post(':id/return')
  @UseGuards(RolesGuard)
  @Roles(Role.MANAGER, Role.STAFF)
  async returnToManager(@Req() req: any, @Param('id') id: string, @Body() dto: ReturnDto) {
    const actor = getActor(req);
    const target = await this.loadTarget(actor, id);
    if (target.assigneeId !== actor.id) throw new ForbiddenException('Chỉ người đang phụ trách mới được trả lại');
    return this.prisma.$transaction(async tx => {
      const changed = await tx.target.updateMany({
        where: { id: target.id, version: target.version, assigneeId: actor.id },
        data: { assigneeId: null, assignedAt: null, bounceCount: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictException('Chỉ tiêu vừa thay đổi. Vui lòng tải lại.');
      const managers = await departmentManagerIds(tx, target.departmentId);
      await recordWorkEvent(tx, {
        action: 'RETURNED', actor, targetId: target.id, departmentId: target.departmentId, responsibleUserId: managers[0] ?? null,
        note: `Trả lại trưởng phòng. Lý do: ${dto.reason}`, metadata: { bounceCount: target.bounceCount + 1 },
      });
      await notifyUsers(tx, managers, {
        kind: 'RETURNED', title: `${actor.fullName} trả lại chỉ tiêu ${target.code} — cần phân công lại`, body: dto.reason,
        link: targetLink(target.id), entityType: 'Target', entityId: target.id, dedupeKey: `return:${target.id}:${target.bounceCount + 1}`,
      }, actor.id);
      await this.escalateBounces(tx, target, target.bounceCount + 1, actor);
      return { ok: true };
    });
  }

  /** Việc bị đẩy qua lại nhiều lần thì báo lên lãnh đạo UBND (hiện ở mục "Việc bị treo" trên màn hình điều hành). */
  private async escalateBounces(tx: Prisma.TransactionClient, target: DossierTarget, bounceCount: number, actor: Actor) {
    if (bounceCount < BOUNCE_ESCALATION) return;
    await recordWorkEvent(tx, {
      action: 'ESCALATED', actor: null, targetId: target.id, departmentId: target.departmentId,
      note: `Chỉ tiêu đã bị chuyển/trả ${bounceCount} lần — báo lãnh đạo UBND`, metadata: { bounceCount },
    });
    await notifyUsers(tx, await leaderIds(tx), {
      kind: 'ESCALATED', title: `Chỉ tiêu ${target.code} bị chuyển qua lại ${bounceCount} lần`,
      body: `${target.title} — ${target.department.name}`, link: targetLink(target.id), entityType: 'Target', entityId: target.id,
      dedupeKey: `bounce:${target.id}:${bounceCount}`,
    }, actor.id);
  }

  // ───── Phần 3: đánh giá ─────

  @Post(':id/evaluations')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.LEADER, Role.MANAGER)
  async evaluate(@Req() req: any, @Param('id') id: string, @Body() dto: EvaluationDto) {
    const actor = getActor(req);
    const target = await this.loadTarget(actor, id);
    if (!canSuperviseDepartment(actor, target.departmentId)) throw new ForbiddenException('Chỉ lãnh đạo hoặc trưởng phòng chủ trì được đánh giá');
    if (!isValidPeriodKey(dto.periodKey) || !dto.periodKey.startsWith(String(target.year))) {
      throw new BadRequestException('Kỳ đánh giá không hợp lệ hoặc không thuộc năm kế hoạch của chỉ tiêu');
    }
    if ((dto.result === EvaluationResult.NOT_ACHIEVED || dto.result === EvaluationResult.PARTIAL) && !dto.note?.trim()) {
      throw new BadRequestException('Chỉ tiêu chưa đạt phải nêu nguyên nhân (giải trình)');
    }
    if (target.maxScore !== null && dto.score !== undefined && dto.score > target.maxScore) {
      throw new BadRequestException(`Điểm không được vượt quá điểm tối đa ${target.maxScore}`);
    }
    return this.prisma.$transaction(async tx => {
      const existing = await tx.targetEvaluation.findUnique({ where: { targetId_periodKey: { targetId: target.id, periodKey: dto.periodKey } } });
      const data = {
        result: dto.result, score: dto.score ?? null, note: blankToNull(dto.note), correctiveAction: blankToNull(dto.correctiveAction),
        evaluatedById: actor.id, evaluatedByName: actor.fullName, evaluatedByRole: actor.role, evaluatedAt: new Date(),
      };
      let evaluation;
      if (existing) {
        if (dto.expectedVersion !== existing.version) throw new ConflictException('Kỳ này đã có đánh giá mới hơn. Vui lòng tải lại.');
        const changed = await tx.targetEvaluation.updateMany({ where: { id: existing.id, version: existing.version }, data: { ...data, version: { increment: 1 } } });
        if (changed.count !== 1) throw new ConflictException('Đánh giá vừa được người khác cập nhật. Vui lòng tải lại.');
        evaluation = await tx.targetEvaluation.findUniqueOrThrow({ where: { id: existing.id } });
      } else {
        evaluation = await tx.targetEvaluation.create({ data: { targetId: target.id, periodKey: dto.periodKey, ...data } });
      }
      await recordWorkEvent(tx, {
        action: 'EVALUATED', actor, targetId: target.id, departmentId: target.departmentId,
        note: `${periodLabel(dto.periodKey)}: ${EVALUATION_LABELS[dto.result]}${dto.note ? ` — ${dto.note}` : ''}`,
        metadata: { result: dto.result, periodKey: dto.periodKey },
      });
      await audit(tx, actor, { action: 'TARGET_EVALUATED', entityType: 'Target', entityId: target.id, departmentId: target.departmentId, metadata: { code: target.code, outcome: dto.result } });
      const recipients = [...await departmentManagerIds(tx, target.departmentId), target.assigneeId];
      await notifyUsers(tx, recipients, {
        kind: 'EVALUATED', title: `Chỉ tiêu ${target.code} được đánh giá ${EVALUATION_LABELS[dto.result].toLowerCase()} (${periodLabel(dto.periodKey)})`,
        body: dto.note ?? null, link: targetLink(target.id), entityType: 'Target', entityId: target.id,
        dedupeKey: `evaluate:${target.id}:${dto.periodKey}:${evaluation.version}`,
      }, actor.id);
      return evaluation;
    });
  }

  // ───── Giải trình ─────

  @Post(':id/explanations')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.LEADER)
  async requestExplanation(@Req() req: any, @Param('id') id: string, @Body() dto: ExplanationRequestDto) {
    const actor = getActor(req);
    const target = await this.loadTarget(actor, id);
    const setting = await this.prisma.systemSetting.findUnique({ where: { id: 'default' } });
    const days = dto.dueDays ?? setting?.explanationDueDays ?? 3;
    const dueAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    return this.prisma.$transaction(async tx => {
      const open = await tx.explanationRequest.count({ where: { targetId: target.id, status: ExplanationStatus.OPEN } });
      if (open) throw new ConflictException('Chỉ tiêu đang có yêu cầu giải trình chưa được trả lời');
      const request = await tx.explanationRequest.create({ data: { targetId: target.id, requestedById: actor.id, message: dto.message, dueAt } });
      const managers = await departmentManagerIds(tx, target.departmentId);
      await recordWorkEvent(tx, {
        action: 'EXPLANATION_REQUESTED', actor, targetId: target.id, departmentId: target.departmentId, responsibleUserId: managers[0] ?? null,
        note: dto.message,
      });
      await audit(tx, actor, { action: 'TARGET_EXPLANATION_REQUESTED', entityType: 'Target', entityId: target.id, departmentId: target.departmentId, metadata: { code: target.code } });
      await notifyUsers(tx, [...managers, target.assigneeId], {
        kind: 'EXPLANATION_REQUESTED', title: `${actor.position || 'Lãnh đạo'} ${actor.fullName} yêu cầu giải trình chỉ tiêu ${target.code}`,
        body: `${dto.message} (hạn ${days} ngày)`, link: targetLink(target.id), entityType: 'Target', entityId: target.id,
        dedupeKey: `explain:${request.id}`,
      }, actor.id);
      return request;
    });
  }

  @Post(':id/explanations/:requestId/respond')
  @UseGuards(RolesGuard)
  @Roles(...WORKING_ROLES)
  async respondExplanation(@Req() req: any, @Param('id') id: string, @Param('requestId') requestId: string, @Body() dto: ExplanationResponseDto) {
    const actor = getActor(req);
    const target = await this.loadTarget(actor, id);
    if (!canSuperviseDepartment(actor, target.departmentId) && target.assigneeId !== actor.id) {
      throw new ForbiddenException('Chỉ trưởng phòng chủ trì hoặc chuyên viên phụ trách được trả lời giải trình');
    }
    return this.prisma.$transaction(async tx => {
      const request = await tx.explanationRequest.findFirst({ where: { id: requestId, targetId: target.id } });
      if (!request) throw new NotFoundException('Không tìm thấy yêu cầu giải trình');
      const changed = await tx.explanationRequest.updateMany({
        where: { id: request.id, version: dto.expectedVersion, status: ExplanationStatus.OPEN },
        data: { status: ExplanationStatus.ANSWERED, response: dto.response, responderId: actor.id, responderName: actor.fullName, respondedAt: new Date(), version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictException('Yêu cầu giải trình đã được trả lời hoặc vừa thay đổi');
      await recordWorkEvent(tx, { action: 'EXPLANATION_ANSWERED', actor, targetId: target.id, departmentId: target.departmentId, note: dto.response });
      await notifyUsers(tx, [request.requestedById], {
        kind: 'EXPLANATION_ANSWERED', title: `${actor.fullName} đã giải trình chỉ tiêu ${target.code}`, body: dto.response.slice(0, 300),
        link: targetLink(target.id), entityType: 'Target', entityId: target.id, dedupeKey: `explain-answer:${request.id}`,
      }, actor.id);
      return tx.explanationRequest.findUniqueOrThrow({ where: { id: request.id } });
    });
  }

  // ───── Phiếu nguồn số liệu ─────

  @Patch(':id/source-card')
  @UseGuards(RolesGuard)
  @Roles(...WORKING_ROLES)
  async updateSourceCard(@Req() req: any, @Param('id') id: string, @Body() dto: SourceCardDto) {
    const actor = getActor(req);
    const target = await this.loadTarget(actor, id);
    if (!canSuperviseDepartment(actor, target.departmentId) && target.assigneeId !== actor.id && !isGlobalRole(actor.role)) {
      throw new ForbiddenException('Chỉ lãnh đạo, trưởng phòng hoặc chuyên viên phụ trách được sửa phiếu nguồn số liệu');
    }
    return this.prisma.$transaction(async tx => {
      // Phiếu nguồn số liệu không đổi ý nghĩa chỉ tiêu nên không tăng version định nghĩa; chỉ dùng version để chống ghi đè.
      const changed = await tx.target.updateMany({
        where: { id: target.id, version: dto.expectedVersion },
        data: {
          ...(dto.dataSourceSystem !== undefined ? { dataSourceSystem: blankToNull(dto.dataSourceSystem) } : {}),
          ...(dto.dataSourceAgency !== undefined ? { dataSourceAgency: blankToNull(dto.dataSourceAgency) } : {}),
          ...(dto.collectionGuide !== undefined ? { collectionGuide: blankToNull(dto.collectionGuide) } : {}),
          ...(dto.dataSourceUrl !== undefined ? { dataSourceUrl: blankToNull(dto.dataSourceUrl) } : {}),
          ...(dto.evidenceRequirement !== undefined ? { evidenceRequirement: blankToNull(dto.evidenceRequirement) } : {}),
          ...(dto.reportDueDay !== undefined ? { reportDueDay: dto.reportDueDay } : {}),
        },
      });
      if (changed.count !== 1) throw new ConflictException('Chỉ tiêu vừa thay đổi. Vui lòng tải lại.');
      await audit(tx, actor, { action: 'TARGET_SOURCE_CARD_UPDATED', entityType: 'Target', entityId: target.id, departmentId: target.departmentId, metadata: { code: target.code } });
      await recordWorkEvent(tx, { action: 'TARGET_UPDATED', actor, targetId: target.id, departmentId: target.departmentId, note: 'Cập nhật phiếu nguồn số liệu' });
      return tx.target.findUniqueOrThrow({ where: { id: target.id } });
    });
  }

  /** Nhắc chuyên viên/trưởng phòng cập nhật số liệu (trưởng phòng hoặc lãnh đạo bấm trên màn hình theo dõi). */
  @Post(':id/remind')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.LEADER, Role.MANAGER)
  async remind(@Req() req: any, @Param('id') id: string) {
    const actor = getActor(req);
    const target = await this.loadTarget(actor, id);
    if (!canSuperviseDepartment(actor, target.departmentId)) throw new ForbiddenException('Bạn không quản lý chỉ tiêu này');
    const recipients = target.assigneeId ? [target.assigneeId] : await departmentManagerIds(this.prisma, target.departmentId);
    const sent = await this.prisma.$transaction(async tx => {
      const count = await notifyUsers(tx, recipients, {
        kind: 'REMINDER', title: `Nhắc cập nhật số liệu chỉ tiêu ${target.code}`, body: `${actor.fullName} nhắc: ${target.title}`,
        link: targetLink(target.id), entityType: 'Target', entityId: target.id, dedupeKey: `remind:${target.id}:${vietnamDayKey()}`,
      }, actor.id);
      if (count) await recordWorkEvent(tx, { action: 'REMINDER', actor, targetId: target.id, departmentId: target.departmentId, responsibleUserId: recipients[0] ?? null, note: 'Nhắc cập nhật số liệu' });
      return count;
    });
    return { sent, message: sent ? 'Đã gửi nhắc việc' : 'Hôm nay đã nhắc chỉ tiêu này rồi' };
  }
}
