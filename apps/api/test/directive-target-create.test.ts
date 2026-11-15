import assert from 'node:assert/strict';
import test from 'node:test';
import { FrameworkKind, Role, TargetDirection, TargetFrequency } from '@prisma/client';
import { createTargetInTransaction, type CreateTargetInput } from '../src/target-create';

const actor = { id: 'leader', username: 'chu.tich', fullName: 'Chủ tịch UBND', role: Role.LEADER, isActive: true, departmentId: null };
const input: CreateTargetInput = {
  title: 'Hoàn thiện hồ sơ quyết toán công trình', unit: '%', targetValue: 100, weight: 1,
  kind: FrameworkKind.TASK, year: 2026, frequency: TargetFrequency.YEARLY,
  direction: TargetDirection.HIGHER_IS_BETTER, dueDate: new Date('2027-01-15T16:59:59.999Z'),
  departmentId: 'economy', isHighlighted: false,
};

test('nhiệm vụ có thể sang năm sau và giữ dấu người phân việc trong giao dịch tạo', async () => {
  let auditCount = 0;
  let eventCount = 0;
  const tx = {
    department: { findUnique: async () => ({ id: 'economy', code: 'KT', isActive: true }) },
    target: { findMany: async () => [], create: async ({ data }: any) => ({ id: 'task', ...data }) },
    auditLog: { create: async () => { auditCount++; } },
    workEvent: { create: async () => { eventCount++; } },
  };
  const task = await createTargetInTransaction(tx as any, actor, input);
  assert.equal(task.year, 2026);
  assert.equal(task.dueDate.getUTCFullYear(), 2027);
  assert.equal(task.dispatchedById, actor.id);
  assert.equal(task.dispatchedByName, actor.fullName);
  assert.ok(task.dispatchedAt instanceof Date);
  assert.equal(auditCount, 1);
  assert.equal(eventCount, 1);
});

test('chỉ tiêu định kỳ tiếp tục bắt buộc hạn thuộc năm kế hoạch', async () => {
  await assert.rejects(createTargetInTransaction({} as any, actor, { ...input, kind: FrameworkKind.PLAN }), /cùng năm kế hoạch/);
});

test('tạo qua bộ TASK suy loại và chuẩn hóa tỷ lệ, từ chối ghép sai loại bộ', async () => {
  const tx = {
    department: { findUnique: async () => ({ id: 'economy', code: 'KT', isActive: true }) },
    framework: { findUnique: async () => ({ kind: FrameworkKind.TASK, isActive: true }) },
    target: { findMany: async () => [], create: async ({ data }: any) => ({ id: 'task', ...data }) },
    auditLog: { create: async () => undefined }, workEvent: { create: async () => undefined },
  };
  const task = await createTargetInTransaction(tx as any, actor, { ...input, kind: undefined, frameworkId: 'directive', unit: 'việc', targetValue: 1, frequency: TargetFrequency.MONTHLY });
  assert.equal(task.kind, FrameworkKind.TASK);
  assert.equal(task.unit, '%');
  assert.equal(task.targetValue, 100);
  assert.equal(task.frequency, TargetFrequency.YEARLY);
  await assert.rejects(createTargetInTransaction(tx as any, actor, { ...input, kind: FrameworkKind.PLAN, frameworkId: 'directive' }), /trùng với loại bộ/);
});
