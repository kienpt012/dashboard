import { randomUUID } from 'node:crypto';
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailOutboxStatus, Prisma } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { PrismaService } from './prisma.service';

export interface PasswordResetOtpMail {
  to: string;
  otp: string;
  expiresInMinutes: number;
}

export interface FeedbackProgressMail {
  to: string;
  code: string;
  status: string;
  action: string;
  departmentName?: string | null;
  publicNote?: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  RECEIVED: 'Đã tiếp nhận',
  ASSIGNED: 'Đã chuyển đơn vị xử lý',
  IN_PROGRESS: 'Đang xử lý',
  WAITING_CITIZEN: 'Chờ người dân bổ sung',
  PENDING_REVIEW: 'Chờ duyệt kết quả',
  RESOLVED: 'Đã có kết quả xử lý',
  CLOSED: 'Đã kết thúc',
  REJECTED: 'Đã kết thúc do không thuộc phạm vi tiếp nhận',
  REOPENED: 'Đã mở lại để xử lý',
};

const ACTION_DESCRIPTIONS: Record<string, string> = {
  CREATED: 'Phản ánh đã được hệ thống tiếp nhận.',
  FEEDBACK_ASSIGNED: 'Phản ánh đã được chuyển đến đơn vị phụ trách.',
  FEEDBACK_STARTED: 'Đơn vị phụ trách đã bắt đầu xử lý phản ánh.',
  INFORMATION_REQUESTED: 'Đơn vị xử lý cần bạn bổ sung thêm thông tin.',
  PUBLIC_MESSAGE_ADDED: 'Đơn vị xử lý vừa gửi một nội dung trao đổi mới.',
  FEEDBACK_SUBMITTED_FOR_REVIEW: 'Kết quả xử lý đang được kiểm tra trước khi ban hành.',
  RESOLUTION_APPROVED: 'Kết quả xử lý phản ánh đã được phê duyệt.',
  RESOLUTION_RETURNED: 'Kết quả đang được rà soát và hoàn thiện thêm.',
  FEEDBACK_CLOSED: 'Quy trình xử lý phản ánh đã kết thúc.',
  FEEDBACK_CLOSED_NO_RESPONSE: 'Hồ sơ đã kết thúc sau thời hạn bổ sung thông tin.',
  FEEDBACK_REJECTED: 'Hồ sơ đã kết thúc do không thuộc phạm vi tiếp nhận của kênh phản ánh.',
  FEEDBACK_REOPENED: 'Phản ánh đã được mở lại để tiếp tục xử lý.',
  CITIZEN_REOPEN_REQUEST_APPROVED: 'Đề nghị xem xét lại đã được chấp thuận.',
  CITIZEN_REOPEN_REQUEST_REJECTED: 'Đề nghị xem xét lại đã được phản hồi.',
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function parsePort(value?: string): number {
  const normalized = value?.trim() || '587';
  if (!/^\d+$/.test(normalized)) {
    throw new Error('SMTP_PORT must be an integer between 1 and 65535.');
  }
  const port = Number(normalized);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('SMTP_PORT must be an integer between 1 and 65535.');
  }
  return port;
}

function parseBoolean(name: string, value: string | undefined, fallback: boolean): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error(`${name} must be either "true" or "false".`);
}

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized === '::1'
    || normalized === '0.0.0.0'
    || normalized.startsWith('127.');
}

