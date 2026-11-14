import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { DirectivesController } from '../src/directives';
import { Actor } from '../src/access';

const leader: Actor = { id: 'leader', username: 'chu.tich', fullName: 'Chủ tịch', role: 'LEADER', isActive: true, departmentId: null };
const office: Actor = { id: 'office', username: 'chanh.vp', fullName: 'Chánh Văn phòng', role: 'MANAGER', isActive: true, departmentId: 'vp', department: { id: 'vp', name: 'Văn phòng', code: 'VP', kind: 'OFFICE', isActive: true } };
const economy: Actor = { id: 'staff', username: 'thao.ktht', fullName: 'Chuyên viên', role: 'STAFF', isActive: true, departmentId: 'kt', department: { id: 'kt', name: 'Kinh tế', code: 'KT', kind: 'SPECIALIZED', isActive: true } };
const framework = { id: 'fw', name: 'Kế hoạch kiểm tra', kind: 'TASK', year: 2026, isActive: true, version: 1 };
const limiter = { consume: () => undefined };
const task = (id: string, overrides: Record<string, unknown> = {}) => ({ id, frameworkId: 'fw', kind: 'TASK', title: 'Rà soát hồ sơ', departmentId: 'kt', department: { id: 'kt', name: 'Kinh tế', color: '#123' }, version: 1, targetValue: 100, currentValue: 0, direction: 'HIGHER_IS_BETTER', dueDate: new Date('2026-11-30T16:59:59Z'), lastReportedAt: null, assigneeId: 'staff', assignedById: 'manager', assignedAt: new Date(), isArchived: false, coordinators: [], updates: [], ...overrides });

test('mọi endpoint thay đổi nhiệm vụ kiểm tra người phân việc trước giao dịch', async () => {
  let transactions = 0;
  const prisma = { systemSetting: { findUnique: async () => ({ dispatchMode: 'LEADER' }) }, department: { count: async () => 1 }, $transaction: async () => { transactions++; } };
  const controller = new DirectivesController(prisma as any, limiter as any);
  for (const actor of [office, economy, { ...economy, role: 'VIEWER' as const }, { ...office, role: 'CLERK' as const }]) {
    await assert.rejects(controller.addTask({ user: actor }, 'fw', { title: 'Nhiệm vụ mới', departmentId: 'kt', dueDate: '2026-11-20' }), ForbiddenException);
    await assert.rejects(controller.paste({ user: actor }, 'fw', { text: 'Nhiệm vụ mới trước 20/11/2026', departmentId: 'kt' }), ForbiddenException);
    await assert.rejects(controller.editTask({ user: actor }, 'fw', 'one', { expectedVersion: 1, title: 'Đổi tên nhiệm vụ' }), ForbiddenException);
    await assert.rejects(controller.bulk({ user: actor }, 'fw', { tasks: [{ id: 'one', expectedVersion: 1 }], departmentId: 'vp' }), ForbiddenException);
    await assert.rejects(controller.update({ user: actor }, 'fw', { expectedVersion: 1, isActive: false }), ForbiddenException);
  }
  assert.equal(transactions, 0);
});

test('phạm vi xem gồm phòng chủ trì và phối hợp; không nhận bộ lọc phòng khác khi không có quyền', async () => {
  let where: any;
  let mode = 'LEADER';
  const prisma = { systemSetting: { findUnique: async () => ({ dispatchMode: mode, crossDepartmentView: false }) }, department: { count: async () => 1 }, framework: { findMany: async () => [framework] }, target: { findMany: async (args: any) => { where = args.where; return []; } } };
  const controller = new DirectivesController(prisma as any, limiter as any);
  await controller.list({ user: economy }, {});
  assert.deepEqual(where.OR, [{ departmentId: 'kt' }, { coordinators: { some: { departmentId: 'kt' } } }]);
  await assert.rejects(controller.list({ user: economy }, { departmentId: 'vp' }), ForbiddenException);
  mode = 'OFFICE';
  await controller.list({ user: office }, {});
  assert.equal(where.OR, undefined);
  await controller.list({ user: office }, { departmentId: 'kt' });
  assert.deepEqual(where.OR, [{ departmentId: 'kt' }, { coordinators: { some: { departmentId: 'kt' } } }]);
});

