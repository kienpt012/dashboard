import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuthController, hashPasswordResetValue } from '../src/auth';
import { PasswordResetDeliveryRegistry } from '../src/password-reset-delivery';
import { UpdateUserDto, UsersController } from '../src/users';

const resetSecret = 'reset-secret-that-is-longer-than-thirty-two-characters';

function rateLimit() {
  return {
    consume: () => undefined,
    reset: () => undefined,
  };
}

function authController(prisma: Record<string, any>) {
  return new AuthController(
    prisma as any,
    { signAsync: async () => 'new-jwt' } as any,
    rateLimit() as any,
    {
      get: (key: string) => ({
        PASSWORD_RESET_PEPPER: resetSecret,
        JWT_SECRET: 'jwt-secret-that-is-longer-than-thirty-two-characters',
      }[key]),
    } as any,
    {
      isConfigured: () => true,
      sendPasswordResetOtp: async () => undefined,
    } as any,
    new PasswordResetDeliveryRegistry(),
  );
}

function userActor(overrides: Record<string, any> = {}) {
  return {
    id: 'user-1',
    username: 'manager.vhxh',
    fullName: 'Nguyễn Văn A',
    email: 'manager@laithieu.gov.vn',
    role: Role.MANAGER,
    isActive: true,
    departmentId: 'department-1',
    department: {
      id: 'department-1',
      code: 'VH-XH',
      name: 'Văn hóa - Xã hội',
      isActive: true,
    },
    lastLoginAt: null,
    ...overrides,
  };
}

