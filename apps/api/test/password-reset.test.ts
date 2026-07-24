import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import {
  AuthController,
  hashPasswordResetValue,
  PASSWORD_RESET_REQUEST_MESSAGE,
  PasswordResetCompleteDto,
  PasswordResetVerifyDto,
} from '../src/auth';
import { PasswordResetDeliveryRegistry } from '../src/password-reset-delivery';

const resetSecret = 'reset-secret-that-is-longer-than-thirty-two-characters';

function dependencies(overrides: Record<string, any> = {}) {
  const prisma = overrides.prisma || {};
  const jwt = overrides.jwt || { signAsync: async () => 'jwt' };
  const rateLimit = overrides.rateLimit || {
    consume: () => undefined,
    reset: () => undefined,
  };
  const config = overrides.config || {
    get: (key: string) => ({
      PASSWORD_RESET_PEPPER: resetSecret,
      JWT_SECRET: 'jwt-secret-that-is-longer-than-thirty-two-characters',
    }[key]),
  };
  const mail = overrides.mail || {
    isConfigured: () => true,
    sendPasswordResetOtp: async () => undefined,
    queueFeedbackProgress: () => undefined,
  };
  const passwordResetDeliveries = overrides.passwordResetDeliveries
    || new PasswordResetDeliveryRegistry();
  return {
    controller: new AuthController(
      prisma as any,
      jwt as any,
      rateLimit as any,
      config as any,
      mail as any,
      passwordResetDeliveries as any,
    ),
    prisma,
    rateLimit,
    mail,
    passwordResetDeliveries,
  };
}

function resetUser(passwordHash = 'old-hash') {
  return {
    id: 'user-1',
    username: 'manager.vhxh',
    passwordHash,
    fullName: 'Nguyễn Văn A',
    email: 'manager@laithieu.gov.vn',
    role: Role.MANAGER,
    isActive: true,
    departmentId: 'department-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: null,
    tokenVersion: 4,
    version: 2,
  };
}

test('DTO khôi phục yêu cầu OTP 6 số và mật khẩu mạnh', () => {
  const invalidOtp = validateSync(plainToInstance(PasswordResetVerifyDto, {
    identifier: 'manager.vhxh',
    otp: '12345a',
  }));
  assert.ok(invalidOtp.some(error => error.property === 'otp'));

  const weakPassword = validateSync(plainToInstance(PasswordResetCompleteDto, {
    resetToken: 'a'.repeat(43),
    newPassword: 'password123',
  }));
  assert.ok(weakPassword.some(error => error.property === 'newPassword'));

  const valid = validateSync(plainToInstance(PasswordResetCompleteDto, {
    resetToken: 'a'.repeat(43),
    newPassword: 'MatKhau@2026!',
  }));
  assert.deepEqual(valid, []);
});

test('yêu cầu khôi phục luôn trả thông báo chung và không tạo dữ liệu cho tài khoản không tồn tại', async () => {
  let transactionCalled = false;
  const prisma = {
    user: { findFirst: async () => null },
    $transaction: async () => { transactionCalled = true; },
  };
  const { controller } = dependencies({ prisma });
  const response = await controller.requestPasswordReset(
    { identifier: 'khong-ton-tai' },
    { ip: '127.0.0.1' },
  );

  assert.equal(response.message, PASSWORD_RESET_REQUEST_MESSAGE);
  assert.equal(transactionCalled, false);
});

test('SMTP chưa cấu hình trả cùng lỗi hệ thống trước khi tra cứu tài khoản', async () => {
  let lookupCalled = false;
  const prisma = {
    user: { findFirst: async () => { lookupCalled = true; return resetUser(); } },
  };
  const { controller } = dependencies({
    prisma,
    mail: {
      isConfigured: () => false,
      sendPasswordResetOtp: async () => undefined,
    },
  });

  await assert.rejects(
    controller.requestPasswordReset(
      { identifier: 'manager.vhxh' },
      { ip: '127.0.0.1' },
    ),
    (error: unknown) => error instanceof ServiceUnavailableException,
  );
  assert.equal(lookupCalled, false);
});

