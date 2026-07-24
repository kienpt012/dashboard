import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
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
import { Transform, Type } from 'class-transformer';
import { createHash, randomBytes } from 'crypto';
import { basename } from 'path';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import * as bcrypt from 'bcryptjs';
import { type Actor, audit, assertDepartmentAccess, getActor, resolveDepartmentScope } from './access';
import { JwtAuthGuard, Roles, RolesGuard } from './common';
import { PrismaService } from './prisma.service';
import { getClientIp, RateLimitService } from './rate-limit';

const PUBLIC_CREATE_WINDOW_MS = 60 * 60 * 1_000;
const PUBLIC_TRACK_WINDOW_MS = 15 * 60 * 1_000;
const PUBLIC_SECRET_ACTION_WINDOW_MS = 60 * 60 * 1_000;
const PUBLIC_ATTACHMENT_WINDOW_MS = 60 * 60 * 1_000;
const CONSENT_POLICY_VERSION = 'citizen-feedback-v1-2026-07-15';
export const LOOKUP_SECRET_MIN_LENGTH = 20;
export const LOOKUP_SECRET_MAX_LENGTH = 64;
export const FEEDBACK_ATTACHMENT_MAX_FILES = 5;
export const FEEDBACK_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

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
  'FEEDBACK_TRIAGED',
  'FEEDBACK_STARTED',
  'CONTACT_ATTEMPT_LOGGED',
  'INFORMATION_REQUESTED',
  'CITIZEN_MESSAGE_ADDED',
  'PUBLIC_MESSAGE_ADDED',
  'FEEDBACK_SUBMITTED_FOR_REVIEW',
  'RESOLUTION_APPROVED',
  'RESOLUTION_RETURNED',
  'FEEDBACK_CLOSED',
  'FEEDBACK_CLOSED_NO_RESPONSE',
  'FEEDBACK_REJECTED',
  'FEEDBACK_REOPENED',
  'CITIZEN_REOPEN_REQUESTED',
  'CITIZEN_REOPEN_REQUEST_APPROVED',
  'CITIZEN_REOPEN_REQUEST_REJECTED',
  'CITIZEN_RATED',
  'CITIZEN_ATTACHMENTS_ADDED',
  'FEEDBACK_PUBLISHED',
  'FEEDBACK_UNPUBLISHED',
];

const ATTACHMENT_MIME_EXTENSIONS = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['application/pdf', '.pdf'],
]);

const Trim = () => Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value,
);

export function shouldNotifyFeedbackByEmail(
  preferredContact: string | null | undefined,
  submitterEmail: string | null | undefined,
): submitterEmail is string {
  return preferredContact === 'EMAIL' && Boolean(submitterEmail?.trim());
}

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
  @IsOptional() @IsBoolean() confirmAnonymized?: boolean;
}

class AttachmentUploadDto extends VersionedSecretDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  declare expectedVersion: number;
}

class AttachmentDownloadDto {
  @Trim() @IsString() @MinLength(LOOKUP_SECRET_MIN_LENGTH) @MaxLength(LOOKUP_SECRET_MAX_LENGTH) lookupSecret!: string;
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

function escapeRegularExpression(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const VIETNAMESE_CHARACTER_CLASSES: Record<string, string> = {
  a: '[aàáảãạăằắẳẵặâầấẩẫậ]',
  e: '[eèéẻẽẹêềếểễệ]',
  i: '[iìíỉĩị]',
  o: '[oòóỏõọôồốổỗộơờớởỡợ]',
  u: '[uùúủũụưừứửữự]',
  y: '[yỳýỷỹỵ]',
  d: '[dđ]',
};

function replaceLiteralInsensitive(value: string, sensitive?: string | null) {
  const candidate = sensitive?.trim();
  if (!candidate || candidate.length < 3) return value;
  const exactReplaced = value.replace(new RegExp(escapeRegularExpression(candidate), 'giu'), '[đã ẩn]');
  const normalized = candidate
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/giu, 'd');
  const accentInsensitivePattern = [...normalized].map(character => {
    const lower = character.toLocaleLowerCase('vi-VN');
    if (VIETNAMESE_CHARACTER_CLASSES[lower]) return VIETNAMESE_CHARACTER_CLASSES[lower];
    if (/\s/u.test(character)) return '\\s+';
    return escapeRegularExpression(character);
  }).join('');
  return exactReplaced.replace(new RegExp(accentInsensitivePattern, 'giu'), '[đã ẩn]');
}

function replaceSubmitterPhoneVariants(value: string, phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 9) return value;
  const variants = new Set([digits]);
  if (digits.startsWith('84') && digits.length >= 10) variants.add(`0${digits.slice(2)}`);
  if (digits.startsWith('0') && digits.length >= 10) variants.add(`84${digits.slice(1)}`);
  let safe = value;
  for (const variant of variants) {
    const pattern = [...variant].join('[\\s().-]*');
    safe = safe.replace(new RegExp(`(?<!\\d)${pattern}(?!\\d)`, 'gu'), '[đã ẩn số điện thoại]');
  }
  return safe;
}

