import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import {
  ImportBatchStatus,
  Prisma,
  ProgressReviewStatus,
  Role,
  TargetDirection,
} from '@prisma/client';
import { ImportController } from '../src/import';
import { TargetsController } from '../src/targets';

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

const managerRequest = {
  user: {
    id: 'manager-1',
    username: 'manager',
    fullName: 'Trưởng phòng',
    role: Role.MANAGER,
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

const previewChange = {
  row: 2,
  targetId: 'target-1',
  code: 'CT-01',
  departmentId: 'dep-1',
  baseVersion: 3,
  oldValue: 5,
  newValue: 8,
  note: 'Kỳ tháng 7',
};

const ownedDraft = {
  id: 'batch-1',
  fileName: 'bao-cao.xlsx',
  totalRows: 1,
  successRows: 1,
  errorRows: 0,
  errors: [],
  changes: [previewChange],
  createdBy: 'admin',
  departmentId: 'dep-1',
  status: ImportBatchStatus.PREVIEWED,
  submittedAt: null,
  appliedAt: null,
  createdAt: new Date('2026-07-17T00:00:00.000Z'),
};

test('ADMIN không được áp dụng draft Excel do người khác xem trước', async () => {
  let transactionCalled = false;
  const prisma = {
    importBatch: {
      findUnique: async () => ({ ...ownedDraft, createdBy: 'staff-1' }),
    },
    $transaction: async () => {
      transactionCalled = true;
    },
  };
  const controller = new ImportController(prisma as any);

  await assert.rejects(
    controller.apply('batch-1', adminRequest),
    (error: unknown) => error instanceof ForbiddenException && error.getStatus() === 403,
  );
  assert.equal(transactionCalled, false);
});

test('áp dụng draft đọc lại ownership và claim PREVIEWED nguyên tử trong transaction Serializable', async () => {
  let transactionOptions: unknown;
  let claimWhere: unknown;
  const target = {
    id: 'target-1',
    code: 'CT-01',
    departmentId: 'dep-1',
    version: 3,
    isArchived: false,
    currentValue: 5,
    targetValue: 10,
    direction: TargetDirection.HIGHER_IS_BETTER,
    dueDate: new Date('2026-12-31T16:59:59.999Z'),
  };
  const tx = {
    importBatch: {
      findFirst: async (args: any) => {
        assert.deepEqual(args.where, { id: 'batch-1', createdBy: 'admin' });
        return ownedDraft;
      },
      updateMany: async (args: any) => {
        claimWhere = args.where;
        return { count: 1 };
      },
      findUnique: async () => ownedDraft,
      update: async (args: any) => ({
        ...ownedDraft,
        ...args.data,
        department: { id: 'dep-1', code: 'DEP-1', name: 'Phòng nghiệp vụ' },
      }),
    },
    target: {
      findMany: async () => [target],
      updateMany: async (args: any) => {
        assert.deepEqual(args.where, { id: 'target-1', version: 3 });
        return { count: 1 };
      },
    },
    progressUpdate: {
      create: async (args: any) => ({ id: 'update-1', ...args.data }),
    },
    systemSetting: {
      findUnique: async () => ({ riskThreshold: 70 }),
    },
    auditLog: {
      create: async () => undefined,
    },
  };
  const prisma = {
    importBatch: {
      findUnique: async () => ownedDraft,
    },
    $transaction: async (callback: (client: any) => Promise<unknown>, options: unknown) => {
      transactionOptions = options;
      return callback(tx);
    },
  };
  const controller = new ImportController(prisma as any);

  const result = await controller.apply('batch-1', adminRequest);

  assert.deepEqual(transactionOptions, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
  assert.deepEqual(claimWhere, {
    id: 'batch-1',
    createdBy: 'admin',
    status: ImportBatchStatus.PREVIEWED,
  });
  assert.equal(result.status, ImportBatchStatus.APPLIED);
  assert.equal(result.idempotent, false);
});

test('từ chối báo cáo và tính lại trạng thái batch trong cùng transaction Serializable', async () => {
  let transactionOptions: unknown;
  let batchUpdate: any;
  const pendingUpdate = {
    id: 'update-1',
    targetId: 'target-1',
    userId: 'staff-1',
    value: 8,
    baseVersion: 3,
    reviewStatus: ProgressReviewStatus.PENDING,
    importBatchId: 'batch-1',
    target: {
      id: 'target-1',
      version: 3,
      departmentId: 'dep-1',
    },
  };
  const tx = {
    progressUpdate: {
      updateMany: async () => ({ count: 1 }),
      findMany: async (args: any) => {
        assert.deepEqual(args.where, { importBatchId: 'batch-1' });
        return [
          { reviewStatus: ProgressReviewStatus.REJECTED },
          { reviewStatus: ProgressReviewStatus.APPROVED },
        ];
      },
      findUniqueOrThrow: async () => ({
        ...pendingUpdate,
        reviewStatus: ProgressReviewStatus.REJECTED,
      }),
    },
    importBatch: {
      updateMany: async (args: any) => {
        batchUpdate = args;
        return { count: 1 };
      },
    },
    auditLog: {
      create: async () => undefined,
    },
  };
  const prisma = {
    progressUpdate: {
      findFirst: async () => pendingUpdate,
    },
    $transaction: async (callback: (client: any) => Promise<unknown>, options: unknown) => {
      transactionOptions = options;
      return callback(tx);
    },
  };
  const controller = new TargetsController(prisma as any);

  const result = await controller.review(
    managerRequest,
    'update-1',
    { decision: 'REJECT', reviewNote: 'Sai nguồn đối soát' },
  );

  assert.deepEqual(transactionOptions, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
  assert.deepEqual(batchUpdate.where, {
    id: 'batch-1',
    status: {
      in: [ImportBatchStatus.SUBMITTED, ImportBatchStatus.PARTIALLY_REVIEWED],
    },
  });
  assert.equal(batchUpdate.data.status, ImportBatchStatus.PARTIALLY_APPROVED);
  assert.ok(batchUpdate.data.appliedAt instanceof Date);
  assert.equal(result.reviewStatus, ProgressReviewStatus.REJECTED);
});