test('pepper không an toàn bị từ chối trước khi tra cứu định danh', async () => {
  let lookupCalled = false;
  const prisma = {
    user: {
      findFirst: async () => {
        lookupCalled = true;
        return null;
      },
    },
  };
  const { controller } = dependencies({
    prisma,
    config: {
      get: (key: string) => ({
        PASSWORD_RESET_PEPPER: 'too-short',
        JWT_SECRET: 'jwt-secret-that-is-longer-than-thirty-two-characters',
      }[key]),
    },
  });

  await assert.rejects(
    controller.requestPasswordReset(
      { identifier: 'khong-ton-tai' },
      { ip: '127.0.0.1' },
    ),
    (error: unknown) => error instanceof ServiceUnavailableException,
  );
  assert.equal(lookupCalled, false);
});

test('tra cứu tên đăng nhập và email không phân biệt hoa thường', async () => {
  let capturedWhere: Record<string, any> | null = null;
  const prisma = {
    user: {
      findFirst: async ({ where }: Record<string, any>) => {
        capturedWhere = where;
        return null;
      },
    },
  };
  const { controller } = dependencies({ prisma });

  const response = await controller.requestPasswordReset(
    { identifier: 'Manager@LaiThieu.Gov.Vn' },
    { ip: '127.0.0.1' },
  );

  const where = capturedWhere as unknown as Record<string, any>;
  assert.equal(response.message, PASSWORD_RESET_REQUEST_MESSAGE);
  assert.deepEqual(where.OR, [
    { username: { equals: 'manager@laithieu.gov.vn', mode: 'insensitive' } },
    { email: { equals: 'manager@laithieu.gov.vn', mode: 'insensitive' } },
  ]);
});

test('OTP chỉ được lưu dưới dạng HMAC và yêu cầu mới vô hiệu hóa mã cũ', async () => {
  const user = resetUser();
  let consumedOld = false;
  let challengeData: Record<string, any> | null = null;
  let queued: Record<string, any> | null = null;
  const prisma = {
    user: { findFirst: async () => user },
    $transaction: async (callback: (tx: any) => Promise<unknown>) => callback({
      passwordResetChallenge: {
        findFirst: async () => null,
        updateMany: async () => { consumedOld = true; return { count: 1 }; },
        create: async ({ data }: any) => { challengeData = data; return data; },
      },
    }),
  };
  const { controller } = dependencies({
    prisma,
    mail: {
      isConfigured: () => true,
      sendPasswordResetOtp: async (message: Record<string, any>) => { queued = message; },
    },
  });

  const response = await controller.requestPasswordReset(
    { identifier: user.username },
    { ip: '127.0.0.1' },
  );

  assert.equal(response.message, PASSWORD_RESET_REQUEST_MESSAGE);
  assert.equal(consumedOld, true);
  const deliveredMail = queued as unknown as Record<string, any>;
  const storedChallenge = challengeData as unknown as Record<string, any>;
  assert.equal(typeof deliveredMail.otp, 'string');
  assert.match(deliveredMail.otp, /^\d{6}$/);
  assert.equal(
    storedChallenge.otpHash,
    hashPasswordResetValue(resetSecret, storedChallenge.id, deliveredMail.otp),
  );
  assert.equal(JSON.stringify(storedChallenge).includes(deliveredMail.otp), false);
});

