import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DepartmentKind, FrameworkKind, Role, TargetStatus } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { type Actor } from '../src/access';
import { canDecideCandidate, missingApprovalFields } from '../src/candidates';
import { assertTargetDefinitionAccess, dispatchScope, isDispatcher } from '../src/dispatch';
import { evaluateTarget } from '../src/metrics';
import { parsePlanningDueDate } from '../src/planning-date';
import { UpdateSystemSettingDto } from '../src/settings';
import { remindTaskDeadlines, taskDeadlineStage } from '../src/task-reminders';
import { TargetsController } from '../src/targets';
import { taskCandidateFields } from '../src/task-candidates';

function actor(username: string, role: Role, departmentId = 'economy', kind: DepartmentKind = DepartmentKind.SPECIALIZED): Actor {
  return { id: username, username, fullName: username, role, isActive: true, departmentId,
    department: { id: departmentId, code: departmentId, name: departmentId, isActive: true, kind } };
}

const office = actor('chanh.vp', Role.MANAGER, 'office', DepartmentKind.OFFICE);
const manager = actor('lan.anh', Role.MANAGER);
const clerk = actor('van.thu', Role.CLERK, 'office', DepartmentKind.OFFICE);
const leader = actor('chu.tich', Role.LEADER);
const staff = actor('thao.ktht', Role.STAFF);
const viewer = actor('viewer.ktht', Role.VIEWER);

test('ma trận người phân việc ở hai chế độ, không suy quyền từ tên tài khoản hoặc mã phòng', () => {
  for (const mode of ['LEADER', 'OFFICE'] as const) {
    for (const user of [office, manager, clerk, leader, staff, viewer, actor('admin', Role.ADMIN)]) {
      assert.equal(isDispatcher(user, { dispatchMode: mode }), user.role === Role.ADMIN || user.role === Role.LEADER || (mode === 'OFFICE' && user === office), `${mode}/${user.username}`);
    }
  }
  assert.equal(isDispatcher(office, null), false);
  assert.equal(isDispatcher({ ...office, isActive: false }, { dispatchMode: 'OFFICE' }), false);
  assert.equal(isDispatcher({ ...office, department: { ...office.department!, isActive: false } }, { dispatchMode: 'OFFICE' }), false);
  assert.equal(isDispatcher({ ...office, department: { ...office.department!, kind: DepartmentKind.OTHER } }, { dispatchMode: 'OFFICE' }), false);
  assert.equal(isDispatcher({ ...office, departmentId: 'different' }, { dispatchMode: 'OFFICE' }), false);
});

test('Chánh Văn phòng duyệt mọi phòng ở OFFICE nhưng không tự duyệt; trưởng phòng giữ phạm vi cũ', () => {
  const other = { responsibleDepartmentId: 'social', proposedById: staff.id };
  assert.equal(canDecideCandidate(office, other, { dispatchMode: 'OFFICE' }), true);
  assert.equal(canDecideCandidate(office, other, { dispatchMode: 'LEADER' }), false);
  assert.equal(canDecideCandidate(office, { ...other, proposedById: office.id }, { dispatchMode: 'OFFICE' }), false);
  assert.equal(canDecideCandidate(leader, { ...other, proposedById: leader.id }, { dispatchMode: 'OFFICE' }), true);
  assert.equal(canDecideCandidate(manager, other, { dispatchMode: 'OFFICE' }), false);
  assert.equal(canDecideCandidate(manager, { ...other, responsibleDepartmentId: manager.departmentId }, { dispatchMode: 'LEADER' }), true);
  for (const user of [clerk, staff, viewer]) assert.equal(canDecideCandidate(user, other, { dispatchMode: 'OFFICE' }), false);
  assert.equal(dispatchScope(office, { dispatchMode: 'OFFICE' }, 'social'), 'social');
  assert.throws(() => dispatchScope(office, { dispatchMode: 'LEADER' }, 'social'), ForbiddenException);
});

