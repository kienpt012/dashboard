import assert from 'node:assert/strict';
import test from 'node:test';
import { ConflictException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { SettingsController, UpdateSystemSettingDto } from '../src/settings';

const currentSettings = {
  id: 'default',
  defaultYear: 2026,
  warningDays: 14,
  riskThreshold: 70,
  feedbackFirstResponseDays: 2,
  feedbackResolutionDays: 10,
  feedbackCitizenResponseDays: 7,
  version: 3,
  updatedBy: 'admin',
  updatedAt: new Date('2026-07-17T00:00:00.000Z'),
};

const adminRequest = {
  user: {
    id: 'admin-1',
    username: 'admin',
    fullName: 'Administrator',
    role: Role.ADMIN,
    isActive: true,
    departmentId: null,
  },
};

test('settings PATCH skips write, audit and version increment when normalized values are unchanged', async () => {
  let updateCalls = 0;
  let auditCalls = 0;
  const tx = {
    systemSetting: {
      findUnique: async () => currentSettings,
      updateMany: async () => { updateCalls += 1; return { count: 1 }; },
      findUniqueOrThrow: async () => ({ ...currentSettings, version: 4 }),
    },
    auditLog: {
      create: async () => { auditCalls += 1; },
    },
  };
  const prisma = {
    $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
  };
  const controller = new SettingsController(prisma as any);
  const dto = plainToInstance(UpdateSystemSettingDto, {
    expectedVersion: 3,
    warningDays: '14',
    riskThreshold: '70',
    feedbackResolutionDays: '10',
  });

  const result = await controller.update(dto, adminRequest);

  assert.equal(result, currentSettings);
  assert.equal(result.version, 3);
  assert.equal(updateCalls, 0);
  assert.equal(auditCalls, 0);
});

test('settings PATCH no-op still rejects a stale expectedVersion', async () => {
  let updateCalls = 0;
  let auditCalls = 0;
  const tx = {
    systemSetting: {
      findUnique: async () => currentSettings,
      updateMany: async () => { updateCalls += 1; return { count: 1 }; },
    },
    auditLog: {
      create: async () => { auditCalls += 1; },
    },
  };
  const prisma = {
    $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
  };
  const controller = new SettingsController(prisma as any);

  await assert.rejects(
    controller.update(
      { expectedVersion: 2, warningDays: 14 } as UpdateSystemSettingDto,
      adminRequest,
    ),
    (error: unknown) => error instanceof ConflictException && error.getStatus() === 409,
  );
  assert.equal(updateCalls, 0);
  assert.equal(auditCalls, 0);
});

test('settings PATCH keeps the optimistic update guard for real changes', async () => {
  let auditCalls = 0;
  const tx = {
    systemSetting: {
      findUnique: async () => currentSettings,
      updateMany: async () => ({ count: 0 }),
    },
    auditLog: {
      create: async () => { auditCalls += 1; },
    },
  };
  const prisma = {
    $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
  };
  const controller = new SettingsController(prisma as any);

  await assert.rejects(
    controller.update(
      { expectedVersion: 3, warningDays: 15 } as UpdateSystemSettingDto,
      adminRequest,
    ),
    (error: unknown) => error instanceof ConflictException && error.getStatus() === 409,
  );
  assert.equal(auditCalls, 0);
});
