import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  FeedbackCategory,
  FeedbackClosureReason,
  FeedbackMessageVisibility,
  FeedbackPriority,
  FeedbackStatus,
  Prisma,
  Role,
} from '@prisma/client';
import {
  Equals,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { type Actor, audit, assertDepartmentAccess, getActor, resolveDepartmentScope } from './access';
import { JwtAuthGuard, Roles, RolesGuard } from './common';
import { PrismaService } from './prisma.service';
import { getClientIp, RateLimitService } from './rate-limit';

const PUBLIC_CREATE_WINDOW_MS = 60 * 60 * 1_000;
const PUBLIC_TRACK_WINDOW_MS = 15 * 60 * 1_000;
const PUBLIC_SECRET_ACTION_WINDOW_MS = 60 * 60 * 1_000;
const CONSENT_POLICY_VERSION = 'citizen-feedback-v1-2026-07-15';
export const LOOKUP_SECRET_MIN_LENGTH = 20;
export const LOOKUP_SECRET_MAX_LENGTH = 64;

const OPEN_STATUSES: FeedbackStatus[] = [
  FeedbackStatus.RECEIVED,
  FeedbackStatus.ASSIGNED,
  FeedbackStatus.IN_PROGRESS,
  FeedbackStatus.PENDING_REVIEW,
  FeedbackStatus.REOPENED,
];

const PUBLIC_EVENT_ACTIONS = [
  'CREATED',
  'FEEDBACK_ASSIGNED',
  'FEEDBACK_STARTED',
  'INFORMATION_REQUESTED',
  'CITIZEN_MESSAGE_ADDED',
  'PUBLIC_MESSAGE_ADDED',
  'FEEDBACK_SUBMITTED_FOR_REVIEW',
  'RESOLUTION_APPROVED',
  'FEEDBACK_CLOSED',
  'FEEDBACK_CLOSED_NO_RESPONSE',
  'FEEDBACK_REJECTED',
  'FEEDBACK_REOPENED',
  'CITIZEN_REOPEN_REQUESTED',
  'CITIZEN_REOPEN_REQUEST_APPROVED',
  'CITIZEN_REOPEN_REQUEST_REJECTED',
  'CITIZEN_RATED',
];

const Trim = () => Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value,
);

export class CreatePublicFeedbackDto {
  @IsUUID('4') clientSubmissionId!: string;
  @Trim() @IsString() @MinLength(LOOKUP_SECRET_MIN_LENGTH) @MaxLength(LOOKUP_SECRET_MAX_LENGTH) lookupSecret!: string;
  @Trim() @IsString() @MinLength(8) @MaxLength(200) title!: string;
  @Trim() @IsString() @MinLength(20) @MaxLength(5000) content!: string;
  @IsEnum(FeedbackCategory) category!: FeedbackCategory;
  @Trim() @IsString() @MinLength(2) @MaxLength(160) submitterName!: string;
  @Trim() @IsString() @Matches(/^(?=(?:\D*\d){9,15}\D*$)\+?[0-9().\-\s]+$/, { message: 'Số điện thoại phải có từ 9 đến 15 chữ số hợp lệ' }) submitterPhone!: string;
  @IsOptional() @Trim() @IsEmail() @MaxLength(180) submitterEmail?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsIn(['PHONE', 'EMAIL']) preferredContact?: 'PHONE' | 'EMAIL';
  @IsBoolean() @Equals(true, { message: 'Bạn cần đồng ý chính sách xử lý dữ liệu' }) consent!: boolean;
  @IsBoolean() @Equals(true, { message: 'Kênh này không tiếp nhận khiếu nại hoặc tố cáo' }) scopeConfirmed!: boolean;
}

export class TrackFeedbackDto {
  @Trim() @IsString() @MinLength(8) @MaxLength(30) code!: string;
  @Trim() @IsString() @MinLength(LOOKUP_SECRET_MIN_LENGTH) @MaxLength(LOOKUP_SECRET_MAX_LENGTH) lookupSecret!: string;
}

export class VersionedSecretDto {
  @Trim() @IsString() @MinLength(LOOKUP_SECRET_MIN_LENGTH) @MaxLength(LOOKUP_SECRET_MAX_LENGTH) lookupSecret!: string;
  @IsInt() @Min(1) expectedVersion!: number;
}

class CitizenMessageDto extends VersionedSecretDto {
  @Trim() @IsString() @MinLength(3) @MaxLength(3000) message!: string;
}

class CitizenRatingDto extends VersionedSecretDto {
  @IsInt() @Min(1) @Max(5) rating!: number;
  @IsOptional() @Trim() @IsString() @MaxLength(1000) comment?: string;
}

class CitizenReopenDto extends VersionedSecretDto {
  @Trim() @IsString() @MinLength(10) @MaxLength(2000) reason!: string;
}

class ExpectedVersionDto {
  @IsInt() @Min(1) expectedVersion!: number;
}

class AssignFeedbackDto extends ExpectedVersionDto {
  @Trim() @IsString() departmentId!: string;
  @IsOptional() @Trim() @IsString() assignedToId?: string;
  @IsOptional() @IsEnum(FeedbackPriority) priority?: FeedbackPriority;
  @IsOptional() @IsDateString() dueAt?: string;
  @Trim() @IsString() @MinLength(3) @MaxLength(1000) note!: string;
}

class TriageFeedbackDto extends ExpectedVersionDto {
  @IsEnum(FeedbackCategory) category!: FeedbackCategory;
  @IsEnum(FeedbackPriority) priority!: FeedbackPriority;
  @Trim() @IsString() @MinLength(3) @MaxLength(1000) note!: string;
}

class MessageFeedbackDto extends ExpectedVersionDto {
  @Trim() @IsString() @MinLength(2) @MaxLength(3000) body!: string;
  @IsEnum(FeedbackMessageVisibility) visibility!: FeedbackMessageVisibility;
}

class RequestInformationDto extends ExpectedVersionDto {
  @Trim() @IsString() @MinLength(5) @MaxLength(3000) message!: string;
}

class ContactAttemptDto extends ExpectedVersionDto {
  @IsIn(['PHONE', 'EMAIL']) channel!: 'PHONE' | 'EMAIL';
  @IsIn(['REACHED', 'NO_ANSWER', 'MESSAGE_SENT', 'INVALID_CONTACT']) outcome!: 'REACHED' | 'NO_ANSWER' | 'MESSAGE_SENT' | 'INVALID_CONTACT';
  @Trim() @IsString() @MinLength(3) @MaxLength(1000) note!: string;
}

class SubmitResolutionDto extends ExpectedVersionDto {
  @Trim() @IsString() @MinLength(10) @MaxLength(5000) summary!: string;
}

class ReviewResolutionDto extends ExpectedVersionDto {
  @IsIn(['APPROVE', 'RETURN']) decision!: 'APPROVE' | 'RETURN';
  @IsOptional() @Trim() @IsString() @MaxLength(2000) note?: string;
}

class RejectFeedbackDto extends ExpectedVersionDto {
  @Trim() @IsString() @MinLength(10) @MaxLength(2000) reason!: string;
}

class CloseFeedbackDto extends ExpectedVersionDto {
  @IsOptional() @Trim() @IsString() @MaxLength(1000) note?: string;
}

class CloseNoResponseDto extends ExpectedVersionDto {
  @IsOptional() @Trim() @IsString() @MaxLength(1000) note?: string;
}

class ReopenFeedbackDto extends ExpectedVersionDto {
  @Trim() @IsString() @MinLength(10) @MaxLength(2000) reason!: string;
}

class RejectReopenRequestDto extends ExpectedVersionDto {
  @Trim() @IsString() @MinLength(10) @MaxLength(2000) reason!: string;
}

