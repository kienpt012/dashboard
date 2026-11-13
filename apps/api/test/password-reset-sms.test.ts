import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { HttpException } from '@nestjs/common';
import { AuthController, PASSWORD_RESET_REQUEST_MESSAGE, PASSWORD_RESET_SMS_REQUEST_MESSAGE } from '../src/auth';
import { PasswordResetDeliveryRegistry } from '../src/password-reset-delivery';
import { RateLimitService } from '../src/rate-limit';
import { SmsService, normalizeVietnamPhone, stripVietnameseMarks } from '../src/sms';

const SECRET = 'reset-secret-that-is-longer-than-thirty-two-characters';

function config(values: Record<string, string | undefined> = {}) {
  return { get: (key: string) => ({ PASSWORD_RESET_PEPPER: SECRET, JWT_SECRET: 'jwt-secret-that-is-longer-than-thirty-two-characters', ...values }[key]) };
}

function harness(options: { user?: Record<string, unknown> | null; smsReady?: boolean; mailReady?: boolean; rateLimit?: unknown } = {}) {
  const sent: { channel: string; to: string; otp: string }[] = [];
  const challenges: Record<string, unknown>[] = [];
  const tx = {
    passwordResetChallenge: {
      findFirst: async () => null,
      updateMany: async () => ({ count: 0 }),
      create: async ({ data }: { data: Record<string, unknown> }) => { challenges.push(data); return data; },
    },
  };
  const prisma = {
    user: { findFirst: async () => options.user === undefined ? { id: 'u1', username: 'thao.ktht', email: 'thao@example.gov.vn', phone: '0912345678', isActive: true } : options.user },
    passwordResetChallenge: { updateMany: async () => ({ count: 0 }) },
    $transaction: async (run: (client: typeof tx) => Promise<unknown>) => run(tx),
  };
  const mail = { isConfigured: () => options.mailReady ?? true, sendPasswordResetOtp: async (m: { to: string; otp: string }) => { sent.push({ channel: 'EMAIL', to: m.to, otp: m.otp }); } };
  const sms = { isConfigured: () => options.smsReady ?? true, sendPasswordResetOtp: async (m: { to: string; otp: string }) => { sent.push({ channel: 'SMS', to: m.to, otp: m.otp }); } };
  const rateLimit = options.rateLimit ?? { consume: () => undefined, reset: () => undefined };
  const controller = new AuthController(prisma as never, { signAsync: async () => 'jwt' } as never, rateLimit as never, config() as never, mail as never, new PasswordResetDeliveryRegistry(), sms as never);
  return { controller, sent, challenges };
}

const req = { ip: '203.0.113.9', headers: {}, socket: { remoteAddress: '203.0.113.9' } };

test('số di động Việt Nam được chuẩn hoá về dạng 0xxxxxxxxx, số sai bị loại', () => {
  assert.equal(normalizeVietnamPhone('0912 345 678'), '0912345678');
  assert.equal(normalizeVietnamPhone('+84 912.345.678'), '0912345678');
  assert.equal(normalizeVietnamPhone('84912345678'), '0912345678');
  assert.equal(normalizeVietnamPhone('(091) 234-5678'), '0912345678');
  for (const bad of ['', '12345', '0212345678', '09123456789', '+1 202 555 0100', 'abc0912345678']) assert.equal(normalizeVietnamPhone(bad), null, bad);
  assert.equal(stripVietnameseMarks('IOC Lái Thiêu – Đặt lại'), 'IOC Lai Thieu – Dat lai');
});

test('kênh tin nhắn tắt khi chưa khai báo cổng hoặc khai báo sai', () => {
  assert.equal(new SmsService(config() as never).isConfigured(), false);
  assert.equal(new SmsService(config({ SMS_GATEWAY_URL: 'https://sms.example.vn/send' }) as never).isConfigured(), true);
  assert.equal(new SmsService(config({ SMS_GATEWAY_URL: 'http://sms.example.vn/send', NODE_ENV: 'production' }) as never).isConfigured(), false);
  assert.equal(new SmsService(config({ SMS_GATEWAY_URL: 'https://user:pass@sms.example.vn/send' }) as never).isConfigured(), false);
  assert.equal(new SmsService(config({ SMS_GATEWAY_URL: 'https://sms.example.vn/send', SMS_GATEWAY_BODY: '{"phone":"{{to}}"}' }) as never).isConfigured(), false);
  assert.equal(new SmsService(config({ SMS_GATEWAY_URL: 'https://sms.example.vn/send', SMS_OTP_TEMPLATE: 'Ma cua ban' }) as never).isConfigured(), false);
});