test('lỗi gửi SMTP tiêu thụ mã vừa tạo nhưng vẫn trả thông báo chung', async () => {
  const user = resetUser();
  let createdChallengeId = '';
  let invalidatedChallenge: Record<string, any> | null = null;
  const prisma = {
    user: { findFirst: async () => user },
    passwordResetChallenge: {
      updateMany: async (args: Record<string, any>) => {
        invalidatedChallenge = args;
        return { count: 1 };
      },
    },
    $transaction: async (callback: (tx: any) => Promise<unknown>) => callback({
      passwordResetChallenge: {
        findFirst: async () => null,
        updateMany: async () => ({ count: 0 }),
        create: async ({ data }: Record<string, any>) => {
          createdChallengeId = data.id;
          return data;
        },
      },
    }),
  };
  const { controller } = dependencies({
    prisma,
    mail: {
      isConfigured: () => true,
      sendPasswordResetOtp: async () => {
        throw new Error('runtime SMTP failure with private detail');
      },
    },
  });

  const response = await controller.requestPasswordReset(
    { identifier: user.email },
    { ip: '127.0.0.1' },
  );

  const invalidation = invalidatedChallenge as unknown as Record<string, any>;
  assert.equal(response.message, PASSWORD_RESET_REQUEST_MESSAGE);
  assert.equal(invalidation.where.id, createdChallengeId);
  assert.equal(invalidation.where.consumedAt, null);
  assert.ok(invalidation.data.consumedAt instanceof Date);
});

test('cooldown trong cơ sở dữ liệu không tạo hoặc gửi thêm OTP đang còn mới', async () => {
  const user = resetUser();
  let createCalled = false;
  let sendCalled = false;
  const prisma = {
    user: { findFirst: async () => user },
    $transaction: async (callback: (tx: any) => Promise<unknown>) => callback({
      passwordResetChallenge: {
        findFirst: async () => ({ id: 'recent-active-challenge' }),
        updateMany: async () => ({ count: 0 }),
        create: async () => {
          createCalled = true;
        },
      },
    }),
  };
  const { controller } = dependencies({
    prisma,
    mail: {
      isConfigured: () => true,
      sendPasswordResetOtp: async () => {
        sendCalled = true;
      },
    },
  });

  const response = await controller.requestPasswordReset(
    { identifier: user.username },
    { ip: '127.0.0.1' },
  );

  assert.equal(response.message, PASSWORD_RESET_REQUEST_MESSAGE);
  assert.equal(createCalled, false);
  assert.equal(sendCalled, false);
});

test('xung đột Serializable được thử lại rồi áp dụng cooldown, không gửi hai mã', async () => {
  const user = resetUser();
  let transactionCalls = 0;
  let sendCalled = false;
  const prisma = {
    user: { findFirst: async () => user },
    $transaction: async (
      callback: (tx: any) => Promise<unknown>,
      options: Record<string, any>,
    ) => {
      transactionCalls += 1;
      assert.equal(options.isolationLevel, 'Serializable');
      if (transactionCalls === 1) throw { code: 'P2034' };
      return callback({
        passwordResetChallenge: {
          findFirst: async () => ({ id: 'concurrently-created-challenge' }),
          updateMany: async () => ({ count: 0 }),
          create: async () => undefined,
        },
      });
    },
  };
  const { controller } = dependencies({
    prisma,
    mail: {
      isConfigured: () => true,
      sendPasswordResetOtp: async () => {
        sendCalled = true;
      },
    },
  });

  const response = await controller.requestPasswordReset(
    { identifier: user.username },
    { ip: '127.0.0.1' },
  );

  assert.equal(response.message, PASSWORD_RESET_REQUEST_MESSAGE);
  assert.equal(transactionCalls, 2);
  assert.equal(sendCalled, false);
});