class PublishFeedbackDto extends ExpectedVersionDto {
  @IsBoolean() publish!: boolean;
  @IsOptional() @Trim() @IsString() @MinLength(8) @MaxLength(200) title?: string;
  @IsOptional() @Trim() @IsString() @MinLength(20) @MaxLength(3000) summary?: string;
  @IsOptional() @IsBoolean() confirmAnonymized?: boolean;
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function feedbackCodeYear(date = new Date()) {
  const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1_000;
  return new Date(date.getTime() + VIETNAM_OFFSET_MS).getUTCFullYear();
}

function resolutionDaysForPriority(baseDays: number, priority: FeedbackPriority) {
  if (priority === FeedbackPriority.URGENT) return 1;
  if (priority === FeedbackPriority.HIGH) return Math.max(2, Math.ceil(baseDays / 2));
  if (priority === FeedbackPriority.LOW) return baseDays + 5;
  return baseDays;
}

function publicContentPiiSignals(
  title: string,
  summary: string,
  feedback: { submitterName: string; submitterPhone: string; submitterEmail: string | null; address: string | null },
) {
  const text = `${title}\n${summary}`;
  const lower = text.toLocaleLowerCase('vi-VN');
  const normalizedText = normalizePiiText(text);
  const digits = text.replace(/\D/g, '');
  const signals = new Set<string>();
  if (/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(text) || (feedback.submitterEmail && lower.includes(feedback.submitterEmail.toLocaleLowerCase('vi-VN')))) signals.add('email');
  const phoneDigits = feedback.submitterPhone.replace(/\D/g, '');
  if (/(?:\D|^)(?:\d[\s().-]*){9,15}(?:\D|$)/.test(text) || (phoneDigits.length >= 9 && digits.includes(phoneDigits))) signals.add('số điện thoại hoặc mã định danh');
  const normalizedName = normalizePiiText(feedback.submitterName);
  if (normalizedName.length >= 5 && normalizedText.includes(normalizedName)) signals.add('họ tên người gửi');
  const normalizedAddress = feedback.address ? normalizePiiText(feedback.address) : '';
  if (normalizedAddress.length >= 8 && normalizedText.includes(normalizedAddress)) signals.add('địa chỉ chi tiết');
  return [...signals];
}

function normalizePiiText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLocaleLowerCase('vi-VN')
    .replace(/\s+/g, ' ')
    .trim();
}

function reopenedFeedbackData(dueAt: Date): Prisma.FeedbackUncheckedUpdateManyInput {
  return {
    reopenCount: { increment: 1 },
    assignedToId: null,
    dueAt,
    closedAt: null,
    resolvedAt: null,
    resolutionSummary: null,
    submittedForReviewAt: null,
    submittedForReviewBy: null,
    rating: null,
    ratingComment: null,
    ratedAt: null,
    isPublic: false,
    publicTitle: null,
    publicSummary: null,
    publicCategory: null,
    publicDepartmentName: null,
    publicResolvedAt: null,
    publicPublishedAt: null,
    publicPublishedBy: null,
    waitingCitizenAt: null,
    citizenResponseDueAt: null,
    rejectionReason: null,
    closureReason: null,
    reopenRequestDecision: null,
    reopenRequestDecisionNote: null,
    reopenRequestReviewedAt: null,
    reopenRequestReviewedBy: null,
  };
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

function hasStatus(status: FeedbackStatus, ...allowed: FeedbackStatus[]) {
  return allowed.includes(status);
}

function maskPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.length < 4 ? '***' : `${digits.slice(0, 3)}***${digits.slice(-3)}`;
}

function maskEmail(value?: string | null) {
  if (!value) return null;
  const [name, domain] = value.split('@');
  return `${name.slice(0, 1)}***@${domain || '***'}`;
}

function withoutSecret<T extends { lookupSecretHash?: string; clientSubmissionId?: string | null }>(row: T) {
  const { lookupSecretHash: _secret, clientSubmissionId: _submissionId, ...safe } = row;
  return safe;
}