test('quyền phân việc chỉ mở sửa TASK thuộc bộ TASK, không mở chỉ tiêu thường', async () => {
  const client = { systemSetting: { findUnique: async () => ({ dispatchMode: 'OFFICE' }) }, framework: { findUnique: async () => ({ kind: FrameworkKind.TASK }) } };
  await assertTargetDefinitionAccess(client as any, office, { kind: FrameworkKind.TASK, frameworkId: 'directive' });
  await assert.rejects(assertTargetDefinitionAccess(client as any, office, { kind: FrameworkKind.PLAN, frameworkId: 'directive' }), ForbiddenException);
  await assert.rejects(assertTargetDefinitionAccess(client as any, office, { kind: FrameworkKind.TASK }), ForbiddenException);
  await assert.rejects(assertTargetDefinitionAccess(client as any, manager, { kind: FrameworkKind.TASK, frameworkId: 'directive' }), ForbiddenException);
});

test('DTO cấu hình chỉ nhận hai chế độ phân việc', async () => {
  for (const mode of ['LEADER', 'OFFICE']) assert.equal((await validate(plainToInstance(UpdateSystemSettingDto, { expectedVersion: 1, dispatchMode: mode }))).length, 0);
  assert.ok((await validate(plainToInstance(UpdateSystemSettingDto, { expectedVersion: 1, dispatchMode: 'STAFF' }))).some(error => error.property === 'dispatchMode'));
});

test('đề xuất thuộc bộ TASK được chuẩn hóa 100%, không yêu cầu kỳ báo cáo định kỳ', async () => {
  const tx = { framework: { findUnique: async () => ({ kind: FrameworkKind.TASK, isActive: true }) } };
  const fields = await taskCandidateFields(tx as any, { frameworkId: 'directive', targetKind: FrameworkKind.PLAN });
  assert.deepEqual(fields, { targetKind: FrameworkKind.TASK, unit: '%', targetValue: 100, frequency: 'YEARLY', direction: 'HIGHER_IS_BETTER' });
  assert.deepEqual(missingApprovalFields({ name: 'Kiểm tra công trình', unit: null, targetValue: null, frequency: null, targetYear: 2026, deadline: parsePlanningDueDate('2026-12-31'), responsibleDepartmentId: 'economy', targetKind: FrameworkKind.TASK }), []);
  await assert.rejects(taskCandidateFields({ framework: { findUnique: async () => ({ kind: FrameworkKind.PLAN, isActive: true }) } } as any, { frameworkId: 'plan', targetKind: FrameworkKind.TASK }), BadRequestException);
});

test('TASK theo hạn một lần: chưa bắt đầu, đang làm, quá hạn, hoàn thành', () => {
  const dueDate = parsePlanningDueDate('2026-11-20');
  const now = new Date('2026-11-19T03:00:00Z');
  const base = { kind: FrameworkKind.TASK, targetValue: 100, currentValue: 20, hasReport: true, dueDate, now };
  assert.equal(evaluateTarget({ ...base, currentValue: 0, hasReport: false }).status, TargetStatus.NOT_STARTED);
  assert.equal(evaluateTarget(base).status, TargetStatus.ON_TRACK);
  assert.equal(evaluateTarget({ ...base, now: new Date('2026-11-21T03:00:00Z') }).status, TargetStatus.OVERDUE);
  assert.equal(evaluateTarget({ ...base, currentValue: 100, now: new Date('2026-11-21T03:00:00Z') }).status, TargetStatus.COMPLETED);
});

test('mốc nhắc hạn bao gồm đúng 3 ngày, quá hạn sau cuối ngày Việt Nam', () => {
  const dueDate = parsePlanningDueDate('2026-11-20');
  const day = 86_400_000;
  assert.equal(taskDeadlineStage(dueDate, new Date(dueDate.getTime() - 3 * day - 1)), null);
  assert.equal(taskDeadlineStage(dueDate, new Date(dueDate.getTime() - 3 * day)), 'DUE_SOON');
  assert.equal(taskDeadlineStage(dueDate, dueDate), 'DUE_SOON');
  assert.equal(taskDeadlineStage(dueDate, new Date(dueDate.getTime() + 1)), 'OVERDUE');
  assert.equal(taskDeadlineStage(dueDate, new Date(dueDate.getTime() + 3 * day)), 'ESCALATED');
});

