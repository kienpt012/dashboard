import assert from 'node:assert/strict';
import test from 'node:test';
import { ConflictException } from '@nestjs/common';
import {
  Prisma,
  ProgressReviewStatus,
  Role,
  TargetDirection,
} from '@prisma/client';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validateSync } from 'class-validator';
import { DepartmentsController, UpdateDepartmentDto } from '../src/departments';
import { UpdateSystemSettingDto } from '../src/settings';
import {
  PublishTargetDto,
  SetTargetVisibilityDto,
  TargetsController,
  UpdateTargetDto,
} from '../src/targets';
import { UpdateUserDto } from '../src/users';

function invalidProperties<T extends object>(
  dto: ClassConstructor<T>,
  payload: Record<string, unknown>,
) {
  return validateSync(plainToInstance(dto, payload)).map(error => error.property);
}

test('DTO cập nhật bỏ qua trường không gửi nhưng từ chối null ở trường không nullable', () => {
  assert.deepEqual(invalidProperties(UpdateUserDto, { expectedVersion: 1 }), []);
  assert.ok(invalidProperties(UpdateUserDto, { expectedVersion: 1, fullName: null }).includes('fullName'));
  assert.ok(invalidProperties(UpdateUserDto, { expectedVersion: 1, role: null }).includes('role'));
  assert.ok(invalidProperties(UpdateUserDto, { expectedVersion: 1, isActive: null }).includes('isActive'));
  assert.ok(invalidProperties(UpdateUserDto, { expectedVersion: 1, password: null }).includes('password'));

  assert.deepEqual(invalidProperties(UpdateDepartmentDto, { expectedVersion: 1 }), []);
  assert.ok(invalidProperties(UpdateDepartmentDto, { expectedVersion: 1, description: null }).includes('description'));

  const targetVersions = { expectedVersion: 1, expectedPublicationVersion: 1 };
  assert.deepEqual(invalidProperties(UpdateTargetDto, targetVersions), []);
  assert.ok(invalidProperties(UpdateTargetDto, { ...targetVersions, title: null }).includes('title'));
  assert.ok(invalidProperties(UpdateTargetDto, { ...targetVersions, targetValue: null }).includes('targetValue'));
  assert.ok(invalidProperties(SetTargetVisibilityDto, { ...targetVersions, isPublic: null }).includes('isPublic'));
  assert.deepEqual(invalidProperties(PublishTargetDto, targetVersions), []);
  assert.deepEqual(
    invalidProperties(PublishTargetDto, {}).sort(),
    ['expectedPublicationVersion', 'expectedVersion'],
  );

  assert.deepEqual(invalidProperties(UpdateSystemSettingDto, { expectedVersion: 1 }), []);
  assert.ok(invalidProperties(UpdateSystemSettingDto, { expectedVersion: 1, warningDays: null }).includes('warningDays'));
});

test('DTO người dùng vẫn cho phép null có chủ đích để xóa email hoặc phòng ban', () => {
  assert.deepEqual(invalidProperties(UpdateUserDto, {
    expectedVersion: 1,
    email: null,
    departmentId: null,
  }), []);
});

function prismaWriteConflict() {
  return new Prisma.PrismaClientKnownRequestError('write conflict', {
    code: 'P2034',
    clientVersion: '6.14.0',
  });
}

test('cập nhật phòng ban chuyển xung đột giao dịch P2034 thành HTTP 409', async () => {
  const prisma = {
    department: {
      findUnique: async () => ({ id: 'dep-1', version: 1, isActive: true }),
    },
    $transaction: async () => { throw prismaWriteConflict(); },
  };
  const controller = new DepartmentsController(prisma as any);

  await assert.rejects(
    controller.update('dep-1', { expectedVersion: 1 } as UpdateDepartmentDto, {
      user: { id: 'admin-1', role: Role.ADMIN, departmentId: null },
    }),
    (error: unknown) => error instanceof ConflictException && error.getStatus() === 409,
  );
});

test('duyệt báo cáo chuyển xung đột giao dịch P2034 thành HTTP 409', async () => {
  const prisma = {
    progressUpdate: {
      findFirst: async () => ({
        id: 'update-1',
        targetId: 'target-1',
        userId: 'staff-1',
        value: 8,
        baseVersion: 1,
        reviewStatus: ProgressReviewStatus.PENDING,
        importBatchId: null,
        target: {
          id: 'target-1',
          version: 1,
          targetValue: 10,
          currentValue: 0,
          direction: TargetDirection.HIGHER_IS_BETTER,
          dueDate: new Date('2026-12-31T16:59:59.999Z'),
          departmentId: 'dep-1',
        },
      }),
    },
    systemSetting: {
      findUnique: async () => ({ riskThreshold: 70 }),
    },
    $transaction: async () => { throw prismaWriteConflict(); },
  };
  const controller = new TargetsController(prisma as any);

  await assert.rejects(
    controller.review(
      {
        user: {
          id: 'manager-1',
          role: Role.MANAGER,
          departmentId: 'dep-1',
          department: { id: 'dep-1', isActive: true },
        },
      },
      'update-1',
      { decision: 'APPROVE' },
    ),
    (error: unknown) => error instanceof ConflictException && error.getStatus() === 409,
  );
});