@Controller('public/feedbacks')
export class PublicFeedbackController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimit: RateLimitService,
  ) {}

  private limitSecretAction(request: any, code: string) {
    const clientIp = getClientIp(request);
    this.rateLimit.consume('public-feedback-secret-ip', clientIp, {
      limit: 30,
      windowMs: PUBLIC_SECRET_ACTION_WINDOW_MS,
      message: 'Bạn thao tác quá nhiều lần. Vui lòng thử lại sau.',
    });
    this.rateLimit.consume('public-feedback-secret-code', `${clientIp}:${normalizeCode(code)}`, {
      limit: 12,
      windowMs: PUBLIC_SECRET_ACTION_WINDOW_MS,
      message: 'Hồ sơ này đang nhận quá nhiều thao tác. Vui lòng thử lại sau.',
    });
  }

  private async findVerified(code: string, secret: string) {
    const feedback = await this.prisma.feedback.findUnique({
      where: { code: normalizeCode(code) },
      include: {
        department: { select: { name: true } },
        messages: {
          where: { visibility: FeedbackMessageVisibility.PUBLIC },
          orderBy: { createdAt: 'asc' },
          select: { id: true, body: true, authorName: true, createdAt: true },
        },
        events: {
          where: { action: { in: PUBLIC_EVENT_ACTIONS } },
          orderBy: { createdAt: 'asc' },
          select: { id: true, action: true, fromStatus: true, toStatus: true, createdAt: true },
        },
      },
    });
    if (!feedback || !(await bcrypt.compare(secret, feedback.lookupSecretHash))) {
      throw new NotFoundException('Mã phản ánh hoặc mã bảo mật không đúng');
    }
    return feedback;
  }

  private publicDetail(feedback: Awaited<ReturnType<PublicFeedbackController['findVerified']>>) {
    return {
      code: feedback.code,
      title: feedback.title,
      content: feedback.content,
      category: feedback.category,
      priority: feedback.priority,
      status: feedback.status,
      address: feedback.address,
      departmentName: feedback.department?.name ?? null,
      dueAt: feedback.dueAt,
      firstResponseDueAt: feedback.firstResponseDueAt,
      firstResponseAt: feedback.firstResponseAt,
      waitingCitizenAt: feedback.waitingCitizenAt,
      citizenResponseDueAt: feedback.citizenResponseDueAt,
      resolvedAt: feedback.resolvedAt,
      closedAt: feedback.closedAt,
      resolutionSummary: hasStatus(feedback.status, FeedbackStatus.RESOLVED, FeedbackStatus.CLOSED)
        ? feedback.resolutionSummary
        : null,
      rejectionReason: feedback.status === FeedbackStatus.REJECTED ? feedback.rejectionReason : null,
      closureReason: feedback.closureReason,
      rating: feedback.rating,
      ratingComment: feedback.ratingComment,
      reopenRequestedAt: feedback.reopenRequestedAt,
      reopenRequestReason: feedback.reopenRequestReason,
      reopenRequestCount: feedback.reopenRequestCount,
      reopenRequestDecision: feedback.reopenRequestDecision,
      reopenRequestDecisionNote: feedback.reopenRequestDecisionNote,
      reopenRequestReviewedAt: feedback.reopenRequestReviewedAt,
      createdAt: feedback.createdAt,
      updatedAt: feedback.updatedAt,
      version: feedback.version,
      messages: feedback.messages,
      events: feedback.events,
    };
  }

  @Post()
  async create(@Body() dto: CreatePublicFeedbackDto, @Req() req: any) {
    const clientIp = getClientIp(req);
    this.rateLimit.consume('public-feedback-replay-ip', clientIp, {
      limit: 40,
      windowMs: PUBLIC_CREATE_WINDOW_MS,
      message: 'Bạn thao tác gửi phản ánh quá nhiều lần. Vui lòng thử lại sau.',
    });
    this.rateLimit.consume('public-feedback-replay-key', `${clientIp}:${dto.clientSubmissionId}`, {
      limit: 10,
      windowMs: PUBLIC_CREATE_WINDOW_MS,
      message: 'Yêu cầu này được thử lại quá nhiều lần. Vui lòng thử lại sau.',
    });
    const replay = await this.prisma.feedback.findUnique({ where: { clientSubmissionId: dto.clientSubmissionId } });
    if (replay) {
      if (!(await bcrypt.compare(dto.lookupSecret, replay.lookupSecretHash))) {
        throw new ConflictException('Yêu cầu gửi phản ánh không hợp lệ');
      }
      return {
        code: replay.code,
        lookupSecret: dto.lookupSecret,
        status: replay.status,
        createdAt: replay.createdAt,
        message: 'Phản ánh đã được tiếp nhận trước đó. Biên nhận được khôi phục an toàn.',
      };
    }
    this.rateLimit.consume('public-feedback-create', clientIp, {
      limit: 8,
      windowMs: PUBLIC_CREATE_WINDOW_MS,
      message: 'Bạn đã gửi quá nhiều phản ánh. Vui lòng thử lại sau.',
    });
    if (dto.preferredContact === 'EMAIL' && !dto.submitterEmail) {
      throw new BadRequestException('Vui lòng nhập email để cán bộ có thể liên hệ theo kênh ưu tiên');
    }
    const lookupSecret = dto.lookupSecret;
    const lookupSecretHash = await bcrypt.hash(lookupSecret, 10);
    const settings = await this.prisma.systemSetting.findUnique({ where: { id: 'default' } });
    const firstResponseDueAt = addDays(new Date(), settings?.feedbackFirstResponseDays ?? 2);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const code = `PA-${feedbackCodeYear()}-${randomBytes(4).toString('hex').toUpperCase()}`;
      try {
        const created = await this.prisma.$transaction(async tx => {
          const feedback = await tx.feedback.create({
            data: {
              code,
              clientSubmissionId: dto.clientSubmissionId,
              lookupSecretHash,
              title: dto.title.trim(),
              content: dto.content.trim(),
              category: dto.category,
              submitterName: dto.submitterName.trim(),
              submitterPhone: dto.submitterPhone.trim(),
              submitterEmail: dto.submitterEmail?.trim().toLowerCase(),
              address: dto.address?.trim() || null,
              preferredContact: dto.preferredContact ?? 'PHONE',
              consentAcceptedAt: new Date(),
              scopeConfirmedAt: new Date(),
              consentPolicyVersion: CONSENT_POLICY_VERSION,
              firstResponseDueAt,
            },
          });
          await tx.feedbackEvent.create({
            data: {
              feedbackId: feedback.id,
              action: 'CREATED',
              toStatus: FeedbackStatus.RECEIVED,
              actorName: 'Người dân',
            },
          });
          return feedback;
        });
        return {
          code: created.code,
          lookupSecret,
          status: created.status,
          createdAt: created.createdAt,
          message: 'Phản ánh đã được tiếp nhận. Hãy lưu mã phản ánh và mã bảo mật để tra cứu.',
        };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const existing = await this.prisma.feedback.findUnique({ where: { clientSubmissionId: dto.clientSubmissionId } });
          if (existing && await bcrypt.compare(dto.lookupSecret, existing.lookupSecretHash)) {
            return {
              code: existing.code,
              lookupSecret,
              status: existing.status,
              createdAt: existing.createdAt,
              message: 'Phản ánh đã được tiếp nhận trước đó. Biên nhận được khôi phục an toàn.',
            };
          }
          continue;
        }
        throw error;
      }
    }
    throw new ConflictException('Không thể tạo mã phản ánh. Vui lòng thử lại.');
  }

  @Post('track')
  async track(@Body() dto: TrackFeedbackDto, @Req() req: any) {
    const clientIp = getClientIp(req);
    this.rateLimit.consume('public-feedback-track-ip', clientIp, {
      limit: 30,
      windowMs: PUBLIC_TRACK_WINDOW_MS,
      message: 'Bạn tra cứu quá nhiều lần. Vui lòng thử lại sau.',
    });
    this.rateLimit.consume('public-feedback-track-code', `${clientIp}:${normalizeCode(dto.code)}`, {
      limit: 10,
      windowMs: PUBLIC_TRACK_WINDOW_MS,
      message: 'Bạn tra cứu hồ sơ này quá nhiều lần. Vui lòng thử lại sau.',
    });
    return this.publicDetail(await this.findVerified(dto.code, dto.lookupSecret));
  }

  @Post(':code/messages')
  async citizenMessage(@Param('code') code: string, @Body() dto: CitizenMessageDto, @Req() req: any) {
    this.limitSecretAction(req, code);
    const feedback = await this.findVerified(code, dto.lookupSecret);
    if (!hasStatus(feedback.status, FeedbackStatus.WAITING_CITIZEN, FeedbackStatus.IN_PROGRESS, FeedbackStatus.REOPENED)) {
      throw new ConflictException('Hồ sơ hiện không ở trạng thái tiếp nhận thông tin bổ sung');
    }
    const nextStatus = feedback.status === FeedbackStatus.WAITING_CITIZEN ? FeedbackStatus.IN_PROGRESS : feedback.status;
    const now = new Date();
    const pausedMs = feedback.status === FeedbackStatus.WAITING_CITIZEN && feedback.waitingCitizenAt
      ? Math.max(0, now.getTime() - feedback.waitingCitizenAt.getTime())
      : 0;
    const dueAt = feedback.dueAt && pausedMs > 0
      ? new Date(feedback.dueAt.getTime() + pausedMs)
      : feedback.dueAt;
    await this.prisma.$transaction(async tx => {
      const changed = await tx.feedback.updateMany({
        where: { id: feedback.id, version: dto.expectedVersion },
        data: {
          status: nextStatus,
          dueAt,
          waitingCitizenAt: nextStatus === FeedbackStatus.IN_PROGRESS ? null : feedback.waitingCitizenAt,
          citizenResponseDueAt: nextStatus === FeedbackStatus.IN_PROGRESS ? null : feedback.citizenResponseDueAt,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new ConflictException('Hồ sơ vừa được cập nhật. Vui lòng tra cứu lại.');
      await tx.feedbackMessage.create({
        data: {
          feedbackId: feedback.id,
          body: dto.message.trim(),
          visibility: FeedbackMessageVisibility.PUBLIC,
          authorName: 'Người dân',
        },
      });
      await tx.feedbackEvent.create({
        data: {
          feedbackId: feedback.id,
          action: 'CITIZEN_MESSAGE_ADDED',
          fromStatus: feedback.status,
          toStatus: nextStatus,
          actorName: 'Người dân',
        },
      });
    });
    return this.publicDetail(await this.findVerified(code, dto.lookupSecret));
  }

  @Post(':code/rating')
  async rate(@Param('code') code: string, @Body() dto: CitizenRatingDto, @Req() req: any) {
    this.limitSecretAction(req, code);
    const feedback = await this.findVerified(code, dto.lookupSecret);
    if (!hasStatus(feedback.status, FeedbackStatus.RESOLVED, FeedbackStatus.CLOSED)) {
      throw new ConflictException('Chỉ có thể đánh giá hồ sơ đã có kết quả xử lý');
    }
    if (feedback.closureReason !== FeedbackClosureReason.RESOLVED) {
      throw new ConflictException('Hồ sơ chưa có kết quả chuyên môn để đánh giá');
    }
    if (feedback.reopenRequestedAt) {
      throw new ConflictException('Không thể đánh giá khi đề nghị xem xét lại đang chờ xử lý');
    }
    if (feedback.rating !== null) {
      throw new ConflictException('Hồ sơ này đã được đánh giá và không thể đánh giá lại');
    }
    const nextStatus = feedback.status === FeedbackStatus.RESOLVED ? FeedbackStatus.CLOSED : feedback.status;
    await this.prisma.$transaction(async tx => {
      const changed = await tx.feedback.updateMany({
        where: { id: feedback.id, version: dto.expectedVersion, rating: null },
        data: {
          rating: dto.rating,
          ratingComment: dto.comment?.trim() || null,
          ratedAt: new Date(),
          status: nextStatus,
          closedAt: nextStatus === FeedbackStatus.CLOSED ? (feedback.closedAt ?? new Date()) : feedback.closedAt,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new ConflictException('Hồ sơ vừa được cập nhật. Vui lòng tra cứu lại.');
      await tx.feedbackEvent.create({
        data: { feedbackId: feedback.id, action: 'CITIZEN_RATED', actorName: 'Người dân', fromStatus: feedback.status, toStatus: nextStatus, metadata: { rating: dto.rating, comment: dto.comment?.trim() || null } },
      });
    });
    return this.publicDetail(await this.findVerified(code, dto.lookupSecret));
  }

  @Post(':code/reopen')
  async reopen(@Param('code') code: string, @Body() dto: CitizenReopenDto, @Req() req: any) {
    this.limitSecretAction(req, code);
    const feedback = await this.findVerified(code, dto.lookupSecret);
    if (!hasStatus(feedback.status, FeedbackStatus.RESOLVED, FeedbackStatus.CLOSED, FeedbackStatus.REJECTED)) {
      throw new ConflictException('Chỉ có thể yêu cầu xem xét lại hồ sơ đã có kết quả hoặc quyết định không tiếp nhận');
    }
    if (feedback.reopenRequestedAt) {
      throw new ConflictException('Đề nghị xem xét lại đang chờ người có thẩm quyền xử lý');
    }
    if (feedback.reopenRequestCount >= 3) {
      throw new ConflictException('Hồ sơ đã đạt số lần đề nghị xem xét lại tối đa');
    }
    const decisionAt = feedback.closedAt ?? feedback.resolvedAt;
    const appealWindowMs = 30 * 24 * 60 * 60 * 1_000;
    if (!decisionAt || Date.now() - decisionAt.getTime() > appealWindowMs) {
      throw new ConflictException('Thời hạn đề nghị xem xét lại là 30 ngày kể từ kết quả gần nhất');
    }
    const requestedAt = new Date();
    await this.prisma.$transaction(async tx => {
      const changed = await tx.feedback.updateMany({
        where: { id: feedback.id, version: dto.expectedVersion, reopenRequestedAt: null },
        data: {
          reopenRequestedAt: requestedAt,
          reopenRequestReason: dto.reason.trim(),
          reopenRequestCount: { increment: 1 },
          reopenRequestDecision: null,
          reopenRequestDecisionNote: null,
          reopenRequestReviewedAt: null,
          reopenRequestReviewedBy: null,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new ConflictException('Hồ sơ vừa được cập nhật. Vui lòng tra cứu lại.');
      await tx.feedbackEvent.create({
        data: {
          feedbackId: feedback.id,
          action: 'CITIZEN_REOPEN_REQUESTED',
          actorName: 'Người dân',
          fromStatus: feedback.status,
          toStatus: feedback.status,
          note: dto.reason.trim(),
        },
      });
    });
    return this.publicDetail(await this.findVerified(code, dto.lookupSecret));
  }

  @Get('published')
  async published() {
    const items = await this.prisma.feedback.findMany({
      where: { isPublic: true, status: { in: [FeedbackStatus.RESOLVED, FeedbackStatus.CLOSED] }, publicPublishedAt: { not: null } },
      select: {
        code: true,
        publicCategory: true,
        publicTitle: true,
        publicSummary: true,
        publicPublishedAt: true,
        publicResolvedAt: true,
        publicDepartmentName: true,
      },
      orderBy: { publicPublishedAt: 'desc' },
      take: 12,
    });
    return items.map(item => ({
      code: item.code,
      category: item.publicCategory,
      publicTitle: item.publicTitle,
      publicSummary: item.publicSummary,
      publicPublishedAt: item.publicPublishedAt,
      resolvedAt: item.publicResolvedAt,
      department: item.publicDepartmentName ? { name: item.publicDepartmentName } : null,
    }));
  }
}

@Controller('feedbacks')
@UseGuards(JwtAuthGuard)
export class FeedbackController {
  constructor(private readonly prisma: PrismaService) {}

  private scope(actor: Actor, requestedDepartmentId?: string): Prisma.FeedbackWhereInput {
    const departmentId = resolveDepartmentScope(actor, requestedDepartmentId);
    return {
      ...(departmentId ? { departmentId } : {}),
      ...(actor.role === Role.STAFF ? { assignedToId: actor.id } : {}),
    };
  }

  private async findScoped(actor: Actor, id: string) {
    const feedback = await this.prisma.feedback.findFirst({
      where: { id, ...this.scope(actor) },
      include: {
        department: true,
        assignedTo: { select: { id: true, fullName: true, username: true, role: true, departmentId: true, isActive: true } },
        messages: {
          ...(actor.role === Role.VIEWER ? { where: { visibility: FeedbackMessageVisibility.PUBLIC } } : {}),
          orderBy: { createdAt: 'asc' },
        },
        events: actor.role === Role.VIEWER
          ? {
              where: { action: { in: PUBLIC_EVENT_ACTIONS } },
              orderBy: { createdAt: 'asc' },
              select: { id: true, action: true, fromStatus: true, toStatus: true, createdAt: true },
            }
          : { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!feedback) throw new NotFoundException('Không tìm thấy phản ánh trong phạm vi được phép');
    return feedback;
  }

  private internalView<T extends { lookupSecretHash?: string; submitterName: string; submitterPhone: string; submitterEmail?: string | null; address?: string | null }>(row: T, actor: Actor) {
    const safe = withoutSecret(row);
    if (actor.role !== Role.VIEWER) return safe;
    const detail = safe as typeof safe & {
      title?: string;
      content?: string;
      resolutionSummary?: string | null;
      rejectionReason?: string | null;
      ratingComment?: string | null;
      reopenRequestReason?: string | null;
      reopenRequestDecisionNote?: string | null;
      messages?: Array<{ body: string; [key: string]: unknown }>;
    };
    return {
      ...safe,
      title: 'Phản ánh trong phạm vi đơn vị',
      content: 'Nội dung chi tiết được giới hạn cho cán bộ trực tiếp xử lý hồ sơ.',
      resolutionSummary: null,
      rejectionReason: null,
      ratingComment: null,
      reopenRequestReason: null,
      reopenRequestDecisionNote: null,
      messages: detail.messages?.map(message => ({
        ...message,
        body: 'Nội dung trao đổi được ẩn ở chế độ chỉ xem.',
      })),
      submitterName: 'Đã ẩn danh',
      submitterPhone: maskPhone(row.submitterPhone),
      submitterEmail: maskEmail(row.submitterEmail),
      address: null,
    };
  }

  private assertCanHandle(actor: Actor, feedback: { departmentId: string | null; assignedToId: string | null }) {
    if (actor.role === Role.ADMIN) return;
    if (!feedback.departmentId) throw new ForbiddenException('Phản ánh chưa được phân công cho đơn vị');
    assertDepartmentAccess(actor, feedback.departmentId);
    if (actor.role === Role.STAFF && feedback.assignedToId !== actor.id) {
      throw new ForbiddenException('Cán bộ chỉ được xử lý phản ánh được giao trực tiếp');
    }
  }

  private async transition(
    actor: Actor,
    feedback: Awaited<ReturnType<FeedbackController['findScoped']>>,
    expectedVersion: number,
    allowed: FeedbackStatus[],
    next: FeedbackStatus,
    action: string,
    data: Prisma.FeedbackUncheckedUpdateManyInput = {},
    note?: string,
    auditContext?: { departmentId?: string | null; metadata?: Prisma.InputJsonObject },
  ) {
    if (!allowed.includes(feedback.status)) throw new ConflictException(`Không thể thực hiện thao tác khi hồ sơ đang ở trạng thái ${feedback.status}`);
    return this.prisma.$transaction(async tx => {
      const changed = await tx.feedback.updateMany({
        where: { id: feedback.id, version: expectedVersion },
        data: { ...data, status: next, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictException('Hồ sơ vừa được người khác cập nhật. Vui lòng tải lại.');
      await tx.feedbackEvent.create({
        data: { feedbackId: feedback.id, action, fromStatus: feedback.status, toStatus: next, actorId: actor.id, actorName: actor.fullName, note: note?.trim() || null, metadata: auditContext?.metadata },
      });
      await audit(tx, actor, {
        action,
        entityType: 'Feedback',
        entityId: feedback.id,
        departmentId: auditContext && Object.prototype.hasOwnProperty.call(auditContext, 'departmentId')
          ? auditContext.departmentId
          : feedback.departmentId,
        metadata: {
          code: feedback.code,
          fromStatus: feedback.status,
          toStatus: next,
          ...auditContext?.metadata,
        },
      });
      return tx.feedback.findUniqueOrThrow({ where: { id: feedback.id }, include: { department: true, assignedTo: { select: { id: true, fullName: true, username: true } } } });
    });
  }

  @Get('stats')
  async stats(@Req() req: any, @Query('departmentId') requestedDepartmentId?: string) {
    const actor = getActor(req);
    const scope = this.scope(actor, requestedDepartmentId);
    const now = new Date();
    const soon = addDays(now, 2);
    const [total, received, inProgress, awaitingCitizen, waitingCitizenExpired, pendingReview, reopenRequested, resolved, overdue, dueSoon, rated] = await Promise.all([
      this.prisma.feedback.count({ where: scope }),
      this.prisma.feedback.count({ where: { ...scope, status: FeedbackStatus.RECEIVED } }),
      this.prisma.feedback.count({ where: { ...scope, status: { in: [FeedbackStatus.ASSIGNED, FeedbackStatus.IN_PROGRESS, FeedbackStatus.WAITING_CITIZEN, FeedbackStatus.REOPENED] } } }),
      this.prisma.feedback.count({ where: { ...scope, status: FeedbackStatus.WAITING_CITIZEN } }),
      this.prisma.feedback.count({ where: { ...scope, status: FeedbackStatus.WAITING_CITIZEN, citizenResponseDueAt: { lt: now } } }),
      this.prisma.feedback.count({ where: { ...scope, status: FeedbackStatus.PENDING_REVIEW } }),
      this.prisma.feedback.count({ where: { ...scope, reopenRequestedAt: { not: null } } }),
      this.prisma.feedback.count({ where: { ...scope, status: { in: [FeedbackStatus.RESOLVED, FeedbackStatus.CLOSED] }, closureReason: FeedbackClosureReason.RESOLVED } }),
      this.prisma.feedback.count({
        where: {
          ...scope,
          status: { in: OPEN_STATUSES },
          OR: [{ dueAt: { lt: now } }, { firstResponseAt: null, firstResponseDueAt: { lt: now } }],
        },
      }),
      this.prisma.feedback.count({
        where: {
          ...scope,
          status: { in: OPEN_STATUSES },
          OR: [
            { dueAt: { gte: now, lte: soon } },
            { firstResponseAt: null, firstResponseDueAt: { gte: now, lte: soon } },
          ],
        },
      }),
      this.prisma.feedback.aggregate({ where: { ...scope, rating: { not: null } }, _avg: { rating: true }, _count: { rating: true } }),
    ]);
    return { total, received, inProgress, awaitingCitizen, waitingCitizenExpired, pendingReview, reopenRequested, resolved, overdue, dueSoon, averageRating: rated._avg.rating ?? null, ratingCount: rated._count.rating };
  }

  @Get()
  async list(
    @Req() req: any,
    @Query('departmentId') requestedDepartmentId?: string,
    @Query('status') statusRaw?: string,
    @Query('priority') priorityRaw?: string,
    @Query('category') categoryRaw?: string,
    @Query('search') searchRaw?: string,
    @Query('assignedToMe') assignedToMeRaw?: string,
    @Query('reopenRequested') reopenRequestedRaw?: string,
    @Query('waitingCitizenExpired') waitingCitizenExpiredRaw?: string,
    @Query('page') pageRaw?: string,
    @Query('pageSize') pageSizeRaw?: string,
  ) {
    const actor = getActor(req);
    const page = pageRaw === undefined ? 1 : Number(pageRaw);
    const pageSize = pageSizeRaw === undefined ? 25 : Number(pageSizeRaw);
    if (!Number.isInteger(page) || page < 1) {
      throw new BadRequestException('Số trang phải là số nguyên dương');
    }
    if (!Number.isInteger(pageSize) || pageSize < 10 || pageSize > 100) {
      throw new BadRequestException('Kích thước trang phải là số nguyên từ 10 đến 100');
    }
    const status = statusRaw && Object.values(FeedbackStatus).includes(statusRaw as FeedbackStatus) ? statusRaw as FeedbackStatus : undefined;
    const priority = priorityRaw && Object.values(FeedbackPriority).includes(priorityRaw as FeedbackPriority) ? priorityRaw as FeedbackPriority : undefined;
    const category = categoryRaw && Object.values(FeedbackCategory).includes(categoryRaw as FeedbackCategory) ? categoryRaw as FeedbackCategory : undefined;
    if (statusRaw && !status) throw new BadRequestException('Trạng thái phản ánh không hợp lệ');
    if (priorityRaw && !priority) throw new BadRequestException('Mức ưu tiên không hợp lệ');
    if (categoryRaw && !category) throw new BadRequestException('Nhóm phản ánh không hợp lệ');
    const search = searchRaw?.trim().slice(0, 100);
    if (reopenRequestedRaw !== undefined && !['true', 'false'].includes(reopenRequestedRaw)) {
      throw new BadRequestException('Bộ lọc đề nghị xem xét lại không hợp lệ');
    }
    if (waitingCitizenExpiredRaw !== undefined && !['true', 'false'].includes(waitingCitizenExpiredRaw)) {
      throw new BadRequestException('Bộ lọc quá hạn bổ sung thông tin không hợp lệ');
    }
    if (assignedToMeRaw !== undefined && !['true', 'false'].includes(assignedToMeRaw)) {
      throw new BadRequestException('Bộ lọc việc được giao không hợp lệ');
    }
    const where: Prisma.FeedbackWhereInput = {
      ...this.scope(actor, requestedDepartmentId),
      status,
      priority,
      category,
      ...(assignedToMeRaw === 'true' ? { assignedToId: actor.id } : {}),
      ...(reopenRequestedRaw === 'true' ? { reopenRequestedAt: { not: null } } : {}),
      ...(waitingCitizenExpiredRaw === 'true' ? { status: FeedbackStatus.WAITING_CITIZEN, citizenResponseDueAt: { lt: new Date() } } : {}),
      ...(search ? {
        OR: actor.role === Role.VIEWER
          ? [{ code: { contains: search, mode: 'insensitive' } }]
          : [
              { code: { contains: search, mode: 'insensitive' } },
              { title: { contains: search, mode: 'insensitive' } },
              { content: { contains: search, mode: 'insensitive' } },
            ],
      } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.feedback.findMany({
        where,
        include: { department: true, assignedTo: { select: { id: true, fullName: true, username: true } }, _count: { select: { messages: true } } },
        orderBy: [
          { reopenRequestedAt: { sort: 'desc', nulls: 'last' } },
          { citizenResponseDueAt: { sort: 'asc', nulls: 'last' } },
          { dueAt: 'asc' },
          { createdAt: 'desc' },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.feedback.count({ where }),
    ]);
    return { items: items.map(item => this.internalView(item, actor)), total, page, pageSize };
  }

  @Get('assignees')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  async assignees(@Req() req: any, @Query('departmentId') requestedDepartmentId?: string) {
    const actor = getActor(req);
    const departmentId = resolveDepartmentScope(actor, requestedDepartmentId);
    return this.prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: [Role.MANAGER, Role.STAFF] },
        ...(departmentId ? { departmentId } : {}),
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        departmentId: true,
        department: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ department: { name: 'asc' } }, { fullName: 'asc' }],
    });
  }

  @Get(':id')
  async detail(@Req() req: any, @Param('id') id: string) {
    const actor = getActor(req);
    return this.internalView(await this.findScoped(actor, id), actor);
  }

  @Post(':id/triage')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  async triage(@Req() req: any, @Param('id') id: string, @Body() dto: TriageFeedbackDto) {
    const actor = getActor(req);
    const feedback = await this.findScoped(actor, id);
    if (!hasStatus(feedback.status, FeedbackStatus.RECEIVED, FeedbackStatus.ASSIGNED)) {
      throw new ConflictException('Chỉ được phân loại hồ sơ mới tiếp nhận hoặc vừa được giao');
    }
    const priorityChanged = dto.priority !== feedback.priority;
    const settings = priorityChanged && feedback.dueAt
      ? await this.prisma.systemSetting.findUnique({ where: { id: 'default' } })
      : null;
    const recalculatedDueAt = priorityChanged && feedback.dueAt
      ? addDays(new Date(), resolutionDaysForPriority(settings?.feedbackResolutionDays ?? 10, dto.priority))
      : feedback.dueAt;
    return this.prisma.$transaction(async tx => {
      const changed = await tx.feedback.updateMany({
        where: { id, version: dto.expectedVersion },
        data: { category: dto.category, priority: dto.priority, dueAt: recalculatedDueAt, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictException('Hồ sơ vừa được người khác cập nhật. Vui lòng tải lại.');
      await tx.feedbackEvent.create({
        data: {
          feedbackId: id,
          action: 'FEEDBACK_TRIAGED',
          actorId: actor.id,
          actorName: actor.fullName,
          note: dto.note.trim(),
          metadata: { category: dto.category, priority: dto.priority, previousPriority: feedback.priority, previousDueAt: feedback.dueAt?.toISOString() ?? null, dueAt: recalculatedDueAt?.toISOString() ?? null },
        },
      });
      await audit(tx, actor, {
        action: 'FEEDBACK_TRIAGED',
        entityType: 'Feedback',
        entityId: id,
        departmentId: feedback.departmentId,
        metadata: { category: dto.category, priority: dto.priority, previousPriority: feedback.priority, previousDueAt: feedback.dueAt?.toISOString() ?? null, dueAt: recalculatedDueAt?.toISOString() ?? null },
      });
      return withoutSecret(await tx.feedback.findUniqueOrThrow({ where: { id } }));
    });
  }

  @Post(':id/assign')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  async assign(@Req() req: any, @Param('id') id: string, @Body() dto: AssignFeedbackDto) {
    const actor = getActor(req);
    const feedback = await this.findScoped(actor, id);
    assertDepartmentAccess(actor, dto.departmentId);
    const department = await this.prisma.department.findUnique({ where: { id: dto.departmentId } });
    if (!department?.isActive) throw new BadRequestException('Đơn vị xử lý không tồn tại hoặc đã ngừng hoạt động');
    let assignee: { id: string; fullName: string; departmentId: string | null; isActive: boolean; role: Role } | null = null;
    if (dto.assignedToId) {
      assignee = await this.prisma.user.findUnique({ where: { id: dto.assignedToId }, select: { id: true, fullName: true, departmentId: true, isActive: true, role: true } });
      if (!assignee || !assignee.isActive || assignee.departmentId !== dto.departmentId || !([Role.STAFF, Role.MANAGER] as Role[]).includes(assignee.role)) {
        throw new BadRequestException('Cán bộ xử lý không hợp lệ hoặc không thuộc đơn vị được giao');
      }
    }
    const settings = await this.prisma.systemSetting.findUnique({ where: { id: 'default' } });
    const baseDays = settings?.feedbackResolutionDays ?? 10;
    const priority = dto.priority ?? feedback.priority;
    const priorityDays = resolutionDaysForPriority(baseDays, priority);
    const priorityChanged = priority !== feedback.priority;
    const requestedDueAt = dto.dueAt ? new Date(dto.dueAt) : null;
    const manualDueChanged = Boolean(requestedDueAt && requestedDueAt.getTime() !== feedback.dueAt?.getTime());
    const dueAt = manualDueChanged
      ? requestedDueAt!
      : (priorityChanged || !feedback.dueAt ? addDays(new Date(), priorityDays) : feedback.dueAt);
    if (dueAt <= new Date()) throw new BadRequestException('Hạn xử lý phải ở tương lai');
    const result = await this.transition(
      actor,
      feedback,
      dto.expectedVersion,
      [FeedbackStatus.RECEIVED, FeedbackStatus.ASSIGNED, FeedbackStatus.REOPENED, FeedbackStatus.IN_PROGRESS, FeedbackStatus.WAITING_CITIZEN],
      feedback.status === FeedbackStatus.WAITING_CITIZEN ? FeedbackStatus.WAITING_CITIZEN : FeedbackStatus.ASSIGNED,
      'FEEDBACK_ASSIGNED',
      {
        departmentId: dto.departmentId,
        assignedToId: dto.assignedToId ?? null,
        priority,
        dueAt,
        ...(feedback.status === FeedbackStatus.WAITING_CITIZEN && (priorityChanged || manualDueChanged) ? { waitingCitizenAt: new Date() } : {}),
      },
      dto.note,
      {
        departmentId: dto.departmentId,
        metadata: {
          previousDepartmentId: feedback.departmentId,
          assignedToId: assignee?.id ?? null,
          assignedToName: assignee?.fullName ?? null,
          priority,
          previousPriority: feedback.priority,
          previousDueAt: feedback.dueAt?.toISOString() ?? null,
          dueAt: dueAt.toISOString(),
        },
      },
    );
    return withoutSecret(result);
  }

  @Post(':id/start')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  async start(@Req() req: any, @Param('id') id: string, @Body() dto: ExpectedVersionDto) {
    const actor = getActor(req);
    const feedback = await this.findScoped(actor, id);
    this.assertCanHandle(actor, feedback);
    return withoutSecret(await this.transition(actor, feedback, dto.expectedVersion, [FeedbackStatus.ASSIGNED, FeedbackStatus.REOPENED], FeedbackStatus.IN_PROGRESS, 'FEEDBACK_STARTED'));
  }

  @Post(':id/request-information')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  async requestInformation(@Req() req: any, @Param('id') id: string, @Body() dto: RequestInformationDto) {
    const actor = getActor(req);
    const feedback = await this.findScoped(actor, id);
    this.assertCanHandle(actor, feedback);
    if (!hasStatus(feedback.status, FeedbackStatus.IN_PROGRESS, FeedbackStatus.REOPENED)) throw new ConflictException('Chỉ được yêu cầu bổ sung khi hồ sơ đang xử lý');
    const settings = await this.prisma.systemSetting.findUnique({ where: { id: 'default' } });
    const now = new Date();
    const citizenResponseDueAt = addDays(now, settings?.feedbackCitizenResponseDays ?? 7);
    return this.prisma.$transaction(async tx => {
      const changed = await tx.feedback.updateMany({ where: { id, version: dto.expectedVersion }, data: { status: FeedbackStatus.WAITING_CITIZEN, firstResponseAt: feedback.firstResponseAt ?? now, waitingCitizenAt: now, citizenResponseDueAt, version: { increment: 1 } } });
      if (changed.count !== 1) throw new ConflictException('Hồ sơ vừa được cập nhật. Vui lòng tải lại.');
      await tx.feedbackMessage.create({ data: { feedbackId: id, body: dto.message.trim(), visibility: FeedbackMessageVisibility.PUBLIC, authorId: actor.id, authorName: actor.fullName } });
      await tx.feedbackEvent.create({ data: { feedbackId: id, action: 'INFORMATION_REQUESTED', fromStatus: feedback.status, toStatus: FeedbackStatus.WAITING_CITIZEN, actorId: actor.id, actorName: actor.fullName, metadata: { citizenResponseDueAt: citizenResponseDueAt.toISOString() } } });
      await audit(tx, actor, { action: 'INFORMATION_REQUESTED', entityType: 'Feedback', entityId: id, departmentId: feedback.departmentId, metadata: { citizenResponseDueAt: citizenResponseDueAt.toISOString() } });
      return { success: true };
    });
  }

  @Post(':id/messages')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  async addMessage(@Req() req: any, @Param('id') id: string, @Body() dto: MessageFeedbackDto) {
    const actor = getActor(req);
    const feedback = await this.findScoped(actor, id);
    this.assertCanHandle(actor, feedback);
    if (
      dto.visibility === FeedbackMessageVisibility.PUBLIC
      && !hasStatus(feedback.status, FeedbackStatus.IN_PROGRESS, FeedbackStatus.WAITING_CITIZEN, FeedbackStatus.REOPENED)
    ) {
      throw new ConflictException('Phản hồi cho người dân chỉ được gửi khi hồ sơ đang xử lý hoặc chờ bổ sung');
    }
    if (hasStatus(feedback.status, FeedbackStatus.CLOSED, FeedbackStatus.REJECTED)) throw new ConflictException('Hồ sơ đã đóng, không thể thêm trao đổi');
    return this.prisma.$transaction(async tx => {
      const changed = await tx.feedback.updateMany({ where: { id, version: dto.expectedVersion }, data: { firstResponseAt: dto.visibility === FeedbackMessageVisibility.PUBLIC ? (feedback.firstResponseAt ?? new Date()) : feedback.firstResponseAt, version: { increment: 1 } } });
      if (changed.count !== 1) throw new ConflictException('Hồ sơ vừa được cập nhật. Vui lòng tải lại.');
      const message = await tx.feedbackMessage.create({ data: { feedbackId: id, body: dto.body.trim(), visibility: dto.visibility, authorId: actor.id, authorName: actor.fullName } });
      await tx.feedbackEvent.create({ data: { feedbackId: id, action: dto.visibility === FeedbackMessageVisibility.PUBLIC ? 'PUBLIC_MESSAGE_ADDED' : 'INTERNAL_NOTE_ADDED', actorId: actor.id, actorName: actor.fullName } });
      await audit(tx, actor, { action: 'FEEDBACK_MESSAGE_ADDED', entityType: 'Feedback', entityId: id, departmentId: feedback.departmentId, metadata: { visibility: dto.visibility } });
      return message;
    });
  }

  @Post(':id/contact-attempt')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  async logContactAttempt(@Req() req: any, @Param('id') id: string, @Body() dto: ContactAttemptDto) {
    const actor = getActor(req);
    const feedback = await this.findScoped(actor, id);
    this.assertCanHandle(actor, feedback);
    if (hasStatus(feedback.status, FeedbackStatus.CLOSED, FeedbackStatus.REJECTED, FeedbackStatus.RESOLVED)) {
      throw new ConflictException('Không thể ghi liên hệ mới khi hồ sơ đã kết thúc');
    }
    const contacted = dto.outcome === 'REACHED' || dto.outcome === 'MESSAGE_SENT';
    return this.prisma.$transaction(async tx => {
      const changed = await tx.feedback.updateMany({
        where: { id, version: dto.expectedVersion },
        data: { firstResponseAt: contacted ? (feedback.firstResponseAt ?? new Date()) : feedback.firstResponseAt, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictException('Hồ sơ vừa được cập nhật. Vui lòng tải lại.');
      const metadata: Prisma.InputJsonObject = { channel: dto.channel, outcome: dto.outcome };
      await tx.feedbackEvent.create({ data: { feedbackId: id, action: 'CONTACT_ATTEMPT_LOGGED', actorId: actor.id, actorName: actor.fullName, note: dto.note.trim(), metadata } });
      await audit(tx, actor, { action: 'CONTACT_ATTEMPT_LOGGED', entityType: 'Feedback', entityId: id, departmentId: feedback.departmentId, metadata });
      return { success: true };
    });
  }

  @Post(':id/submit-resolution')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  async submitResolution(@Req() req: any, @Param('id') id: string, @Body() dto: SubmitResolutionDto) {
    const actor = getActor(req);
    const feedback = await this.findScoped(actor, id);
    this.assertCanHandle(actor, feedback);
    return withoutSecret(await this.transition(actor, feedback, dto.expectedVersion, [FeedbackStatus.IN_PROGRESS, FeedbackStatus.REOPENED], FeedbackStatus.PENDING_REVIEW, 'FEEDBACK_SUBMITTED_FOR_REVIEW', { resolutionSummary: dto.summary.trim(), submittedForReviewAt: new Date(), submittedForReviewBy: actor.id }, dto.summary));
  }

  @Post(':id/review')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  async review(@Req() req: any, @Param('id') id: string, @Body() dto: ReviewResolutionDto) {
    const actor = getActor(req);
    const feedback = await this.findScoped(actor, id);
    if (feedback.status !== FeedbackStatus.PENDING_REVIEW) throw new ConflictException('Hồ sơ không ở trạng thái chờ duyệt kết quả');
    if (feedback.submittedForReviewBy === actor.id) throw new ForbiddenException('Người trình kết quả không được tự duyệt');
    if (dto.decision === 'RETURN' && !dto.note?.trim()) throw new BadRequestException('Cần nêu lý do trả lại kết quả');
    const next = dto.decision === 'APPROVE' ? FeedbackStatus.RESOLVED : FeedbackStatus.IN_PROGRESS;
    return this.prisma.$transaction(async tx => {
      const changed = await tx.feedback.updateMany({
        where: { id, version: dto.expectedVersion },
        data: {
          status: next,
          resolvedAt: next === FeedbackStatus.RESOLVED ? new Date() : null,
          closureReason: next === FeedbackStatus.RESOLVED ? FeedbackClosureReason.RESOLVED : null,
          firstResponseAt: next === FeedbackStatus.RESOLVED ? (feedback.firstResponseAt ?? new Date()) : feedback.firstResponseAt,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new ConflictException('Hồ sơ vừa được cập nhật. Vui lòng tải lại.');
      if (next === FeedbackStatus.RESOLVED && feedback.resolutionSummary) {
        await tx.feedbackMessage.create({ data: { feedbackId: id, body: feedback.resolutionSummary, visibility: FeedbackMessageVisibility.PUBLIC, authorId: actor.id, authorName: actor.fullName } });
      }
      if (next === FeedbackStatus.IN_PROGRESS && dto.note) {
        await tx.feedbackMessage.create({ data: { feedbackId: id, body: dto.note.trim(), visibility: FeedbackMessageVisibility.INTERNAL, authorId: actor.id, authorName: actor.fullName } });
      }
      await tx.feedbackEvent.create({ data: { feedbackId: id, action: next === FeedbackStatus.RESOLVED ? 'RESOLUTION_APPROVED' : 'RESOLUTION_RETURNED', fromStatus: feedback.status, toStatus: next, actorId: actor.id, actorName: actor.fullName, note: dto.note?.trim() || null } });
      await audit(tx, actor, { action: next === FeedbackStatus.RESOLVED ? 'RESOLUTION_APPROVED' : 'RESOLUTION_RETURNED', entityType: 'Feedback', entityId: id, departmentId: feedback.departmentId });
      return withoutSecret(await tx.feedback.findUniqueOrThrow({ where: { id }, include: { department: true, assignedTo: { select: { id: true, fullName: true, username: true } } } }));
    });
  }

  @Post(':id/close')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  async close(@Req() req: any, @Param('id') id: string, @Body() dto: CloseFeedbackDto) {
    const actor = getActor(req);
    const feedback = await this.findScoped(actor, id);
    return withoutSecret(await this.transition(actor, feedback, dto.expectedVersion, [FeedbackStatus.RESOLVED], FeedbackStatus.CLOSED, 'FEEDBACK_CLOSED', { closedAt: new Date(), closureReason: FeedbackClosureReason.RESOLVED }, dto.note));
  }

  @Post(':id/close-no-response')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  async closeNoResponse(@Req() req: any, @Param('id') id: string, @Body() dto: CloseNoResponseDto) {
    const actor = getActor(req);
    const feedback = await this.findScoped(actor, id);
    if (feedback.status !== FeedbackStatus.WAITING_CITIZEN || !feedback.citizenResponseDueAt) {
      throw new ConflictException('Hồ sơ không ở trạng thái chờ người dân bổ sung thông tin');
    }
    if (feedback.citizenResponseDueAt > new Date()) {
      throw new ConflictException('Chưa hết thời hạn để người dân bổ sung thông tin');
    }
    const citizenResponseDueAt = feedback.citizenResponseDueAt;
    const summary = dto.note?.trim()
      ? `Hồ sơ được kết thúc do quá thời hạn bổ sung thông tin. ${dto.note.trim()}`
      : 'Hồ sơ được kết thúc do quá thời hạn bổ sung thông tin theo yêu cầu của đơn vị xử lý.';
    return this.prisma.$transaction(async tx => {
      const changed = await tx.feedback.updateMany({
        where: { id, version: dto.expectedVersion, status: FeedbackStatus.WAITING_CITIZEN },
        data: {
          status: FeedbackStatus.CLOSED,
          closedAt: new Date(),
          resolutionSummary: summary,
          closureReason: FeedbackClosureReason.NO_CITIZEN_RESPONSE,
          waitingCitizenAt: null,
          citizenResponseDueAt: null,
          isPublic: false,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new ConflictException('Hồ sơ vừa được cập nhật. Vui lòng tải lại.');
      await tx.feedbackMessage.create({ data: { feedbackId: id, body: summary, visibility: FeedbackMessageVisibility.PUBLIC, authorId: actor.id, authorName: actor.fullName } });
      await tx.feedbackEvent.create({ data: { feedbackId: id, action: 'FEEDBACK_CLOSED_NO_RESPONSE', fromStatus: feedback.status, toStatus: FeedbackStatus.CLOSED, actorId: actor.id, actorName: actor.fullName, note: dto.note?.trim() || null } });
      await audit(tx, actor, { action: 'FEEDBACK_CLOSED_NO_RESPONSE', entityType: 'Feedback', entityId: id, departmentId: feedback.departmentId, metadata: { citizenResponseDueAt: citizenResponseDueAt.toISOString() } });
      return withoutSecret(await tx.feedback.findUniqueOrThrow({ where: { id }, include: { department: true, assignedTo: { select: { id: true, fullName: true, username: true } } } }));
    });
  }

  @Post(':id/reject')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async reject(@Req() req: any, @Param('id') id: string, @Body() dto: RejectFeedbackDto) {
    const actor = getActor(req);
    const feedback = await this.findScoped(actor, id);
    return withoutSecret(await this.transition(actor, feedback, dto.expectedVersion, [FeedbackStatus.RECEIVED, FeedbackStatus.ASSIGNED], FeedbackStatus.REJECTED, 'FEEDBACK_REJECTED', { rejectionReason: dto.reason.trim(), closureReason: FeedbackClosureReason.OUT_OF_SCOPE, closedAt: new Date(), firstResponseAt: feedback.firstResponseAt ?? new Date() }, dto.reason));
  }

  @Post(':id/reopen')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  async reopen(@Req() req: any, @Param('id') id: string, @Body() dto: ReopenFeedbackDto) {
    const actor = getActor(req);
    const feedback = await this.findScoped(actor, id);
    const settings = await this.prisma.systemSetting.findUnique({ where: { id: 'default' } });
    const dueAt = addDays(new Date(), resolutionDaysForPriority(settings?.feedbackResolutionDays ?? 10, feedback.priority));
    const citizenRequested = Boolean(feedback.reopenRequestedAt);
    const department = feedback.departmentId
      ? await this.prisma.department.findUnique({ where: { id: feedback.departmentId }, select: { isActive: true } })
      : null;
    const inactiveDepartment = Boolean(feedback.departmentId && !department?.isActive);
    return withoutSecret(await this.transition(
      actor,
      feedback,
      dto.expectedVersion,
      [FeedbackStatus.RESOLVED, FeedbackStatus.CLOSED, FeedbackStatus.REJECTED],
      FeedbackStatus.REOPENED,
      citizenRequested ? 'CITIZEN_REOPEN_REQUEST_APPROVED' : 'FEEDBACK_REOPENED',
      {
        ...reopenedFeedbackData(dueAt),
        ...(inactiveDepartment ? { departmentId: null } : {}),
        reopenRequestedAt: null,
        ...(citizenRequested ? {
          reopenRequestDecision: 'APPROVED',
          reopenRequestDecisionNote: dto.reason.trim(),
          reopenRequestReviewedAt: new Date(),
          reopenRequestReviewedBy: actor.id,
        } : {}),
      },
      dto.reason,
      {
        departmentId: inactiveDepartment ? null : feedback.departmentId,
        metadata: {
          previousStatus: feedback.status,
          previousResolutionSummary: feedback.resolutionSummary ?? null,
          previousRejectionReason: feedback.rejectionReason ?? null,
          previousRating: feedback.rating ?? null,
          previousRatingComment: feedback.ratingComment ?? null,
          previousPublicTitle: feedback.publicTitle ?? null,
          previousPublicSummary: feedback.publicSummary ?? null,
          citizenRequested,
        },
      },
    ));
  }

  @Post(':id/reopen-request/reject')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  async rejectReopenRequest(@Req() req: any, @Param('id') id: string, @Body() dto: RejectReopenRequestDto) {
    const actor = getActor(req);
    const feedback = await this.findScoped(actor, id);
    if (!hasStatus(feedback.status, FeedbackStatus.RESOLVED, FeedbackStatus.CLOSED, FeedbackStatus.REJECTED) || !feedback.reopenRequestedAt) {
      throw new ConflictException('Hồ sơ không có đề nghị xem xét lại đang chờ xử lý');
    }
    return this.prisma.$transaction(async tx => {
      const changed = await tx.feedback.updateMany({
        where: { id, version: dto.expectedVersion, reopenRequestedAt: { not: null } },
        data: {
          reopenRequestedAt: null,
          reopenRequestDecision: 'REJECTED',
          reopenRequestDecisionNote: dto.reason.trim(),
          reopenRequestReviewedAt: new Date(),
          reopenRequestReviewedBy: actor.id,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new ConflictException('Đề nghị vừa được người khác xử lý. Vui lòng tải lại.');
      await tx.feedbackEvent.create({
        data: {
          feedbackId: id,
          action: 'CITIZEN_REOPEN_REQUEST_REJECTED',
          fromStatus: feedback.status,
          toStatus: feedback.status,
          actorId: actor.id,
          actorName: actor.fullName,
          note: dto.reason.trim(),
        },
      });
      await audit(tx, actor, {
        action: 'CITIZEN_REOPEN_REQUEST_REJECTED',
        entityType: 'Feedback',
        entityId: id,
        departmentId: feedback.departmentId,
      });
      return withoutSecret(await tx.feedback.findUniqueOrThrow({
        where: { id },
        include: { department: true, assignedTo: { select: { id: true, fullName: true, username: true } } },
      }));
    });
  }

  @Post(':id/publish')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async publish(@Req() req: any, @Param('id') id: string, @Body() dto: PublishFeedbackDto) {
    const actor = getActor(req);
    const feedback = await this.findScoped(actor, id);
    if (dto.publish && feedback.reopenRequestedAt) {
      throw new ConflictException('Không thể công khai kết quả khi đề nghị xem xét lại đang chờ xử lý');
    }
    if (dto.publish && !hasStatus(feedback.status, FeedbackStatus.RESOLVED, FeedbackStatus.CLOSED)) throw new ConflictException('Chỉ công khai phản ánh đã có kết quả xử lý');
    if (dto.publish && feedback.closureReason !== FeedbackClosureReason.RESOLVED) throw new ConflictException('Chỉ công khai hồ sơ có kết quả chuyên môn đã được duyệt');
    if (dto.publish && (!dto.title?.trim() || !dto.summary?.trim())) throw new BadRequestException('Cần nhập tiêu đề và nội dung đã ẩn danh trước khi công khai');
    if (dto.publish && dto.confirmAnonymized !== true) throw new BadRequestException('Cần xác nhận đã kiểm tra và ẩn danh nội dung trước khi công khai');
    const piiSignals = dto.publish
      ? publicContentPiiSignals(dto.title!.trim(), dto.summary!.trim(), feedback)
      : [];
    if (piiSignals.length) {
      throw new BadRequestException(`Nội dung công khai còn có dấu hiệu chứa ${piiSignals.join(', ')}. Vui lòng ẩn danh rồi thử lại.`);
    }
    return this.prisma.$transaction(async tx => {
      const changed = await tx.feedback.updateMany({
        where: { id, version: dto.expectedVersion },
        data: {
          isPublic: dto.publish,
          ...(dto.publish ? {
            publicTitle: dto.title!.trim(),
            publicSummary: dto.summary!.trim(),
            publicCategory: feedback.category,
            publicDepartmentName: feedback.department?.name ?? null,
            publicResolvedAt: feedback.resolvedAt,
            publicPublishedAt: new Date(),
            publicPublishedBy: actor.id,
          } : {}),
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new ConflictException('Hồ sơ vừa được cập nhật. Vui lòng tải lại.');
      const publicationSnapshot: Prisma.InputJsonObject = dto.publish
        ? {
            publicTitle: dto.title!.trim(),
            publicSummary: dto.summary!.trim(),
            publicCategory: feedback.category,
            publicDepartmentName: feedback.department?.name ?? null,
            publicResolvedAt: feedback.resolvedAt?.toISOString() ?? null,
            anonymizationConfirmed: true,
          }
        : {
            previousPublicTitle: feedback.publicTitle ?? null,
            previousPublicSummary: feedback.publicSummary ?? null,
            previousPublicCategory: feedback.publicCategory ?? null,
            previousPublicDepartmentName: feedback.publicDepartmentName ?? null,
          };
      await tx.feedbackEvent.create({ data: { feedbackId: id, action: dto.publish ? 'FEEDBACK_PUBLISHED' : 'FEEDBACK_UNPUBLISHED', actorId: actor.id, actorName: actor.fullName, metadata: publicationSnapshot } });
      await audit(tx, actor, { action: dto.publish ? 'FEEDBACK_PUBLISHED' : 'FEEDBACK_UNPUBLISHED', entityType: 'Feedback', entityId: id, departmentId: feedback.departmentId, metadata: publicationSnapshot });
      return withoutSecret(await tx.feedback.findUniqueOrThrow({ where: { id } }));
    });
  }
}