function resolvePublicAppUrl(value: string | undefined, smtpEnabled: boolean): string {
  const raw = value?.trim() || 'http://localhost:8080';
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('PUBLIC_APP_URL must be a valid absolute HTTP(S) URL.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('PUBLIC_APP_URL must be a valid absolute HTTP(S) URL without credentials.');
  }
  if (parsed.search || parsed.hash) {
    throw new Error('PUBLIC_APP_URL must not contain a query string or fragment.');
  }
  if (smtpEnabled && parsed.protocol !== 'https:' && !isLocalHostname(parsed.hostname)) {
    throw new Error('PUBLIC_APP_URL must use HTTPS when SMTP links point to a non-local hostname.');
  }
  return parsed.toString().replace(/\/+$/, '');
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;
  private readonly appUrl: string;

  constructor(config: ConfigService) {
    const host = config.get<string>('SMTP_HOST')?.trim() || '';
    const user = config.get<string>('SMTP_USER')?.trim() || '';
    const pass = config.get<string>('SMTP_PASS') || '';
    this.from = config.get<string>('SMTP_FROM')?.trim() || '';
    const smtpEnabled = Boolean(host || user || pass || this.from);
    const port = parsePort(config.get<string>('SMTP_PORT'));
    const secure = parseBoolean('SMTP_SECURE', config.get<string>('SMTP_SECURE'), false);
    const requireTls = parseBoolean(
      'SMTP_REQUIRE_TLS',
      config.get<string>('SMTP_REQUIRE_TLS'),
      !secure,
    );
    this.appUrl = resolvePublicAppUrl(
      config.get<string>('PUBLIC_APP_URL'),
      smtpEnabled,
    );

    if (!smtpEnabled) {
      this.transporter = null;
      return;
    }
    if (!host || !this.from) {
      throw new Error('SMTP configuration is incomplete: SMTP_HOST and SMTP_FROM are required.');
    }
    if (Boolean(user) !== Boolean(pass)) {
      throw new Error('SMTP configuration is incomplete: SMTP_USER and SMTP_PASS must be provided together.');
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      requireTLS: !secure && requireTls,
      ...(user && pass ? { auth: { user, pass } } : {}),
      tls: {
        minVersion: 'TLSv1.2',
      },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  }

  isConfigured(): boolean {
    return this.transporter !== null;
  }

  async sendPasswordResetOtp(message: PasswordResetOtpMail): Promise<void> {
    if (!this.transporter) {
      throw new Error('Password reset email service is not configured.');
    }
    try {
      await this.deliverPasswordResetOtp(message);
    } catch {
      // Không ghi địa chỉ người nhận, OTP, thông tin đăng nhập hay lỗi thô từ SMTP.
      this.logger.error('Không thể gửi email OTP khôi phục mật khẩu');
      throw new Error('Password reset email delivery failed.');
    }
  }

  async deliverFeedbackProgress(message: FeedbackProgressMail, feedbackEventId: string): Promise<void> {
    if (!this.transporter) {
      throw new Error('Feedback progress email service is not configured.');
    }
    try {
      await this.sendFeedbackProgress(message, feedbackEventId);
    } catch {
      // Không ghi địa chỉ người nhận, nội dung phản ánh hoặc lỗi thô từ SMTP.
      this.logger.error('Không thể gửi email cập nhật tiến độ phản ánh');
      throw new Error('Feedback progress email delivery failed.');
    }
  }

  private async deliverPasswordResetOtp(message: PasswordResetOtpMail): Promise<void> {
    if (!this.transporter) return;
    const resetUrl = `${this.appUrl}/admin/forgot-password`;
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: 'Mã xác thực khôi phục mật khẩu IOC Lái Thiêu',
      text: [
        'Bạn vừa yêu cầu khôi phục mật khẩu tài khoản nội bộ IOC Lái Thiêu.',
        `Mã xác thực: ${message.otp}`,
        `Mã có hiệu lực trong ${message.expiresInMinutes} phút và chỉ sử dụng được một lần.`,
        `Tiếp tục tại: ${resetUrl}`,
        'Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua email và thông báo cho quản trị viên.',
      ].join('\n\n'),
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#173633;line-height:1.6">
          <h2 style="color:#0f766e">Khôi phục mật khẩu IOC Lái Thiêu</h2>
          <p>Bạn vừa yêu cầu khôi phục mật khẩu tài khoản nội bộ.</p>
          <p style="font-size:30px;font-weight:800;letter-spacing:8px;background:#eef7f5;padding:18px;text-align:center;border-radius:10px">${escapeHtml(message.otp)}</p>
          <p>Mã có hiệu lực trong <strong>${message.expiresInMinutes} phút</strong> và chỉ sử dụng được một lần.</p>
          <p><a href="${escapeHtml(resetUrl)}" style="color:#0f766e;font-weight:700">Mở trang khôi phục mật khẩu</a></p>
          <p style="color:#657b77;font-size:13px">Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua email và thông báo cho quản trị viên.</p>
        </div>
      `,
    });
  }

  private async sendFeedbackProgress(message: FeedbackProgressMail, feedbackEventId: string): Promise<void> {
    if (!this.transporter) return;
    const trackingUrl = `${this.appUrl}/phan-anh`;
    const status = STATUS_LABELS[message.status] || 'Đang được cập nhật';
    const description = ACTION_DESCRIPTIONS[message.action] || 'Phản ánh có cập nhật mới trong quá trình xử lý.';
    const department = message.departmentName?.trim()
      ? `Đơn vị phụ trách: ${message.departmentName.trim()}`
      : '';
    const publicNote = message.publicNote?.trim() || '';

    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      // Cố định Message-ID theo sự kiện giúp máy chủ nhận nhận diện lần gửi lại
      // của cùng một thông báo; outbox vẫn bảo đảm chỉ có một hàng cho mỗi sự kiện.
      messageId: `<feedback-${feedbackEventId}@ioc-lai-thieu.local>`,
      subject: `[${message.code}] Cập nhật tiến độ phản ánh`,
      text: [
        `Mã phản ánh: ${message.code}`,
        `Trạng thái: ${status}`,
        description,
        department,
        publicNote ? `Nội dung trao đổi công khai: ${publicNote}` : '',
        `Tra cứu chi tiết tại: ${trackingUrl}`,
        'Vì lý do bảo mật, email này không chứa mã tra cứu. Vui lòng sử dụng mã tra cứu bạn đã lưu khi gửi phản ánh.',
      ].filter(Boolean).join('\n\n'),
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#173633;line-height:1.6">
          <h2 style="color:#0f766e">Cập nhật tiến độ phản ánh</h2>
          <p><strong>Mã phản ánh:</strong> ${escapeHtml(message.code)}</p>
          <p><strong>Trạng thái:</strong> ${escapeHtml(status)}</p>
          <p>${escapeHtml(description)}</p>
          ${department ? `<p>${escapeHtml(department)}</p>` : ''}
          ${publicNote ? `<div style="background:#f1f7f5;border-left:4px solid #0f766e;padding:12px 14px"><strong>Nội dung trao đổi công khai</strong><br>${escapeHtml(publicNote).replaceAll('\n', '<br>')}</div>` : ''}
          <p><a href="${escapeHtml(trackingUrl)}" style="color:#0f766e;font-weight:700">Tra cứu quá trình xử lý</a></p>
          <p style="color:#657b77;font-size:13px">Vì lý do bảo mật, email không chứa mã tra cứu. Hãy sử dụng mã bạn đã lưu khi gửi phản ánh.</p>
        </div>
      `,
    });
  }
}

