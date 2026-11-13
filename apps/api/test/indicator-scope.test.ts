import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { FrameworkKind, Role } from '@prisma/client';
import { isIndicator, isPerformanceIndicator } from '../src/indicator-scope';
import { DirectivesController } from '../src/directives';

test('thêm hoặc bỏ nhiệm vụ không thay đổi tổng số chỉ tiêu và tập tính tiến độ', () => {
  const indicators = [FrameworkKind.PLAN, FrameworkKind.SCORE, FrameworkKind.STAT];
  for (const taskCount of [0, 1, 30, 100]) {
    const rows = [...indicators, ...Array(taskCount).fill(FrameworkKind.TASK)];
    assert.deepEqual(rows.filter(isIndicator), indicators);
    assert.deepEqual(rows.filter(isPerformanceIndicator), [FrameworkKind.PLAN, FrameworkKind.SCORE]);
  }
});

for (const role of Object.values(Role)) for (const enabled of [true, false]) {
  test(`${role}: văn bản và việc tháng dùng quyền đọc liên phòng=${enabled}, không mở quyền ghi`, async () => {
    const actor = { id: 'u', username: 'u', fullName: 'Người thử', role, isActive: true, departmentId: 'own', department: { id: 'own', name: 'Phòng tôi', code: 'OWN', isActive: true, kind: 'SPECIALIZED' } };
    const queries: any[] = [];
    const prisma = {
      systemSetting: { findUnique: async () => ({ crossDepartmentView: enabled, dispatchMode: 'LEADER' }) },
      department: { count: async () => 1, findUnique: async () => ({ name: 'Phòng khác' }) },
      framework: { findMany: async () => [] }, target: { findMany: async (args: any) => { queries.push(args); return []; } },
    };
    const controller = new DirectivesController(prisma as any, { consume() {} } as any);
    const global = ['ADMIN', 'LEADER', 'CLERK'].includes(role);
    if (global || enabled) {
      await controller.list({ user: actor }, { departmentId: 'other', scope: 'all' });
      await controller.monthly({ user: actor }, { month: '2026-11', departmentId: 'other', scope: 'all' });
      assert.ok(queries.every(query => query.where.OR[0].departmentId === 'other'));
    } else {
      await assert.rejects(controller.list({ user: actor }, { departmentId: 'other' }));
      await assert.rejects(controller.monthly({ user: actor }, { month: '2026-11', departmentId: 'other' }));
    }
    if (!['ADMIN', 'LEADER'].includes(role)) await assert.rejects(controller.addTask({ user: actor }, 'fw', { title: 'Nhiệm vụ', departmentId: 'other', dueDate: '2026-12-01' }), (error: any) => error.getStatus() === 403);
  });
}