export type PublicFeedbackPii = {
  submitterName: string;
  submitterPhone: string;
  submitterEmail: string | null;
  address: string | null;
};

export function sanitizePublicFeedbackText(value: string | null | undefined, feedback: PublicFeedbackPii) {
  if (!value) return '';
  let safe = value.replace(/\u0000/g, '').trim();
  safe = replaceLiteralInsensitive(safe, feedback.submitterName);
  safe = replaceLiteralInsensitive(safe, feedback.submitterPhone);
  safe = replaceSubmitterPhoneVariants(safe, feedback.submitterPhone);
  safe = replaceLiteralInsensitive(safe, feedback.submitterEmail);
  safe = replaceLiteralInsensitive(safe, feedback.address);
  // Defense in depth for contact details written directly in the free-text
  // fields but different from the structured submitter information.
  safe = safe
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/giu, '[đã ẩn email]')
    .replace(/(?:\+?84|0)(?:[\s().-]*\d){8,10}/gu, '[đã ẩn số điện thoại]')
    .replace(/(?:cccd|cmnd|căn cước|can cuoc)\s*[:#-]?\s*(?:\d[\s.-]*){9,12}/giu, '[đã ẩn mã định danh]')
    .replace(/(?:địa\s*chỉ|dia\s*chi|nơi\s*ở|noi\s*o)\s*:\s*[^\r\n]{5,200}/giu, '[đã ẩn địa chỉ]')
    .replace(/(?:zalo|facebook|telegram|whatsapp)\s*[:#-]\s*[^\s,;.]{3,80}/giu, '[đã ẩn liên hệ]')
    .replace(/(?:\[đã ẩn\]\s*){2,}/giu, '[đã ẩn] ');
  return safe.trim();
}

export function buildPublicFeedbackSnapshot(feedback: PublicFeedbackPii & {
  title: string;
  content: string;
  resolutionSummary: string | null;
}) {
  return {
    title: sanitizePublicFeedbackText(feedback.title, feedback),
    content: sanitizePublicFeedbackText(feedback.content, feedback),
    resolutionSummary: sanitizePublicFeedbackText(feedback.resolutionSummary, feedback) || null,
  };
}

export function sanitizeAttachmentFileName(value: string) {
  const normalized = basename(value || 'tep-minh-chung')
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
  return normalized || 'tep-minh-chung';
}

export function detectAllowedAttachmentMime(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  return null;
}

export function declaredAttachmentMimeMatches(declaredMime: string | undefined, detectedMime: string) {
  const normalized = declaredMime?.trim().toLowerCase();
  return !normalized
    || normalized === 'application/octet-stream'
    || (ATTACHMENT_MIME_EXTENSIONS.has(normalized) && normalized === detectedMime);
}

function publicAttachmentMetadata(attachment: {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  sha256: string;
  createdAt: Date;
}) {
  return {
    id: attachment.id,
    originalName: attachment.originalName,
    mimeType: attachment.mimeType,
    size: attachment.size,
    sha256: attachment.sha256,
    createdAt: attachment.createdAt,
  };
}

function sendAttachment(
  attachment: { originalName: string; mimeType: string; size: number; data: Buffer },
  response: Response,
) {
  const safeName = sanitizeAttachmentFileName(attachment.originalName);
  const asciiName = safeName.replace(/[^\x20-\x7e]/g, '_');
  response.setHeader('Content-Type', attachment.mimeType);
  response.setHeader('Content-Length', String(attachment.size));
  response.setHeader(
    'Content-Disposition',
    `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
  );
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Cache-Control', 'private, no-store');
  return new StreamableFile(attachment.data);
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
    publicSnapshotVersion: 0,
    publicTitle: null,
    publicSummary: null,
    publicResolutionSummary: null,
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
          select: { body: true, authorName: true, createdAt: true },
        },
        events: {
          where: { action: { in: PUBLIC_EVENT_ACTIONS } },
          orderBy: { createdAt: 'asc' },
          select: { action: true, fromStatus: true, toStatus: true, createdAt: true },
        },
        attachments: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, originalName: true, mimeType: true, size: true, sha256: true, createdAt: true },
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
      messages: feedback.messages.map(message => ({
        body: message.body,
        authorName: message.authorName === 'Người dân' ? 'Người dân' : 'Đơn vị xử lý',
        createdAt: message.createdAt,
      })),
      events: feedback.events.map(event => ({
        action: event.action,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        createdAt: event.createdAt,
      })),
      attachments: feedback.attachments.map(publicAttachmentMetadata),
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
        version: replay.version,
        createdAt: replay.createdAt,
        message: 'Phản ánh đã được tiếp nhận trước đó. Hệ thống hiển thị lại thông tin biên nhận.',
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
          version: created.version,
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
              version: existing.version,
              createdAt: existing.createdAt,
              message: 'Phản ánh đã được tiếp nhận trước đó. Hệ thống hiển thị lại thông tin biên nhận.',
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

  @Post(':code/attachments')
  @UseInterceptors(FilesInterceptor('files', FEEDBACK_ATTACHMENT_MAX_FILES, {
    storage: memoryStorage(),
    limits: { files: FEEDBACK_ATTACHMENT_MAX_FILES, fileSize: FEEDBACK_ATTACHMENT_MAX_BYTES },
  }))
  async addAttachments(
    @Param('code') code: string,
    @Body() dto: AttachmentUploadDto,
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req: any,
  ) {
    this.limitSecretAction(req, code);
    const clientIp = getClientIp(req);
    this.rateLimit.consume('public-feedback-attachment-ip', clientIp, {
      limit: 15,
      windowMs: PUBLIC_ATTACHMENT_WINDOW_MS,
      message: 'Bạn tải tệp minh chứng quá nhiều lần. Vui lòng thử lại sau.',
    });
    const feedback = await this.findVerified(code, dto.lookupSecret);
    if (!files?.length) throw new BadRequestException('Vui lòng chọn ít nhất một tệp minh chứng');
    if (!hasStatus(
      feedback.status,
      FeedbackStatus.RECEIVED,
      FeedbackStatus.ASSIGNED,
      FeedbackStatus.IN_PROGRESS,
      FeedbackStatus.WAITING_CITIZEN,
      FeedbackStatus.REOPENED,
    )) {
      throw new ConflictException('Hồ sơ đã chuyển sang giai đoạn quyết định, không thể bổ sung tệp minh chứng');
    }

    const candidates = new Map<string, {
      originalName: string;
      mimeType: string;
      size: number;
      sha256: string;
      data: Buffer;
    }>();
    for (const file of files) {
      if (!file.buffer?.length) throw new BadRequestException('Tệp minh chứng không được để trống');
      if (file.size > FEEDBACK_ATTACHMENT_MAX_BYTES) {
        throw new BadRequestException('Mỗi tệp minh chứng không được vượt quá 10 MB');
      }
      const detectedMime = detectAllowedAttachmentMime(file.buffer);
      if (!detectedMime || !declaredAttachmentMimeMatches(file.mimetype, detectedMime)) {
        throw new BadRequestException('Chỉ chấp nhận tệp JPEG, PNG, WEBP hoặc PDF hợp lệ');
      }
      const sha256 = createHash('sha256').update(file.buffer).digest('hex');
      if (!candidates.has(sha256)) {
        candidates.set(sha256, {
          originalName: sanitizeAttachmentFileName(file.originalname),
          mimeType: detectedMime,
          size: file.size,
          sha256,
          data: file.buffer,
        });
      }
    }

    const existingHashes = new Set(feedback.attachments.map(attachment => attachment.sha256));
    const additions = [...candidates.values()].filter(candidate => !existingHashes.has(candidate.sha256));
    if (feedback.attachments.length + additions.length > FEEDBACK_ATTACHMENT_MAX_FILES) {
      throw new BadRequestException(`Mỗi phản ánh chỉ được lưu tối đa ${FEEDBACK_ATTACHMENT_MAX_FILES} tệp minh chứng`);
    }
    if (!additions.length) {
      return {
        attachments: feedback.attachments.map(publicAttachmentMetadata),
        version: feedback.version,
      };
    }
    if (feedback.version !== dto.expectedVersion) {
      throw new ConflictException('Hồ sơ vừa được cập nhật. Vui lòng tra cứu lại trước khi tải tệp.');
    }

    return this.prisma.$transaction(async tx => {
      const changed = await tx.feedback.updateMany({
        where: { id: feedback.id, version: dto.expectedVersion },
        data: { version: { increment: 1 } },
      });
      if (changed.count !== 1) {
        throw new ConflictException('Hồ sơ vừa được cập nhật. Vui lòng tra cứu lại trước khi tải tệp.');
      }
      for (const candidate of additions) {
        await tx.feedbackAttachment.create({
          data: {
            feedbackId: feedback.id,
            originalName: candidate.originalName,
            mimeType: candidate.mimeType,
            size: candidate.size,
            sha256: candidate.sha256,
            data: Uint8Array.from(candidate.data),
          },
        });
      }
      await tx.feedbackEvent.create({
        data: {
          feedbackId: feedback.id,
          action: 'CITIZEN_ATTACHMENTS_ADDED',
          fromStatus: feedback.status,
          toStatus: feedback.status,
          actorName: 'Người dân',
          metadata: { count: additions.length },
        },
      });
      const attachments = await tx.feedbackAttachment.findMany({
        where: { feedbackId: feedback.id },
        orderBy: { createdAt: 'asc' },
        select: { id: true, originalName: true, mimeType: true, size: true, sha256: true, createdAt: true },
      });
      return {
        attachments: attachments.map(publicAttachmentMetadata),
        version: feedback.version + 1,
      };
    });
  }

  @Post(':code/attachments/:attachmentId/download')
  @HttpCode(200)
  async downloadCitizenAttachment(
    @Param('code') code: string,
    @Param('attachmentId') attachmentId: string,
    @Body() dto: AttachmentDownloadDto,
    @Req() req: any,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.limitSecretAction(req, code);
    const feedback = await this.findVerified(code, dto.lookupSecret);
    const attachment = await this.prisma.feedbackAttachment.findFirst({
      where: { id: attachmentId, feedbackId: feedback.id },
      select: { originalName: true, mimeType: true, size: true, data: true },
    });
    if (!attachment) throw new NotFoundException('Không tìm thấy tệp minh chứng');
    return sendAttachment({ ...attachment, data: Buffer.from(attachment.data) }, response);
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
  async published(@Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    const items = await this.prisma.feedback.findMany({
      where: {
        isPublic: true,
        status: { in: [FeedbackStatus.RESOLVED, FeedbackStatus.CLOSED] },
        closureReason: FeedbackClosureReason.RESOLVED,
        publicPublishedAt: { not: null },
      },
      select: {
        code: true,
        title: true,
        content: true,
        category: true,
        submitterName: true,
        submitterPhone: true,
        submitterEmail: true,
        address: true,
        publicSnapshotVersion: true,
        publicTitle: true,
        publicSummary: true,
        publicCategory: true,
        publicPublishedAt: true,
        publicResolvedAt: true,
        publicDepartmentName: true,
      },
      orderBy: { publicPublishedAt: 'desc' },
      take: 12,
    });
    return items.map(item => ({
      code: item.code,
      category: item.publicCategory ?? item.category,
      publicTitle: item.publicSnapshotVersion >= 1
        ? (item.publicTitle ?? '')
        : sanitizePublicFeedbackText(item.title, item),
      publicSummary: item.publicSnapshotVersion >= 1
        ? (item.publicSummary ?? '')
        : sanitizePublicFeedbackText(item.content, item),
      publicPublishedAt: item.publicPublishedAt,
      resolvedAt: item.publicResolvedAt,
      department: item.publicDepartmentName ? { name: item.publicDepartmentName } : null,
    }));
  }

  @Get('published/:code')
  async publishedDetail(
    @Param('code') code: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    const feedback = await this.prisma.feedback.findFirst({
      where: {
        code: normalizeCode(code),
        isPublic: true,
        status: { in: [FeedbackStatus.RESOLVED, FeedbackStatus.CLOSED] },
        closureReason: FeedbackClosureReason.RESOLVED,
        publicPublishedAt: { not: null },
      },
      select: {
        code: true,
        title: true,
        content: true,
        category: true,
        status: true,
        submitterName: true,
        submitterPhone: true,
        submitterEmail: true,
        address: true,
        resolutionSummary: true,
        publicSnapshotVersion: true,
        publicTitle: true,
        publicSummary: true,
        publicResolutionSummary: true,
        publicCategory: true,
        publicDepartmentName: true,
        publicResolvedAt: true,
        publicPublishedAt: true,
        createdAt: true,
        resolvedAt: true,
        closedAt: true,
        messages: {
          where: { visibility: FeedbackMessageVisibility.PUBLIC },
          orderBy: { createdAt: 'asc' },
          select: { body: true, authorName: true, createdAt: true },
        },
        events: {
          where: { action: { in: PUBLIC_EVENT_ACTIONS } },
          orderBy: { createdAt: 'asc' },
          select: { action: true, fromStatus: true, toStatus: true, createdAt: true },
        },
      },
    });
    if (!feedback) throw new NotFoundException('Không tìm thấy phản ánh công khai');
    return {
      code: feedback.code,
      category: feedback.publicCategory ?? feedback.category,
      status: feedback.status,
      title: feedback.publicSnapshotVersion >= 1
        ? (feedback.publicTitle ?? '')
        : sanitizePublicFeedbackText(feedback.title, feedback),
      content: feedback.publicSnapshotVersion >= 1
        ? (feedback.publicSummary ?? '')
        : sanitizePublicFeedbackText(feedback.content, feedback),
      resolutionSummary: feedback.publicSnapshotVersion >= 1
        ? feedback.publicResolutionSummary
        : (sanitizePublicFeedbackText(feedback.resolutionSummary, feedback) || null),
      departmentName: feedback.publicDepartmentName,
      createdAt: feedback.createdAt,
      resolvedAt: feedback.publicResolvedAt ?? feedback.resolvedAt,
      closedAt: feedback.closedAt,
      publishedAt: feedback.publicPublishedAt,
      timeline: feedback.events.map(event => ({
        action: event.action,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        createdAt: event.createdAt,
      })),
      messages: feedback.messages.map(message => ({
        body: sanitizePublicFeedbackText(message.body, feedback),
        authorName: message.authorName === 'Người dân' ? 'Người dân' : 'Đơn vị xử lý',
        createdAt: message.createdAt,
      })),
    };
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
        ...(actor.role === Role.VIEWER ? {} : {
          attachments: {
            orderBy: { createdAt: 'asc' },
            select: { id: true, originalName: true, mimeType: true, size: true, sha256: true, createdAt: true },
          },
        }),
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

  private assertPublicationEligible(feedback: {
    status: FeedbackStatus;
    closureReason: FeedbackClosureReason | null;
    reopenRequestedAt: Date | null;
  }) {
    if (feedback.reopenRequestedAt) {
      throw new ConflictException('Không thể công khai kết quả khi đề nghị xem xét lại đang chờ xử lý');
    }
    if (!hasStatus(feedback.status, FeedbackStatus.RESOLVED, FeedbackStatus.CLOSED)) {
      throw new ConflictException('Chỉ công khai phản ánh đã có kết quả xử lý');
    }
    if (feedback.closureReason !== FeedbackClosureReason.RESOLVED) {
      throw new ConflictException('Chỉ công khai hồ sơ có kết quả chuyên môn đã được duyệt');
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
    const updated = await this.prisma.$transaction(async tx => {
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
    return updated;
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
        include: {
          department: true,
          assignedTo: { select: { id: true, fullName: true, username: true } },
          _count: { select: { messages: true, attachments: true } },
        },
        // Hàng đợi mặc định phản ánh đúng thứ tự tiếp nhận: hồ sơ mới nhất
        // luôn ở trên cùng. Các trường hợp quá hạn/xem xét lại đã có bộ lọc
        // chuyên biệt, không nên âm thầm đảo thứ tự mà người dùng đã chọn.
        orderBy: [
          { createdAt: 'desc' },
          { id: 'desc' },
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

  @Get(':id/attachments/:attachmentId/download')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  async downloadAttachment(
    @Req() req: any,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const actor = getActor(req);
    const feedback = await this.findScoped(actor, id);
    this.assertCanHandle(actor, feedback);
    const attachment = await this.prisma.feedbackAttachment.findFirst({
      where: { id: attachmentId, feedbackId: feedback.id },
      select: { originalName: true, mimeType: true, size: true, data: true },
    });
    if (!attachment) throw new NotFoundException('Không tìm thấy tệp minh chứng');
    return sendAttachment({ ...attachment, data: Buffer.from(attachment.data) }, response);
  }

  @Get(':id/publication-preview')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async publicationPreview(
    @Req() req: any,
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'private, no-store');
    const actor = getActor(req);
    const feedback = await this.findScoped(actor, id);
    this.assertPublicationEligible(feedback);
    return {
      ...buildPublicFeedbackSnapshot(feedback),
      messages: feedback.messages
        .filter(message => message.visibility === FeedbackMessageVisibility.PUBLIC)
        .map(message => ({
          body: sanitizePublicFeedbackText(message.body, feedback),
          authorName: message.authorName === 'Người dân' ? 'Người dân' : 'Đơn vị xử lý',
          createdAt: message.createdAt,
        })),
    };
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
    const result = await this.prisma.$transaction(async tx => {
      const changed = await tx.feedback.updateMany({ where: { id, version: dto.expectedVersion }, data: { status: FeedbackStatus.WAITING_CITIZEN, firstResponseAt: feedback.firstResponseAt ?? now, waitingCitizenAt: now, citizenResponseDueAt, version: { increment: 1 } } });
      if (changed.count !== 1) throw new ConflictException('Hồ sơ vừa được cập nhật. Vui lòng tải lại.');
      await tx.feedbackMessage.create({ data: { feedbackId: id, body: dto.message.trim(), visibility: FeedbackMessageVisibility.PUBLIC, authorId: actor.id, authorName: actor.fullName } });
      await tx.feedbackEvent.create({ data: { feedbackId: id, action: 'INFORMATION_REQUESTED', fromStatus: feedback.status, toStatus: FeedbackStatus.WAITING_CITIZEN, actorId: actor.id, actorName: actor.fullName, note: dto.message.trim(), metadata: { citizenResponseDueAt: citizenResponseDueAt.toISOString(), emailPublicNote: sanitizePublicFeedbackText(dto.message, feedback) } } });
      await audit(tx, actor, { action: 'INFORMATION_REQUESTED', entityType: 'Feedback', entityId: id, departmentId: feedback.departmentId, metadata: { citizenResponseDueAt: citizenResponseDueAt.toISOString() } });
      return { success: true };
    });
    return result;
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
    const message = await this.prisma.$transaction(async tx => {
      const changed = await tx.feedback.updateMany({ where: { id, version: dto.expectedVersion }, data: { firstResponseAt: dto.visibility === FeedbackMessageVisibility.PUBLIC ? (feedback.firstResponseAt ?? new Date()) : feedback.firstResponseAt, version: { increment: 1 } } });
      if (changed.count !== 1) throw new ConflictException('Hồ sơ vừa được cập nhật. Vui lòng tải lại.');
      const message = await tx.feedbackMessage.create({ data: { feedbackId: id, body: dto.body.trim(), visibility: dto.visibility, authorId: actor.id, authorName: actor.fullName } });
      await tx.feedbackEvent.create({ data: { feedbackId: id, action: dto.visibility === FeedbackMessageVisibility.PUBLIC ? 'PUBLIC_MESSAGE_ADDED' : 'INTERNAL_NOTE_ADDED', fromStatus: feedback.status, toStatus: feedback.status, actorId: actor.id, actorName: actor.fullName, note: dto.visibility === FeedbackMessageVisibility.PUBLIC ? dto.body.trim() : null, metadata: dto.visibility === FeedbackMessageVisibility.PUBLIC ? { emailPublicNote: sanitizePublicFeedbackText(dto.body, feedback) } : undefined } });
      await audit(tx, actor, { action: 'FEEDBACK_MESSAGE_ADDED', entityType: 'Feedback', entityId: id, departmentId: feedback.departmentId, metadata: { visibility: dto.visibility } });
      return message;
    });
    return message;
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
    const updated = await this.prisma.$transaction(async tx => {
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
      await tx.feedbackEvent.create({ data: { feedbackId: id, action: next === FeedbackStatus.RESOLVED ? 'RESOLUTION_APPROVED' : 'RESOLUTION_RETURNED', fromStatus: feedback.status, toStatus: next, actorId: actor.id, actorName: actor.fullName, note: dto.note?.trim() || null, metadata: next === FeedbackStatus.RESOLVED && feedback.resolutionSummary ? { emailPublicNote: sanitizePublicFeedbackText(feedback.resolutionSummary, feedback) } : undefined } });
      await audit(tx, actor, { action: next === FeedbackStatus.RESOLVED ? 'RESOLUTION_APPROVED' : 'RESOLUTION_RETURNED', entityType: 'Feedback', entityId: id, departmentId: feedback.departmentId });
      return withoutSecret(await tx.feedback.findUniqueOrThrow({ where: { id }, include: { department: true, assignedTo: { select: { id: true, fullName: true, username: true } } } }));
    });
    return updated;
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
    const updated = await this.prisma.$transaction(async tx => {
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
    return updated;
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
    const updated = await this.prisma.$transaction(async tx => {
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
    return updated;
  }

  @Post(':id/publish')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async publish(@Req() req: any, @Param('id') id: string, @Body() dto: PublishFeedbackDto) {
    const actor = getActor(req);
    const feedback = await this.findScoped(actor, id);
    if (dto.publish) this.assertPublicationEligible(feedback);
    if (dto.publish && dto.confirmAnonymized !== true) throw new BadRequestException('Cần xác nhận đã kiểm tra và ẩn danh nội dung trước khi công khai');
    const snapshot = dto.publish ? buildPublicFeedbackSnapshot(feedback) : null;
    if (
      dto.publish
      && (
        !snapshot
        || snapshot.title.length < 3
        || snapshot.content.length < 10
        || !snapshot.resolutionSummary
        || snapshot.resolutionSummary.length < 10
      )
    ) {
      throw new BadRequestException('Nội dung phản ánh sau khi tự động ẩn thông tin cá nhân không còn đủ để công khai');
    }
    return this.prisma.$transaction(async tx => {
      const changed = await tx.feedback.updateMany({
        where: { id, version: dto.expectedVersion },
        data: {
          isPublic: dto.publish,
          ...(dto.publish ? {
            publicSnapshotVersion: 1,
            publicTitle: snapshot!.title,
            publicSummary: snapshot!.content,
            publicResolutionSummary: snapshot!.resolutionSummary,
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
            publicSnapshotVersion: 1,
            publicTitle: snapshot!.title,
            publicSummary: snapshot!.content,
            publicResolutionSummary: snapshot!.resolutionSummary,
            publicCategory: feedback.category,
            publicDepartmentName: feedback.department?.name ?? null,
            publicResolvedAt: feedback.resolvedAt?.toISOString() ?? null,
            anonymizationConfirmed: true,
            source: 'ORIGINAL_FEEDBACK_AUTOMATIC_REDACTION',
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
