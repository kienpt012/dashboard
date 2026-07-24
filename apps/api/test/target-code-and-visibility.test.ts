import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  Prisma,
  Role,
  TargetDirection,
  TargetFrequency,
  TargetStatus,
} from '@prisma/client';
import {
  CreateTargetDto,
  nextTargetCode,
  normalizeTargetDepartmentCode,
  TargetsController,
  UpdateTargetDto,
} from '../src/targets';

const department = {
  id: 'dep-cand',
  code: 'Công an P.',
  name: 'Công an phường',
  color: '#0f766e',
  isActive: true,
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

const staffRequest = {
  user: {
    id: 'staff-1',
    username: 'staff',
    fullName: 'Chuyên viên',
    role: Role.STAFF,
    isActive: true,
    departmentId: 'dep-cand',
    department,
  },
};

function prismaWriteError(code: 'P2002' | 'P2034') {
  return new Prisma.PrismaClientKnownRequestError('concurrent target creation', {
    code,
    clientVersion: '6.14.0',
  });
}

test('mã chỉ tiêu chuẩn hóa theo năm, phòng ban và không tái sử dụng số đã cấp', () => {
  assert.equal(normalizeTargetDepartmentCode('Công an P.'), 'CONGANP');
  assert.equal(normalizeTargetDepartmentCode('Đô thị - 01'), 'DOTHI01');
  assert.equal(nextTargetCode(2026, 'CAND', []), 'CT-2026-CAND-001');
  assert.equal(
    nextTargetCode(2026, 'CAND', [
      'CT-2026-CAND-001',
      'CT-2026-CAND-009',
      'CT-2025-CAND-999',
      'CT-2026-VP-010',
      'CT-2026-CAND-khong-hop-le',
    ]),
    'CT-2026-CAND-010',
  );
});

test('bộ cấp mã dùng tiếp dãy toàn cục khi hai phòng ban có cùng mã chuẩn hóa', () => {
  assert.equal(
    nextTargetCode(2026, 'Công an P.', [
      'CT-2026-CONGANP-001',
      'CT-2026-CONGANP-003',
    ]),
    'CT-2026-CONGANP-004',
  );
});

test('tạo chỉ tiêu tự cấp mã toàn cục trong Serializable, thử lại khi đụng mã và bỏ qua mã do client chèn', async () => {
  let attempts = 0;
  let departmentReads = 0;
  let createdData: Record<string, unknown> | undefined;
  const transactionOptions: unknown[] = [];
  const tx = {
    department: {
      findUnique: async (args: any) => {
        departmentReads += 1;
        assert.deepEqual(args, { where: { id: 'dep-cand' } });
        return department;
      },
    },
    target: {
      findMany: async (args: any) => {
        assert.deepEqual(args.where, {
          code: { startsWith: 'CT-2026-CONGANP-' },
        });
        return [
          { code: 'CT-2026-CONGANP-001' },
          // Mã này thuộc một phòng ban khác có mã chuẩn hóa trùng CONGANP.
          // Bộ cấp mã phải quét toàn cục để không cấp lại số 003.
          { code: 'CT-2026-CONGANP-003' },
        ];
      },
      create: async (args: any) => {
        if (attempts === 1) throw prismaWriteError('P2002');
        createdData = args.data;
        return { id: 'target-new', ...args.data, department };
      },
    },
    auditLog: {
      create: async () => undefined,
    },
  };
  const prisma = {
    $transaction: async (callback: (client: any) => Promise<unknown>, options: unknown) => {
      attempts += 1;
      transactionOptions.push(options);
      return callback(tx);
    },
  };
  const controller = new TargetsController(prisma as any);

  const result = await controller.create(adminRequest, {
    code: 'MA-TU-NHAP',
    title: 'Tỷ lệ xử lý hồ sơ đúng hạn',
    description: '',
    unit: '%',
    targetValue: 98,
    weight: 1,
    year: 2026,
    frequency: TargetFrequency.YEARLY,
    direction: TargetDirection.HIGHER_IS_BETTER,
    dueDate: '2026-12-31',
    departmentId: 'dep-cand',
    isHighlighted: true,
    publicOrder: 1,
  } as CreateTargetDto & { code: string });

  assert.equal(attempts, 2);
  assert.equal(departmentReads, 2);
  assert.deepEqual(transactionOptions, [
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  ]);
  assert.equal(createdData?.code, 'CT-2026-CONGANP-004');
  assert.notEqual(createdData?.code, 'MA-TU-NHAP');
  assert.equal((result as any).code, 'CT-2026-CONGANP-004');
  assert.equal((result as any).isPublic, false);
});

test('không cấp mã nếu phòng ban đã ngừng hoạt động trong cùng giao dịch Serializable', async () => {
  let targetRead = false;
  const prisma = {
    $transaction: async (callback: (client: any) => Promise<unknown>, options: unknown) => {
      assert.deepEqual(options, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return callback({
        department: {
          findUnique: async () => ({ ...department, isActive: false }),
        },
        target: {
          findMany: async () => {
            targetRead = true;
            return [];
          },
        },
      });
    },
  };
  const controller = new TargetsController(prisma as any);

  await assert.rejects(
    controller.create(adminRequest, {
      title: 'Tỷ lệ xử lý hồ sơ đúng hạn',
      unit: '%',
      targetValue: 98,
      year: 2026,
      frequency: TargetFrequency.YEARLY,
      dueDate: '2026-12-31',
      departmentId: 'dep-cand',
    } as CreateTargetDto),
    (error: unknown) => error instanceof BadRequestException && error.getStatus() === 400,
  );
  assert.equal(targetRead, false);
});

function publishedTarget(overrides: Record<string, unknown> = {}) {
  return {
    id: 'target-1',
    code: 'CT-2026-CAND-001',
    title: 'Tỷ lệ xử lý hồ sơ đúng hạn',
    description: 'Tỷ lệ hồ sơ được giải quyết trong thời hạn quy định',
    unit: '%',
    targetValue: 98,
    currentValue: 96,
    weight: 1,
    year: 2026,
    frequency: TargetFrequency.YEARLY,
    direction: TargetDirection.HIGHER_IS_BETTER,
    status: TargetStatus.ON_TRACK,
    dueDate: new Date('2026-12-31T16:59:59.999Z'),
    departmentId: department.id,
    department,
    version: 4,
    publicationVersion: 2,
    isArchived: false,
    isPublic: false,
    isHighlighted: true,
    publicOrder: 1,
    lastReportedAt: new Date('2026-07-20T03:00:00.000Z'),
    ...overrides,
  };
}

test('bật hiển thị tạo đầy đủ snapshot chính thức và tăng phiên bản công bố', async () => {
  const target = publishedTarget();
  let updateArgs: any;
  let auditArgs: any;
  const prisma = {
    systemSetting: {
      findUnique: async () => ({ riskThreshold: 70 }),
    },
    $transaction: async (callback: (client: any) => Promise<unknown>, options: unknown) => {
      assert.deepEqual(options, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return callback({
        target: {
          findUnique: async () => target,
          updateMany: async (args: any) => {
            updateArgs = args;
            return { count: 1 };
          },
          findUniqueOrThrow: async () => ({
            ...target,
            isPublic: true,
            publicationVersion: 3,
          }),
        },
        auditLog: {
          create: async (args: any) => {
            auditArgs = args;
          },
        },
      });
    },
  };
  const controller = new TargetsController(prisma as any);

  const result = await controller.setVisibility(adminRequest, 'target-1', {
    isPublic: true,
    expectedVersion: 4,
    expectedPublicationVersion: 2,
  });

  assert.equal(updateArgs.data.isPublic, true);
  assert.equal(updateArgs.data.publishedCode, target.code);
  assert.equal(updateArgs.data.publishedTitle, target.title);
  assert.equal(updateArgs.data.publishedValue, target.currentValue);
  assert.equal(updateArgs.data.publishedDepartmentName, department.name);
  assert.deepEqual(updateArgs.data.publicationVersion, { increment: 1 });
  assert.ok(updateArgs.data.publishedAt instanceof Date);
  assert.equal(auditArgs.data.action, 'TARGET_PUBLISHED');
  assert.equal(auditArgs.data.metadata.isPublic, true);
  assert.equal((result as any).isPublic, true);
});

test('tắt hiển thị giữ nguyên snapshot và chỉ thay đổi cờ công khai', async () => {
  const target = publishedTarget({ isPublic: true });
  let updateData: any;
  const prisma = {
    $transaction: async (callback: (client: any) => Promise<unknown>) => callback({
      target: {
        findUnique: async () => target,
        updateMany: async (args: any) => {
          updateData = args.data;
          return { count: 1 };
        },
        findUniqueOrThrow: async () => ({
          ...target,
          isPublic: false,
          publicationVersion: 3,
        }),
      },
      auditLog: {
        create: async () => undefined,
      },
    }),
  };
  const controller = new TargetsController(prisma as any);

  const result = await controller.setVisibility(adminRequest, 'target-1', {
    isPublic: false,
    expectedVersion: 4,
    expectedPublicationVersion: 2,
  });

  assert.deepEqual(updateData, {
    isPublic: false,
    publicationVersion: { increment: 1 },
  });
  assert.equal((result as any).isPublic, false);
});

test('phòng ban không thể thay đổi hiển thị kể cả khi gọi trực tiếp controller', async () => {
  let transactionCalled = false;
  const controller = new TargetsController({
    $transaction: async () => {
      transactionCalled = true;
    },
  } as any);

  await assert.rejects(
    controller.setVisibility(staffRequest, 'target-1', {
      isPublic: true,
      expectedVersion: 4,
      expectedPublicationVersion: 2,
    }),
    (error: unknown) => error instanceof ForbiddenException && error.getStatus() === 403,
  );
  assert.equal(transactionCalled, false);
});

test('năm kế hoạch và phòng ban không thể đổi sau khi mã chỉ tiêu đã được cấp', async () => {
  const target = publishedTarget();
  let transactionCalled = false;
  const controller = new TargetsController({
    target: {
      findFirst: async () => target,
    },
    $transaction: async () => {
      transactionCalled = true;
    },
  } as any);
  const versions = {
    expectedVersion: target.version,
    expectedPublicationVersion: target.publicationVersion,
  };

  await assert.rejects(
    controller.update(adminRequest, target.id, {
      ...versions,
      year: 2027,
    } as UpdateTargetDto),
    (error: unknown) => error instanceof BadRequestException
      && /Năm kế hoạch được khóa/.test(error.message),
  );
  await assert.rejects(
    controller.update(adminRequest, target.id, {
      ...versions,
      departmentId: 'dep-khac',
    } as UpdateTargetDto),
    (error: unknown) => error instanceof BadRequestException
      && /Phòng ban phụ trách được khóa/.test(error.message),
  );
  assert.equal(transactionCalled, false);
});

test('route publish legacy bắt buộc và chuyển tiếp đúng phiên bản kỳ vọng', async () => {
  const target = publishedTarget();
  let updateWhere: any;
  const controller = new TargetsController({
    systemSetting: {
      findUnique: async () => ({ riskThreshold: 70 }),
    },
    $transaction: async (callback: (client: any) => Promise<unknown>) => callback({
      target: {
        findUnique: async () => target,
        updateMany: async (args: any) => {
          updateWhere = args.where;
          return { count: 1 };
        },
        findUniqueOrThrow: async () => ({
          ...target,
          isPublic: true,
          publicationVersion: target.publicationVersion + 1,
        }),
      },
      auditLog: { create: async () => undefined },
    }),
  } as any);

  await controller.publish(adminRequest, target.id, {
    expectedVersion: target.version,
    expectedPublicationVersion: target.publicationVersion,
  });

  assert.equal(updateWhere.version, target.version);
  assert.equal(updateWhere.publicationVersion, target.publicationVersion);
});
