import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { notificationTitle, presentNotifications } from '../src/notification-reference';
test('thông báo lịch sử bỏ mã hệ thống và đặt tên trước trạng thái', () => {
  assert.equal(notificationTitle('Bạn được giao phụ trách chỉ tiêu CT-2026-VP-001', 'ASSIGNED', 'Thu ngân sách'), 'Thu ngân sách — được giao phụ trách');
  assert.equal(notificationTitle('Chỉ tiêu CT-2026-VP-001 thiếu báo cáo Tháng 10', 'MISSING_REPORT', 'Thu ngân sách'), 'Thu ngân sách — thiếu báo cáo Tháng 10');
});
test('không bổ sung tham chiếu từ phòng không còn quyền xem', async () => {
  let where: any;
  const prisma = { systemSetting: { findUnique: async () => ({ crossDepartmentView: false }) }, target: { findMany: async (args: any) => { where = args.where; return []; } } };
  const actor = { id: 'u', username: 'u', fullName: 'Chuyên viên', role: 'STAFF', isActive: true, departmentId: 'own', department: { id: 'own', isActive: true } };
  const rows = await presentNotifications(prisma as any, actor as any, [{ entityType: 'Target', entityId: 'old-target', title: 'CT-2026-VP-001 quá hạn', body: null, kind: 'OVERDUE' }]);
  assert.equal(where.OR[0].departmentId, 'own');
  assert.ok(!('docRef' in rows[0]));
  assert.doesNotMatch(rows[0].title, /CT-2026/);
});
