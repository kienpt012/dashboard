import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { brandName, loadLocality } from './locality';
import { PrismaService } from './prisma.service';

// Kênh tin nhắn cho mã khôi phục mật khẩu (G-41). Hệ thống không gắn với nhà mạng nào: gọi một cổng SMS HTTP bất kỳ
// (đơn vị tự thuê) qua POST JSON. Chưa khai báo SMS_GATEWAY_URL thì kênh này tắt và giao diện không hiện lựa chọn.

const SEND_TIMEOUT_MS = 10_000;
const DEFAULT_BODY = '{"to":"{{to}}","message":"{{message}}"}';
// Không dấu để mọi máy và mọi nhà mạng đều hiển thị đúng, một tin không bị tách làm nhiều phần.
const DEFAULT_TEMPLATE = '{{brand}}: ma xac thuc dat lai mat khau la {{otp}}, co hieu luc {{minutes}} phut. Khong chia se ma nay cho bat ky ai.';

/** Chuẩn hoá số di động Việt Nam về dạng 10 chữ số bắt đầu bằng 0; trả null nếu không hợp lệ. */
export function normalizeVietnamPhone(value: string): string | null {
  const compact = value.replace(/[\s.\-()]/g, '');
  const national = compact.startsWith('+84')
    ? `0${compact.slice(3)}`
    : /^84\d{9}$/.test(compact) ? `0${compact.slice(2)}` : compact;
  return /^0[35789]\d{8}$/.test(national) ? national : null;
}

export function stripVietnameseMarks(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

const jsonText = (value: string) => JSON.stringify(value).slice(1, -1);

export interface PasswordResetOtpSms {
  to: string;
  otp: string;
  expiresInMinutes: number;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly url: URL | null;
  private readonly token: string;
  private readonly body: string;
  private readonly template: string;
  /** Lời gọi HTTP tới cổng tin nhắn; kiểm thử thay bằng cổng giả. */
  transport: typeof fetch = (input, init) => fetch(input, init);

  constructor(
    config: ConfigService,
    @Optional() private readonly prisma?: PrismaService,
  ) {
    const production = config.get<string>('NODE_ENV')?.trim().toLowerCase() === 'production';
    this.url = SmsService.parseUrl(config.get<string>('SMS_GATEWAY_URL'), production, this.logger);
    this.token = config.get<string>('SMS_GATEWAY_TOKEN')?.trim() ?? '';
    this.body = config.get<string>('SMS_GATEWAY_BODY')?.trim() || DEFAULT_BODY;
    this.template = config.get<string>('SMS_OTP_TEMPLATE')?.trim() || DEFAULT_TEMPLATE;
    if (this.url && (!this.body.includes('{{to}}') || !this.body.includes('{{message}}'))) {
      this.logger.error('SMS_GATEWAY_BODY phải chứa {{to}} và {{message}}; kênh tin nhắn bị tắt');
      this.url = null;
    }
    if (this.url && !this.template.includes('{{otp}}')) {
      this.logger.error('SMS_OTP_TEMPLATE phải chứa {{otp}}; kênh tin nhắn bị tắt');
      this.url = null;
    }
  }

  private static parseUrl(raw: string | undefined, production: boolean, logger: Logger): URL | null {
    const value = raw?.trim();
    if (!value) return null;
    try {
      const url = new URL(value);
      const allowed = url.protocol === 'https:' || (!production && url.protocol === 'http:');
      if (!allowed || url.username || url.password) throw new Error('unsupported');
      return url;
    } catch {
      logger.error('SMS_GATEWAY_URL không hợp lệ (cần https, không kèm tài khoản trong địa chỉ); kênh tin nhắn bị tắt');
      return null;
    }
  }

  isConfigured(): boolean {
    return this.url !== null;
  }

  async sendPasswordResetOtp(message: PasswordResetOtpSms): Promise<void> {
    if (!this.url) throw new Error('SMS gateway is not configured.');
    try {
      const text = this.template
        .replaceAll('{{brand}}', stripVietnameseMarks(await this.brand()))
        .replaceAll('{{otp}}', message.otp)
        .replaceAll('{{minutes}}', String(message.expiresInMinutes));
      const response = await this.transport(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
        body: this.body.replaceAll('{{to}}', jsonText(message.to)).replaceAll('{{message}}', jsonText(text)),
        redirect: 'error',
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch {
      // Không ghi số điện thoại, mã xác thực hay phản hồi thô của cổng tin nhắn.
      this.logger.error('Không thể gửi tin nhắn mã khôi phục mật khẩu');
      throw new Error('Password reset SMS delivery failed.');
    }
  }

  private async brand(): Promise<string> {
    if (!this.prisma) return 'IOC';
    try {
      return brandName(await loadLocality(this.prisma));
    } catch {
      return 'IOC';
    }
  }
}
