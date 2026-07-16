import assert from 'node:assert/strict';
import test from 'node:test';
import { ConflictException } from '@nestjs/common';
import {
  Prisma,
  ProgressReviewStatus,
  Role,
  TargetDirection,
  TargetFrequency,
} from '@prisma/client';
import { TargetsController, UpdateTargetDto } from '../src/targets';

const activeTarget = {
  id: 'target-1',
  code: 'CT-01',
  title: 'Chỉ tiêu gốc',
  description: null,
  unit: 'hồ sơ',
  targetValue: 10,
  currentValue: 0,
  weight: 1,
  year: 2026,
  frequency: TargetFrequency.YEARLY,
  direction: TargetDirection.HIGHER_IS_BETTER,
  dueDate: new Date('2026-12-31T16:59:59.999Z'),
  departmentId: 'dep-1',
  version: 3,
  publicationVersion: 2,
  isArchived: false,
  lastReportedAt: null,
};

const staffRequest = {
  user: {
    id: 'staff-1',
    username: 'staff',
    fullName: 'Nhân viên',
    role: Role.STAFF,
    isActive: true,
    departmentId: 'dep-1',
    department: {
      id: 'dep-1',
      code: 'DEP-1',
      name: 'Phòng nghiệp vụ',
      isActive: true,
    },
  },
};

const adminRequest = {
  user: {
    id: 'admin-1',
    username: 'admin',
    fullName: 'Quản trị viên',
    role: Role.ADMIN,
    isActive: true,
    departmentId: null,
  },
};

function prismaConflict(code: 'P2025' | 'P2034') {
  return new Prisma.PrismaClientKnownRequestError('concurrent target mutation', {
    code,
    clientVersion: '6.14.0',
  });
}

test('gửi báo cáo đọc lại chỉ tiêu đúng phạm vi và lịch sử chờ duyệt trong cùng transaction Serializable', async () => {
  const calls: string[] = [];
  let transactionOptions: unknown;
  const tx = {
    target: {
      findFirst: async (args: any) => {
        calls.push('target.findFirst');
        assert.deepEqual(args.where, {
          id: 'target-1',
          version: 3,
          isArchived: false,
          departmentId: 'dep-1',
        });
        return activeTarget;
      },
    },
    progressUpdate: {
      findFirst: async (args: any) => {
        calls.push('progressUpdate.findFirst');
        assert.deepEqual(args.where, {
          targetId: 'target-1',
          userId: 'staff-1',
          reviewStatus: ProgressReviewStatus.PENDING,
        });
        return null;
      },
      create: async (args: any) => {
        calls.push('progressUpdate.create');
        return { id: 'update-1', ...args.data };
      },
    },
    auditLog: {
      create: async () => undefined,
    },
  };
  const prisma = {
    target: {
      findFirst: async () => activeTarget,
    },
    $transaction: async (callback: (client: any) => Promise<unknown>, options: unknown) => {
      transactionOptions = options;
      return callback(tx);
    },
  };
  const controller = new TargetsController(prisma as any);

  const result = await controller.progress(
    'target-1',
    { value: 8, note: '  Kỳ tháng 7  ', baseVersion: 3 },
    staffRequest,
  );

  assert.deepEqual(transactionOptions, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
  assert.deepEqual(calls, [
    'target.findFirst',
    'progressUpdate.findFirst',
    'progressUpdate.create',
  ]);
  assert.equal(result.reviewStatus, ProgressReviewStatus.PENDING);
  assert.equal(result.update.note, 'Kỳ tháng 7');
});

test('gửi báo cáo dừng với HTTP 409 nếu chỉ tiêu bị lưu trữ hoặc đổi phiên bản ngay trước transaction', async () => {
  let pendingHistoryRead = false;
  const prisma = {
    target: {
      findFirst: async () => activeTarget,
    },
    $transaction: async (callback: (client: any) => Promise<unknown>) => callback({
      target: {
        findFirst: async () => null,
      },
      progressUpdate: {
        findFirst: async () => {
          pendingHistoryRead = true;
          return null;
        },
      },
    }),
  };
  const controller = new TargetsController(prisma as any);

  await assert.rejects(
    controller.progress(
      'target-1',
      { value: 8, note: 'Kỳ tháng 7', baseVersion: 3 },
      staffRequest,
    ),
    (error: unknown) => error instanceof ConflictException && error.getStatus() === 409,
  );
  assert.equal(pendingHistoryRead, false);
});

test('chỉnh định nghĩa đếm lịch sử trong transaction Serializable trước khi ghi chỉ tiêu', async () => {
  let rootHistoryCountCalled = false;
  let transactionOptions: unknown;
  let targetWriteCalled = false;
  const prisma = {
    target: {
      findFirst: async () => activeTarget,
    },
    progressUpdate: {
      count: async () => {
        rootHistoryCountCalled = true;
        return 0;
      },
    },
    systemSetting: {
      findUnique: async () => ({ riskThreshold: 70 }),
    },
    $transaction: async (callback: (client: any) => Promise<unknown>, options: unknown) => {
      transactionOptions = options;
      return callback({
        progressUpdate: {
          count: async (args: any) => {
            assert.deepEqual(args.where, { targetId: 'target-1' });
            return 1;
          },
        },
        target: {
          updateMany: async () => {
            targetWriteCalled = true;
            return { count: 1 };
          },
        },
      });
    },
  };
  const controller = new TargetsController(prisma as any);

  await assert.rejects(
    controller.update(
      adminRequest,
      'target-1',
      {
        title: 'Chỉ tiêu mới',
        expectedVersion: 3,
        expectedPublicationVersion: 2,
      } as UpdateTargetDto,
    ),
    (error: unknown) => error instanceof ConflictException && error.getStatus() === 409,
  );

  assert.equal(rootHistoryCountCalled, false);
  assert.equal(targetWriteCalled, false);
  assert.deepEqual(transactionOptions, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
});

test('chỉnh chỉ tiêu chuyển Prisma P2025 thành HTTP 409', async () => {
  const prisma = {
    target: {
      findFirst: async () => activeTarget,
    },
    systemSetting: {
      findUnique: async () => ({ riskThreshold: 70 }),
    },
    $transaction: async () => {
      throw prismaConflict('P2025');
    },
  };
  const controller = new TargetsController(prisma as any);

  await assert.rejects(
    controller.update(
      adminRequest,
      'target-1',
      { expectedVersion: 3, expectedPublicationVersion: 2 } as UpdateTargetDto,
    ),
    (error: unknown) => error instanceof ConflictException && error.getStatus() === 409,
  );
});