test('worker nhắc đúng người ở mỗi mốc, không lặp, bỏ việc hoàn thành và nhắc lại khi gia hạn', async () => {
  const dueDate = parsePlanningDueDate('2026-11-20');
  const tasks = [
    { id: 'assigned', title: 'Rà soát tiến độ giải ngân', dueDate, departmentId: 'economy', assigneeId: 'staff', currentValue: 30, targetValue: 100, direction: 'HIGHER_IS_BETTER', lastReportedAt: new Date() },
    { id: 'unassigned', title: 'Kiểm tra trật tự đô thị', dueDate, departmentId: 'economy', assigneeId: null, currentValue: 0, targetValue: 100, direction: 'HIGHER_IS_BETTER', lastReportedAt: null },
    { id: 'complete', title: 'Nhiệm vụ đã hoàn thành', dueDate, departmentId: 'economy', assigneeId: 'staff', currentValue: 100, targetValue: 100, direction: 'HIGHER_IS_BETTER', lastReportedAt: new Date() },
  ];
  const keys = new Set<string>();
  const messages: any[] = [];
  const events: any[] = [];
  const client = {
    target: { findMany: async () => tasks },
    user: { findMany: async ({ where }: any) => where.role === 'LEADER' ? [{ id: 'leader' }] : where.department ? [{ id: 'office' }] : [{ id: 'manager' }] },
    notification: { createMany: async ({ data }: any) => {
      let count = 0;
      for (const item of data) if (!keys.has(item.dedupeKey)) { keys.add(item.dedupeKey); messages.push(item); count += 1; }
      return { count };
    } },
    workEvent: { create: async ({ data }: any) => { events.push(data); return data; } },
  };
  const setting = { dispatchMode: 'OFFICE' } as const;
  const soon = new Date(dueDate.getTime() - 2 * 86_400_000);
  assert.deepEqual(await remindTaskDeadlines(client as any, setting, soon), { reminders: 2, escalations: 0 });
  assert.deepEqual(messages.map(row => row.userId).sort(), ['manager', 'staff']);
  assert.deepEqual(await remindTaskDeadlines(client as any, setting, soon), { reminders: 0, escalations: 0 });
  assert.deepEqual(await remindTaskDeadlines(client as any, setting, new Date(dueDate.getTime() + 1)), { reminders: 2, escalations: 0 });
  assert.deepEqual(await remindTaskDeadlines(client as any, setting, new Date(dueDate.getTime() + 3 * 86_400_000)), { reminders: 0, escalations: 2 });
  assert.deepEqual(await remindTaskDeadlines(client as any, setting, new Date(dueDate.getTime() + 4 * 86_400_000)), { reminders: 0, escalations: 0 });
  assert.equal(events.length, 2);
  assert.equal(messages.filter(row => row.kind === 'ESCALATED').length, 4);
  assert.ok(messages.every(row => !row.title.includes('CT-') && row.entityId !== 'complete'));
  tasks[0].dueDate = parsePlanningDueDate('2026-11-25');
  assert.equal((await remindTaskDeadlines(client as any, setting, new Date('2026-11-24T03:00:00Z'))).reminders, 1);
});

test('API báo cáo TASK chặn trên 100 và nội dung trống, không đòi kỳ báo cáo', async () => {
  const task = { id: 'task', kind: FrameworkKind.TASK, version: 1, isArchived: false, valueSource: 'MANUAL', title: 'Rà soát hồ sơ', departmentId: 'economy', year: 2026, frequency: 'YEARLY', unit: '%' };
  let created: any;
  const tx = {
    target: { findFirst: async () => task },
    progressUpdate: { findFirst: async () => null, create: async ({ data }: any) => { created = { ...data, id: 'report' }; return created; } },
    user: { findMany: async () => [{ id: 'manager' }] },
    notification: { createMany: async () => ({ count: 1 }) },
    workEvent: { create: async () => ({}) },
    auditLog: { create: async () => ({}) },
  };
  const controller = new TargetsController({ ...tx, $transaction: async (callback: any) => callback(tx) } as any);
  await assert.rejects(controller.progress('task', { baseVersion: 1, value: 101, note: 'Kết quả' }, { user: staff }), BadRequestException);
  await assert.rejects(controller.progress('task', { baseVersion: 1, value: 50, note: ' ' }, { user: staff }), BadRequestException);
  await controller.progress('task', { baseVersion: 1, value: 50, note: 'Đã rà soát hồ sơ' }, { user: staff });
  assert.equal(created.periodKey, null);
  assert.equal(created.reviewStatus, 'PENDING');
});
