import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Role } from '@prisma/client';
import { copilotRead } from '../src/copilot-read-tools';
import { ruleBasedPlan } from '../src/copilot';

test('Jarvis định tuyến đủ năm câu nghiệp vụ mới', () => {
  assert.deepEqual(ruleBasedPlan('hôm nay lãnh đạo có lịch gì'), { intent: 'LEADER_SCHEDULE', scheduleRange: 'today' });
  assert.equal(ruleBasedPlan('tuần này lãnh đạo có lịch gì').scheduleRange, 'week');
  assert.equal(ruleBasedPlan('văn bản chỉ đạo nào còn nhiệm vụ quá hạn').intent, 'OVERDUE_DIRECTIVES');
  assert.equal(ruleBasedPlan('phòng nào đang chậm nhất').intent, 'SLOW_DEPARTMENTS');
  assert.equal(ruleBasedPlan('chỉ tiêu nào có nguy cơ trễ').intent, 'FORECAST_RISK');
  assert.equal(ruleBasedPlan('tôi có note nào chưa xem').intent, 'UNREAD_NOTES');
});

for (const role of Object.values(Role)) {
  const actor = { id: `u-${role}`, username: role, fullName: role, role, isActive: true, departmentId: 'own', department: { id: 'own', name: 'Phòng tôi', code: 'OWN', isActive: true } };
  test(`Jarvis ${role}: chỉ đọc note chính người hỏi, không đánh dấu đã xem`, async () => {
    let where: any;
    const prisma = { deskNote: { findMany: async (args: any) => { where = args.where; return [{ id: 'n', content: 'Rà soát hồ sơ', author: { fullName: 'Chánh Văn phòng' } }]; } } };
    const result = await copilotRead(prisma as any, actor, 'UNREAD_NOTES', { year: 2026 });
    assert.deepEqual(where, { recalledAt: null, recipients: { some: { userId: actor.id, hiddenAt: null, seenAt: null } } });
    assert.match(result.reply, /Chánh Văn phòng: Rà soát hồ sơ/);
  });
  for (const enabled of [false, true]) test(`Jarvis ${role}: thống kê nhiệm vụ theo phạm vi đọc liên phòng=${enabled}`, async () => {
    let where: any;
    const prisma = { systemSetting: { findUnique: async () => ({ crossDepartmentView: enabled, dispatchMode: 'LEADER' }) }, department: { count: async () => 1 }, framework: { findMany: async () => [] }, target: { findMany: async (args: any) => { where = args.where; return []; } } };
    const global = ['ADMIN', 'LEADER', 'CLERK'].includes(role);
    for (const intent of ['OVERDUE_DIRECTIVES', 'SLOW_DEPARTMENTS'] as const) {
      await copilotRead(prisma as any, actor, intent, { year: 2026, scope: 'all' });
      assert.equal(Boolean(where.OR), !global && !enabled);
      if (!global && !enabled) await assert.rejects(copilotRead(prisma as any, actor, intent, { year: 2026, departmentId: 'other' }));
    }
  });
  test(`Jarvis ${role}: lịch hôm nay/tuần này cùng quyền đọc lịch nội bộ`, async () => {
    const entries = ['2026-11-09', '2026-11-10'].map(date => ({ id: date, date: new Date(date), session: 'AM', startTime: '08:00', content: 'Họp giao ban', leader: 'Chủ tịch', location: null, participants: null, isPublic: false, sortOrder: 0 }));
    const prisma = { department: { findUnique: async () => ({ isActive: true, kind: 'SPECIALIZED' }) }, workSchedule: { findUnique: async () => ({ id: 'week', weekStart: new Date('2026-11-09'), entries }) } };
    const today = await copilotRead(prisma as any, actor, 'LEADER_SCHEDULE', { year: 2026, scheduleRange: 'today' }, new Date('2026-11-09T02:00:00Z'));
    assert.match(today.reply, /2026-11-09/); assert.doesNotMatch(today.reply, /2026-11-10/);
    const week = await copilotRead(prisma as any, actor, 'LEADER_SCHEDULE', { year: 2026, scheduleRange: 'week' }, new Date('2026-11-09T02:00:00Z'));
    assert.match(week.reply, /2026-11-10/);
  });
}