test('tự đổi mật khẩu tiêu thụ challenge trong cùng transaction và OTP cũ bị từ chối', async () => {
  const currentPassword = 'CurrentPassword@2026';
  let user = {
    ...userActor(),
    passwordHash: await bcrypt.hash(currentPassword, 4),
    tokenVersion: 3,
    version: 2,
  };
  const challenge = {
    id: 'old-otp-challenge',
    userId: user.id,
    otpHash: hashPasswordResetValue(resetSecret, 'old-otp-challenge', '123456'),
    expiresAt: new Date(Date.now() + 60_000),
    attempts: 0,
    maxAttempts: 5,
    verifiedAt: null,
    resetTokenHash: null,
    resetTokenExpiresAt: null,
    consumedAt: null as Date | null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const prisma = {
    user: {
      findUnique: async () => user,
      findFirst: async () => user,
    },
    passwordResetChallenge: {
      findFirst: async () => (challenge.consumedAt ? null : challenge),
    },
    $transaction: async (callback: (tx: any) => Promise<unknown>) => callback({
      user: {
        updateMany: async ({ data }: Record<string, any>) => {
          user = {
            ...user,
            passwordHash: data.passwordHash,
            tokenVersion: user.tokenVersion + data.tokenVersion.increment,
            version: user.version + data.version.increment,
          };
          return { count: 1 };
        },
        findUniqueOrThrow: async () => user,
      },
      passwordResetChallenge: {
        updateMany: async ({ where, data }: Record<string, any>) => {
          assert.deepEqual(where, { userId: user.id, consumedAt: null });
          challenge.consumedAt = data.consumedAt;
          challenge.resetTokenHash = data.resetTokenHash;
          return { count: 1 };
        },
      },
      auditLog: { create: async ({ data }: Record<string, any>) => data },
    }),
  };
  const controller = authController(prisma);

  await controller.changePassword(
    { user: userActor(), ip: '127.0.0.1' },
    { currentPassword, newPassword: 'NewPassword@2026!' },
  );

  assert.ok(challenge.consumedAt instanceof Date);
  await assert.rejects(
    controller.verifyPasswordResetOtp(
      { identifier: user.username, otp: '123456' },
      { ip: '127.0.0.1' },
    ),
    (error: unknown) => error instanceof BadRequestException,
  );
});

const adminUpdateCases: Array<{
  name: string;
  dto: Partial<UpdateUserDto>;
}> = [
  { name: 'đổi email', dto: { email: 'new-email@laithieu.gov.vn' } },
  { name: 'đặt mật khẩu mới', dto: { password: 'AdminReset@2026!' } },
  { name: 'vô hiệu hóa tài khoản', dto: { isActive: false } },
];

for (const scenario of adminUpdateCases) {
  test(`quản trị viên ${scenario.name} sẽ tiêu thụ challenge và reset token cũ bị từ chối`, async () => {
    const resetToken = 'r'.repeat(43);
    let user = {
      ...userActor(),
      passwordHash: await bcrypt.hash('CurrentPassword@2026', 4),
      tokenVersion: 3,
      version: 2,
    };
    const challenge = {
      id: `challenge-${scenario.name}`,
      userId: user.id,
      otpHash: 'opaque-otp-hash',
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 0,
      maxAttempts: 5,
      verifiedAt: new Date(),
      resetTokenHash: hashPasswordResetValue(resetSecret, 'reset-token', resetToken) as string | null,
      resetTokenExpiresAt: new Date(Date.now() + 60_000),
      consumedAt: null as Date | null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const prisma = {
      user: {
        findUnique: async () => user,
      },
      department: {
        findUnique: async () => ({ ...user.department, isActive: true }),
      },
      passwordResetChallenge: {
        findUnique: async () => ({ ...challenge, user }),
      },
      $transaction: async (callback: (tx: any) => Promise<unknown>) => callback({
        user: {
          count: async () => 2,
          updateMany: async ({ data }: Record<string, any>) => {
            user = {
              ...user,
              ...(Object.hasOwn(data, 'email') ? { email: data.email } : {}),
              ...(Object.hasOwn(data, 'passwordHash') ? { passwordHash: data.passwordHash } : {}),
              ...(Object.hasOwn(data, 'isActive') ? { isActive: data.isActive } : {}),
              tokenVersion: user.tokenVersion + (data.tokenVersion?.increment || 0),
              version: user.version + data.version.increment,
            };
            return { count: 1 };
          },
          findUniqueOrThrow: async () => user,
        },
        feedback: { count: async () => 0 },
        passwordResetChallenge: {
          updateMany: async ({ where, data }: Record<string, any>) => {
            assert.deepEqual(where, { userId: user.id, consumedAt: null });
            challenge.consumedAt = data.consumedAt;
            challenge.resetTokenHash = data.resetTokenHash;
            return { count: 1 };
          },
        },
        auditLog: { create: async ({ data }: Record<string, any>) => data },
      }),
    };

    const users = new UsersController(prisma as any);
    await users.update(
      user.id,
      { expectedVersion: user.version, ...scenario.dto } as UpdateUserDto,
      {
        user: userActor({
          id: 'admin-1',
          username: 'admin',
          role: Role.ADMIN,
          departmentId: null,
          department: null,
        }),
      },
    );

    assert.ok(challenge.consumedAt instanceof Date);
    assert.equal(challenge.resetTokenHash, null);
    await assert.rejects(
      authController(prisma).completePasswordReset(
        { resetToken, newPassword: 'AttackerPassword@2026!' },
        { ip: '127.0.0.1' },
      ),
      (error: unknown) => error instanceof BadRequestException,
    );
  });
}

test('shutdown drain chờ delivery đang hoàn tất và không vô hiệu hóa challenge đã gửi thành công', async () => {
  const registry = new PasswordResetDeliveryRegistry();
  let completeDelivery!: () => void;
  let invalidated = false;
  const delivery = new Promise<void>(resolve => {
    completeDelivery = resolve;
  });
  const tracked = registry.track(delivery, async () => {
    invalidated = true;
  });

  setTimeout(completeDelivery, 5);
  await registry.drain(200);
  await tracked;

  assert.equal(invalidated, false);
});

test('shutdown drain có giới hạn và vô hiệu hóa challenge khi SMTP còn treo', async () => {
  const registry = new PasswordResetDeliveryRegistry();
  let invalidated = false;
  const neverSettles = new Promise<void>(() => undefined);
  registry.track(neverSettles, async () => {
    invalidated = true;
  });

  const startedAt = Date.now();
  await registry.drain(40);
  const elapsedMs = Date.now() - startedAt;

  assert.equal(invalidated, true);
  assert.ok(elapsedMs < 500, `drain took ${elapsedMs}ms`);
});