type ClaimedOutboxMail = {
  feedbackEventId: string;
  payload: Prisma.JsonValue;
  attempts: number;
};

function parseBoundedInteger(
  name: string,
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const normalized = value?.trim();
  if (!normalized) return fallback;
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

function isPlainObject(value: Prisma.JsonValue): value is Prisma.JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validRequiredText(value: Prisma.JsonValue | undefined, maximum: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;
}

export function parseFeedbackProgressPayload(payload: Prisma.JsonValue): FeedbackProgressMail | null {
  if (!isPlainObject(payload)) return null;
  const to = payload.to;
  const code = payload.code;
  const status = payload.status;
  const action = payload.action;
  const departmentName = payload.departmentName;
  const publicNote = payload.publicNote;
  if (
    !validRequiredText(to, 320)
    || /[\r\n]/.test(to)
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)
    || !validRequiredText(code, 80)
    || /[\r\n]/.test(code)
    || !validRequiredText(status, 64)
    || /[\r\n]/.test(status)
    || !validRequiredText(action, 100)
    || /[\r\n]/.test(action)
    || (departmentName !== undefined && (typeof departmentName !== 'string' || departmentName.length > 300))
    || (publicNote !== undefined && (typeof publicNote !== 'string' || publicNote.length > 10_000))
  ) {
    return null;
  }
  return {
    to: to.trim().toLowerCase(),
    code: code.trim(),
    status: status.trim(),
    action: action.trim(),
    departmentName: typeof departmentName === 'string' ? departmentName : null,
    publicNote: typeof publicNote === 'string' ? publicNote : null,
  };
}

export function feedbackOutboxRetryDelayMs(attempt: number): number {
  const normalizedAttempt = Math.max(1, Math.floor(attempt));
  return Math.min(6 * 60 * 60 * 1_000, 30_000 * (2 ** (normalizedAttempt - 1)));
}