function mutationFixture() {
  let state = [task('one'), task('two')];
  const audits: any[] = [];
  const coordination: any[] = [];
  const tx = {
    framework: { findFirst: async () => framework }, department: { count: async (args: any) => Array.isArray(args.where.id?.in) ? args.where.id.in.length : 1 },
    target: {
      findFirst: async (args: any) => state.find(row => row.id === args.where.id && row.frameworkId === args.where.frameworkId) ?? null,
      updateMany: async (args: any) => { const row = state.find(row => row.id === args.where.id && row.version === args.where.version); if (!row) return { count: 0 }; const data = Object.fromEntries(Object.entries(args.data).filter(([, value]) => value !== undefined)); Object.assign(row, data, { version: row.version + 1 }); return { count: 1 }; },
      findUniqueOrThrow: async (args: any) => state.find(row => row.id === args.where.id),
    }, targetCoordinator: { deleteMany: async (args: any) => { coordination.push(args); }, createMany: async (args: any) => { coordination.push(args); } },
    auditLog: { create: async (args: any) => { audits.push(args); } }, workEvent: { create: async () => ({}) },
    user: { findMany: async () => [] }, notification: { createMany: async () => ({ count: 0 }) },
  };
  const prisma = { ...tx, systemSetting: { findUnique: async () => ({ dispatchMode: 'OFFICE' }) }, $transaction: async (callback: any) => { const before = structuredClone(state); const auditLength = audits.length; try { return await callback(tx); } catch (error) { state = before; audits.length = auditLength; throw error; } } };
  return { controller: new DirectivesController(prisma as any, limiter as any), state: () => state, audits, coordination };
}

test('giao phòng hàng loạt là nguyên tử khi một dòng xung đột phiên bản', async () => {
  const fixture = mutationFixture();
  await assert.rejects(fixture.controller.bulk({ user: office }, 'fw', { tasks: [{ id: 'one', expectedVersion: 1 }, { id: 'two', expectedVersion: 999 }], departmentId: 'vp' }), ConflictException);
  assert.ok(fixture.state().every(row => row.departmentId === 'kt' && row.version === 1));
  assert.equal(fixture.audits.length, 0);
});

test('đổi phòng chủ trì bỏ người phụ trách cũ, bỏ chính phòng chủ trì khỏi phối hợp và lưu dấu người giao', async () => {
  const fixture = mutationFixture();
  const result = await fixture.controller.editTask({ user: office }, 'fw', 'one', { expectedVersion: 1, departmentId: 'vp', coordinatorDepartmentIds: ['vp', 'kt'] });
  assert.equal(result.assigneeId, null);
  assert.equal(result.assignedAt, null);
  assert.equal(result.dispatchedById, office.id);
  assert.equal(result.dispatchedByName, office.fullName);
  assert.ok(result.dispatchedAt instanceof Date);
  assert.deepEqual(fixture.coordination[1], { data: [{ targetId: 'one', departmentId: 'kt' }] });
  assert.equal(fixture.audits.length, 1);
  assert.equal(JSON.stringify(fixture.audits).includes('Rà soát hồ sơ'), false);
});

test('khôi phục văn bản chỉ khôi phục nhiệm vụ bị lưu trữ cùng văn bản', async () => {
  let restored: any;
  const tx = { framework: { findFirst: async () => ({ ...framework, isActive: false }), updateMany: async () => ({ count: 1 }), findUniqueOrThrow: async () => framework }, target: { updateMany: async (args: any) => { restored = args; } }, auditLog: { create: async () => ({}) } };
  const prisma = { systemSetting: { findUnique: async () => ({ dispatchMode: 'LEADER' }) }, $transaction: async (callback: any) => callback(tx) };
  const controller = new DirectivesController(prisma as any, limiter as any);
  await controller.update({ user: leader }, 'fw', { expectedVersion: 1, isActive: true });
  assert.deepEqual(restored.where, { frameworkId: 'fw', isArchived: true, archiveReason: 'Lưu trữ văn bản chỉ đạo' });
  assert.equal(restored.data.isArchived, false);
  assert.equal(restored.data.isPublic, false);
  assert.deepEqual(restored.data.publicationVersion, { increment: 1 });
});