test('gửi mã qua cổng tin nhắn: đúng địa chỉ, khoá truy cập, nội dung không dấu; lỗi cổng không lộ chi tiết', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const service = new SmsService(config({ SMS_GATEWAY_URL: 'https://sms.example.vn/send', SMS_GATEWAY_TOKEN: 'khoa-thu', SMS_GATEWAY_BODY: '{"phone":"{{to}}","text":"{{message}}","brand":"IOC"}' }) as never);
  service.transport = (async (url: URL, init: RequestInit) => { calls.push({ url: String(url), init }); return { ok: true, status: 200 }; }) as never;
  await service.sendPasswordResetOtp({ to: '0912345678', otp: '482913', expiresInMinutes: 10 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://sms.example.vn/send');
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, 'Bearer khoa-thu');
  const body = JSON.parse(String(calls[0].init.body));
  assert.equal(body.phone, '0912345678');
  assert.match(body.text, /482913/);
  assert.match(body.text, /10 phut/);
  assert.doesNotMatch(body.text, /[^\x20-\x7e]/);
  assert.equal(calls[0].init.redirect, 'error');

  service.transport = (async () => ({ ok: false, status: 500 })) as never;
  await assert.rejects(service.sendPasswordResetOtp({ to: '0912345678', otp: '482913', expiresInMinutes: 10 }), (error: Error) => !/0912345678|482913|500/.test(error.message));
});

test('yêu cầu mã qua tin nhắn gửi tới số điện thoại của tài khoản, không gửi thư', async () => {
  const { controller, sent, challenges } = harness();
  const result = await controller.requestPasswordReset({ identifier: 'thao.ktht', channel: 'SMS' }, req);
  assert.equal(result.message, PASSWORD_RESET_SMS_REQUEST_MESSAGE);
  assert.deepEqual(sent.map(item => [item.channel, item.to]), [['SMS', '0912345678']]);
  assert.match(sent[0].otp, /^\d{6}$/);
  assert.equal(challenges.length, 1);
});

test('không chọn kênh thì vẫn gửi thư như trước', async () => {
  const { controller, sent } = harness();
  const result = await controller.requestPasswordReset({ identifier: 'thao.ktht' }, req);
  assert.equal(result.message, PASSWORD_RESET_REQUEST_MESSAGE);
  assert.deepEqual(sent.map(item => [item.channel, item.to]), [['EMAIL', 'thao@example.gov.vn']]);
});

test('tài khoản không có số điện thoại hoặc không tồn tại: cùng một câu trả lời, không gửi gì, không tạo mã', async () => {
  for (const user of [null, { id: 'u2', username: 'khoi', email: 'khoi@example.gov.vn', phone: null, isActive: true }]) {
    const { controller, sent, challenges } = harness({ user });
    const result = await controller.requestPasswordReset({ identifier: 'khoi', channel: 'SMS' }, req);
    assert.equal(result.message, PASSWORD_RESET_SMS_REQUEST_MESSAGE);
    assert.equal(sent.length, 0);
    assert.equal(challenges.length, 0);
  }
});

test('chưa cấu hình cổng tin nhắn: báo lỗi chung trước khi tra tài khoản; danh sách kênh phản ánh đúng', async () => {
  const { controller, sent } = harness({ smsReady: false });
  await assert.rejects(controller.requestPasswordReset({ identifier: 'thao.ktht', channel: 'SMS' }, req), (error: HttpException) => error.getStatus() === 503);
  assert.equal(sent.length, 0);
  assert.deepEqual(controller.passwordResetChannels(), { email: true, sms: false });
  assert.deepEqual(harness({ mailReady: false }).controller.passwordResetChannels(), { email: false, sms: true });
});

test('mỗi tài khoản tối đa 5 yêu cầu tin nhắn mỗi giờ; kênh thư không bị tính vào trần này', async () => {
  const limiter = new RateLimitService();
  const consumed: string[] = [];
  const rateLimit = {
    consume: (scope: string, key: string, options: { limit: number; windowMs: number; message: string }) => {
      consumed.push(scope);
      // Chỉ kiểm tra trần riêng của tin nhắn; các trần khác đã có kiểm thử riêng.
      if (scope === 'auth-password-reset-sms-account') limiter.consume(scope, key, options);
    },
    reset: () => undefined,
  };
  const { controller } = harness({ rateLimit });
  for (let index = 0; index < 5; index += 1) await controller.requestPasswordReset({ identifier: 'thao.ktht', channel: 'SMS' }, req);
  await assert.rejects(controller.requestPasswordReset({ identifier: 'Thao.KTHT ', channel: 'SMS' }, req), (error: HttpException) => error.getStatus() === 429);
  const before = consumed.filter(scope => scope === 'auth-password-reset-sms-account').length;
  await controller.requestPasswordReset({ identifier: 'thao.ktht' }, req);
  assert.equal(consumed.filter(scope => scope === 'auth-password-reset-sms-account').length, before);
});