@Injectable()
export class FeedbackMailOutboxWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(FeedbackMailOutboxWorker.name);
  private readonly workerId = `${process.pid}-${randomUUID()}`;
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;
  private readonly maxAttempts: number;
  private timer: NodeJS.Timeout | null = null;
  private activeRun: Promise<number> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    config: ConfigService,
  ) {
    this.pollIntervalMs = parseBoundedInteger(
      'MAIL_OUTBOX_POLL_MS',
      config.get<string>('MAIL_OUTBOX_POLL_MS'),
      5_000,
      1_000,
      60_000,
    );
    this.batchSize = parseBoundedInteger(
      'MAIL_OUTBOX_BATCH_SIZE',
      config.get<string>('MAIL_OUTBOX_BATCH_SIZE'),
      10,
      1,
      50,
    );
    this.maxAttempts = parseBoundedInteger(
      'MAIL_OUTBOX_MAX_ATTEMPTS',
      config.get<string>('MAIL_OUTBOX_MAX_ATTEMPTS'),
      8,
      1,
      20,
    );
  }

  onApplicationBootstrap(): void {
    // Khi chưa cấu hình SMTP, giữ nguyên hàng PENDING để gửi sau khi cấu hình và
    // khởi động lại; không tiêu hao số lần thử cho một cấu hình chưa sẵn sàng.
    if (!this.mail.isConfigured()) return;
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
        // Không ghi lỗi DB/SMTP thô vì có thể chứa cấu hình hoặc dữ liệu cá nhân.
        this.logger.error('Không thể xử lý hàng đợi email phản ánh');
        return 0;
      })
      .finally(() => {
        this.activeRun = null;
      });
    return this.activeRun;
  }

  async processAvailable(): Promise<number> {
    if (!this.mail.isConfigured()) return 0;

    const staleLockBefore = new Date(Date.now() - 5 * 60 * 1_000);
    await this.prisma.mailOutbox.updateMany({
      where: {
        attempts: { gte: this.maxAttempts },
        OR: [
          { status: MailOutboxStatus.PENDING },
          { status: MailOutboxStatus.PROCESSING, lockedAt: { lt: staleLockBefore } },
        ],
      },
      data: {
        status: MailOutboxStatus.DEAD_LETTER,
        lockedAt: null,
        lockedBy: null,
        lastError: 'MAX_ATTEMPTS_EXCEEDED',
      },
    });

    const claimed = await this.prisma.$transaction(tx => tx.$queryRaw<ClaimedOutboxMail[]>(Prisma.sql`
      WITH candidates AS (
        SELECT "feedbackEventId"
        FROM "MailOutbox"
        WHERE "attempts" < ${this.maxAttempts}
          AND (
            ("status" = 'PENDING'::"MailOutboxStatus" AND "availableAt" <= CURRENT_TIMESTAMP)
            OR (
              "status" = 'PROCESSING'::"MailOutboxStatus"
              AND "lockedAt" < CURRENT_TIMESTAMP - INTERVAL '5 minutes'
            )
          )
        ORDER BY "availableAt" ASC, "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${this.batchSize}
      )
      UPDATE "MailOutbox" AS outbox
      SET
        "status" = 'PROCESSING'::"MailOutboxStatus",
        "attempts" = outbox."attempts" + 1,
        "lockedAt" = CURRENT_TIMESTAMP,
        "lockedBy" = ${this.workerId},
        "updatedAt" = CURRENT_TIMESTAMP
      FROM candidates
      WHERE outbox."feedbackEventId" = candidates."feedbackEventId"
      RETURNING outbox."feedbackEventId", outbox."payload", outbox."attempts"
    `));

    for (const row of claimed) {
      const message = parseFeedbackProgressPayload(row.payload);
      if (!message) {
        await this.markFailed(row, 'INVALID_OUTBOX_PAYLOAD');
        continue;
      }
      try {
        await this.mail.deliverFeedbackProgress(message, row.feedbackEventId);
        await this.prisma.mailOutbox.updateMany({
          where: {
            feedbackEventId: row.feedbackEventId,
            status: MailOutboxStatus.PROCESSING,
            lockedBy: this.workerId,
          },
          data: {
            status: MailOutboxStatus.SENT,
            // Xóa địa chỉ nhận và nội dung sau khi gửi để giảm lưu giữ PII.
            payload: { messageType: 'FEEDBACK_PROGRESS', delivered: true },
            sentAt: new Date(),
            lockedAt: null,
            lockedBy: null,
            lastError: null,
          },
        });
      } catch {
        await this.markFailed(row, 'SMTP_DELIVERY_FAILED');
      }
    }
    return claimed.length;
  }

  private async markFailed(row: ClaimedOutboxMail, errorCode: string): Promise<void> {
    const exhausted = row.attempts >= this.maxAttempts;
    await this.prisma.mailOutbox.updateMany({
      where: {
        feedbackEventId: row.feedbackEventId,
        status: MailOutboxStatus.PROCESSING,
        lockedBy: this.workerId,
      },
      data: {
        status: exhausted ? MailOutboxStatus.DEAD_LETTER : MailOutboxStatus.PENDING,
        availableAt: exhausted
          ? new Date()
          : new Date(Date.now() + feedbackOutboxRetryDelayMs(row.attempts)),
        lockedAt: null,
        lockedBy: null,
        lastError: exhausted ? `${errorCode}_MAX_ATTEMPTS` : errorCode,
      },
    });
    if (exhausted) {
      this.logger.error('Email tiến độ phản ánh đã chuyển vào dead-letter sau nhiều lần thử');
    } else {
      this.logger.warn('Email tiến độ phản ánh gửi lỗi và đã được lên lịch thử lại');
    }
  }
}
