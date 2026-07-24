import assert from 'node:assert/strict';
import test from 'node:test';
import { MailService } from '../src/mail';

function config(values: Record<string, string | undefined> = {}) {
  return {
    get: (key: string) => values[key],
  } as any;
}

test('SMTP hoàn toàn để trống không làm ứng dụng lỗi khi khởi động', () => {
  const mail = new MailService(config());
  assert.equal(mail.isConfigured(), false);
});

test('SMTP khai báo một phần bị từ chối ngay khi khởi động', () => {
  assert.throws(
    () => new MailService(config({ SMTP_HOST: 'smtp.example.gov.vn' })),
    /SMTP_HOST and SMTP_FROM are required/,
  );
  assert.throws(
    () => new MailService(config({
      SMTP_HOST: 'smtp.example.gov.vn',
      SMTP_FROM: 'IOC <ioc@example.gov.vn>',
      SMTP_USER: 'ioc@example.gov.vn',
    })),
    /SMTP_USER and SMTP_PASS must be provided together/,
  );
});

test('SMTP_PORT và các cờ boolean phải có định dạng nghiêm ngặt', () => {
  assert.throws(
    () => new MailService(config({ SMTP_PORT: 'not-a-port' })),
    /SMTP_PORT must be an integer/,
  );
  assert.throws(
    () => new MailService(config({ SMTP_PORT: '70000' })),
    /SMTP_PORT must be an integer/,
  );
  assert.throws(
    () => new MailService(config({ SMTP_SECURE: 'yes' })),
    /SMTP_SECURE must be either "true" or "false"/,
  );
  assert.throws(
    () => new MailService(config({ SMTP_REQUIRE_TLS: 'enabled' })),
    /SMTP_REQUIRE_TLS must be either "true" or "false"/,
  );
});

test('PUBLIC_APP_URL phải hợp lệ; cho phép localhost nhưng bắt buộc HTTPS với máy chủ từ xa', () => {
  assert.throws(
    () => new MailService(config({ PUBLIC_APP_URL: 'not-an-url' })),
    /PUBLIC_APP_URL must be a valid absolute HTTP\(S\) URL/,
  );
  assert.equal(new MailService(config({
    NODE_ENV: 'production',
    SMTP_HOST: 'smtp.example.gov.vn',
    SMTP_FROM: 'ioc@example.gov.vn',
    PUBLIC_APP_URL: 'http://127.0.0.1:8080',
  })).isConfigured(), true);
  assert.throws(() => new MailService(config({
    SMTP_HOST: 'smtp.example.gov.vn',
    SMTP_FROM: 'ioc@example.gov.vn',
    PUBLIC_APP_URL: 'http://ioc.example.gov.vn',
  })), /must use HTTPS/);
});

test('SMTP không secure mặc định bắt buộc STARTTLS và TLS từ phiên bản 1.2', () => {
  const mail = new MailService(config({
    SMTP_HOST: 'smtp.example.gov.vn',
    SMTP_PORT: '587',
    SMTP_SECURE: 'false',
    SMTP_FROM: 'IOC <ioc@example.gov.vn>',
    PUBLIC_APP_URL: 'https://ioc.example.gov.vn',
    NODE_ENV: 'production',
  }));

  assert.equal(mail.isConfigured(), true);
  const options = (mail as any).transporter.options;
  assert.equal(options.port, 587);
  assert.equal(options.secure, false);
  assert.equal(options.requireTLS, true);
  assert.equal(options.tls.minVersion, 'TLSv1.2');
});

test('SMTP_REQUIRE_TLS có thể tắt rõ ràng khi máy chủ nội bộ không hỗ trợ STARTTLS', () => {
  const mail = new MailService(config({
    SMTP_HOST: 'smtp.internal.example.gov.vn',
    SMTP_REQUIRE_TLS: 'false',
    SMTP_FROM: 'ioc@example.gov.vn',
    PUBLIC_APP_URL: 'https://ioc.example.gov.vn',
  }));

  const options = (mail as any).transporter.options;
  assert.equal(options.requireTLS, false);
});