test('mã OTP sai tăng số lần thử nhưng không cấp reset token', async () => {
  const user = resetUser();
  const challenge = {
    id: 'challenge-1',
    userId: user.id,
    otpHash: hashPasswordResetValue(resetSecret, 'challenge-1', '123456'),
    expiresAt: new Date(Date.now() + 60_000),
    attempts: 1,
    maxAttempts: 5,
    verifiedAt: null,
    resetTokenHash: null,
    resetTokenExpiresAt: null,
    consumedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  let failedUpdate: Record<string, any> | null = null;
  const prisma = {
    user: { findFirst: async () => user },
    passwordResetChallenge: {
      findFirst: async () => challenge,
      updateMany: async (args: Record<string, any>) => {
        failedUpdate = args;
        return { count: 1 };
      },
    },
  };
  const { controller } = dependencies({ prisma });

  await assert.rejects(
    controller.verifyPasswordResetOtp(
      { identifier: user.username, otp: '999999' },
      { ip: '127.0.0.1' },
    ),
    (error: unknown) => error instanceof BadRequestException,
  );
  const failedAttemptUpdate = failedUpdate as unknown as Record<string, any>;
  assert.deepEqual(failedAttemptUpdate.data.attempts, { increment: 1 });
  assert.equal(failedAttemptUpdate.data.resetTokenHash, undefined);
});

test('OTP đúng cấp token ngắn hạn; hoàn tất sẽ tiêu thụ token, đổi mật khẩu và thu hồi phiên cũ', async () => {
  const oldPasswordHash = await bcrypt.hash('OldPassword@2025', 4);
  const user = resetUser(oldPasswordHash);
  const challengeId = 'challenge-valid';
  const otp = '456789';
  const challenge = {
    id: challengeId,
    userId: user.id,
    otpHash: hashPasswordResetValue(resetSecret, challengeId, otp),
    expiresAt: new Date(Date.now() + 60_000),
    attempts: 0,
    maxAttempts: 5,
    verifiedAt: null,
    resetTokenHash: null,
    resetTokenExpiresAt: null,
    consumedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  let verificationUpdate: Record<string, any> | null = null;
  const verifyPrisma = {
    user: { findFirst: async () => user },
    passwordResetChallenge: {
      findFirst: async () => challenge,
      updateMany: async (args: Record<string, any>) => {
        verificationUpdate = args;
        return { count: 1 };
      },
    },
  };
  const verify = dependencies({ prisma: verifyPrisma });
  const verified = await verify.controller.verifyPasswordResetOtp(
    { identifier: user.username, otp },
    { ip: '127.0.0.1' },
  );

  assert.match(verified.resetToken, /^[A-Za-z0-9_-]{43}$/);
  const storedVerification = verificationUpdate as unknown as Record<string, any>;
  assert.equal(
    storedVerification.data.resetTokenHash,
    hashPasswordResetValue(resetSecret, 'reset-token', verified.resetToken),
  );
  assert.equal(storedVerification.data.resetTokenHash.includes(verified.resetToken), false);

  const verifiedChallenge = {
    ...challenge,
    verifiedAt: new Date(),
    resetTokenHash: storedVerification.data.resetTokenHash,
    resetTokenExpiresAt: new Date(Date.now() + 60_000),
    user,
  };
  const challengeUpdates: Record<string, any>[] = [];
  let userUpdate: Record<string, any> | null = null;
  let auditData: Record<string, any> | null = null;
  const completePrisma = {
    passwordResetChallenge: {
      findUnique: async () => verifiedChallenge,
    },
    $transaction: async (callback: (tx: any) => Promise<unknown>) => callback({
      passwordResetChallenge: {
        updateMany: async (args: Record<string, any>) => {
          challengeUpdates.push(args);
          return { count: 1 };
        },
      },
      user: {
        updateMany: async (args: Record<string, any>) => {
          userUpdate = args;
          return { count: 1 };
        },
      },
      auditLog: {
        create: async ({ data }: any) => { auditData = data; return data; },
      },
    }),
  };
  const complete = dependencies({ prisma: completePrisma });
  const response = await complete.controller.completePasswordReset(
    { resetToken: verified.resetToken, newPassword: 'MatKhauMoi@2026!' },
    { ip: '127.0.0.1' },
  );

  assert.match(response.message, /phiên đăng nhập cũ/i);
  assert.equal(challengeUpdates[0].data.resetTokenHash, null);
  const storedUserUpdate = userUpdate as unknown as Record<string, any>;
  const storedAudit = auditData as unknown as Record<string, any>;
  assert.deepEqual(storedUserUpdate.data.tokenVersion, { increment: 1 });
  assert.equal(await bcrypt.compare('MatKhauMoi@2026!', storedUserUpdate.data.passwordHash), true);
  assert.equal(storedAudit.action, 'PASSWORD_RESET_COMPLETED');
  const serializedAudit = JSON.stringify(auditData);
  assert.equal(serializedAudit.includes(verified.resetToken), false);
  assert.equal(serializedAudit.includes('MatKhauMoi@2026!'), false);
});
