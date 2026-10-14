import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Role } from '@prisma/client';
import { assertDepartmentAccess, canSuperviseDepartment, isGlobalRole, isLeadership, resolveDepartmentScope, type Actor } from '../src/access';
import { DocumentsController } from '../src/documents';
import { FeedbackController } from '../src/feedback';
import { ImportController } from '../src/import';
import { TargetsController } from '../src/targets';

// Quyền của hai vai trò mới ở các phân hệ có từ bản 1 (D-014): lãnh đạo UBND làm được mọi việc nghiệp vụ như quản trị,
// văn thư tiếp nhận văn bản và chuyển phản ánh nhưng không xử lý thay phòng chuyên môn, không báo cáo số liệu.

function rolesOf(controller: { prototype: object }, method: string): string[] {
  const handler = (controller.prototype as Record<string, unknown>)[method];
  assert.equal(typeof handler, 'function', `Không tìm thấy hàm ${method}`);
  return (Reflect.getMetadata('roles', handler as object) as string[] | undefined) ?? [];
}

function actor(role: Role, departmentId: string | null = null): Actor {
  return { id: `${role}-1`, username: role.toLowerCase(), fullName: role, role, isActive: true, departmentId, department: departmentId ? { id: departmentId, isActive: true } : null } as unknown as Actor;
}

test('văn thư và lãnh đạo UBND được tải văn bản và chạy trích xuất AI', () => {
  for (const handlerName of ['upload', 'reExtract', 'cancelExtractionJob']) {
    const roles = rolesOf(DocumentsController, handlerName);
    assert.ok(roles.includes(Role.CLERK), `${handlerName} phải cho văn thư`);
    assert.ok(roles.includes(Role.LEADER), `${handlerName} phải cho lãnh đạo`);
    assert.ok(!roles.includes(Role.VIEWER), `${handlerName} không được cho người xem`);
  }
});

test('văn thư chỉ tiếp nhận, phân loại, chuyển phản ánh — không xử lý, không kết luận, không công bố', () => {
  for (const method of ['triage', 'assign', 'assignees']) {
    assert.ok(rolesOf(FeedbackController, method).includes(Role.CLERK), `văn thư phải được ${method}`);
  }
  for (const method of ['start', 'addMessage', 'submitResolution', 'review', 'close', 'reject', 'publish', 'reopen']) {
    assert.ok(!rolesOf(FeedbackController, method).includes(Role.CLERK), `văn thư không được ${method}`);
  }
});

test('lãnh đạo UBND xử lý, duyệt, công bố phản ánh như quản trị', () => {
  for (const method of ['triage', 'assign', 'start', 'submitResolution', 'review', 'close', 'reject', 'publish', 'reopen', 'publicationPreview']) {
    assert.ok(rolesOf(FeedbackController, method).includes(Role.LEADER), `lãnh đạo phải được ${method}`);
  }
});

test('lãnh đạo nhập Excel được duyệt thẳng; văn thư không nhập số liệu', () => {
  const methods = Object.getOwnPropertyNames(ImportController.prototype).filter(name => name !== 'constructor');
  const guarded = methods.filter(name => rolesOf(ImportController, name).length);
  assert.ok(guarded.length >= 3);
  for (const method of guarded) {
    const roles = rolesOf(ImportController, method);
    assert.ok(roles.includes(Role.LEADER), `${method} phải cho lãnh đạo`);
    assert.ok(!roles.includes(Role.CLERK), `${method} không được cho văn thư`);
  }
  assert.equal(isLeadership(actor(Role.LEADER)), true);
  assert.equal(isLeadership(actor(Role.CLERK)), false);
  assert.equal(isLeadership(actor(Role.MANAGER, 'd1')), false);
});

test('văn thư không báo cáo số liệu; lãnh đạo và trưởng phòng duyệt báo cáo', () => {
  assert.ok(!rolesOf(TargetsController, 'progress').includes(Role.CLERK));
  assert.ok(rolesOf(TargetsController, 'progress').includes(Role.LEADER));
  const roles = rolesOf(TargetsController, 'review');
  assert.ok(roles.includes(Role.LEADER) && roles.includes(Role.MANAGER) && !roles.includes(Role.CLERK));
});

test('phạm vi dữ liệu: lãnh đạo, văn thư toàn địa phương; trưởng phòng không vượt phòng mình', () => {
  assert.equal(isGlobalRole(Role.LEADER), true);
  assert.equal(isGlobalRole(Role.CLERK), true);
  assert.equal(resolveDepartmentScope(actor(Role.CLERK)), undefined);
  assert.equal(resolveDepartmentScope(actor(Role.LEADER), 'd2'), 'd2');
  assert.doesNotThrow(() => assertDepartmentAccess(actor(Role.CLERK), 'd2'));
  assert.throws(() => assertDepartmentAccess(actor(Role.MANAGER, 'd1'), 'd2'));
  // Giám sát (giao việc, đánh giá) chỉ dành cho lãnh đạo và trưởng phòng đúng phòng — văn thư không giám sát.
  assert.equal(canSuperviseDepartment(actor(Role.LEADER), 'd2'), true);
  assert.equal(canSuperviseDepartment(actor(Role.CLERK), 'd2'), false);
  assert.equal(canSuperviseDepartment(actor(Role.MANAGER, 'd1'), 'd1'), true);
  assert.equal(canSuperviseDepartment(actor(Role.MANAGER, 'd1'), 'd2'), false);
});
