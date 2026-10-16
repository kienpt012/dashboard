import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { FeedbackController } from '../src/feedback';
import type { PrismaService } from '../src/prisma.service';

const department = { id: 'dept-a', code: 'VP', name: 'Văn phòng', isActive: true };
function request(role: Role) {
  return { user: { id: 'user-a', username: 'user', fullName: 'Cán bộ', role,
    isActive: true, departmentId: department.id, department } };
}

function fixture() {
  const calls: { list: any[]; count: any[] } = { list: [], count: [] };
  const controller = new FeedbackController({
    feedback: {
      findMany: async (args: any) => {
        calls.list.push(args);
        return [{ id: 'feedback-a', code: 'PA-2026-12345678', title: 'Tiêu đề cần bảo mật',
          submitterName: 'Nguyễn Văn A', submitterPhone: '0912345678', lookupSecretHash: 'secret-hash' }];
      },
      count: async (args: any) => { calls.count.push(args); return 1; },
    },
  } as unknown as PrismaService);
  function list(role: Role, sort?: string, search?: string) {
    return controller.list(request(role), undefined, undefined, undefined, undefined, search,
      undefined, undefined, undefined, undefined, undefined, sort);
  }
  return { calls, list };
}

test('R23: VIEWER không được sắp xếp tiêu đề ẩn, trả 400 trước mọi truy vấn', async () => {
  for (const sort of ['title', 'title:asc', 'title:desc']) {
    const { calls, list } = fixture();
    await assert.rejects(list(Role.VIEWER, sort), error => {
      assert.ok(error instanceof BadRequestException);
      assert.equal(error.getStatus(), 400);
      assert.equal(error.message, 'Thứ tự sắp xếp không hợp lệ');
      return true;
    });
    assert.equal(calls.list.length, 0);
    assert.equal(calls.count.length, 0);
  }
});

test('R23: VIEWER vẫn dùng sắp xếp hợp lệ, tìm theo mã và nhận dữ liệu đã che', async () => {
  for (const [sort, expected] of [
    [undefined, [{ createdAt: 'desc' }, { id: 'desc' }]],
    ['createdAt:asc', [{ createdAt: 'asc' }, { id: 'asc' }]],
    ['dueAt:asc', [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }, { id: 'desc' }]],
    ['priority:desc', [{ priority: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }]],
    ['status:asc', [{ status: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }]],
  ] as const) {
    const { calls, list } = fixture();
    const result = await list(Role.VIEWER, sort, 'PA-2026');
    assert.deepEqual(calls.list[0].orderBy, expected);
    assert.deepEqual(calls.list[0].where.OR, [{ code: { contains: 'PA-2026', mode: 'insensitive' } }]);
    assert.equal(calls.list[0].where.departmentId, department.id);
    assert.equal(result.items[0].title, 'Phản ánh trong phạm vi đơn vị');
    assert.equal('lookupSecretHash' in result.items[0], false);
  }
});

test('R23: vai trò được đọc tiêu đề giữ sắp xếp theo tiêu đề', async () => {
  for (const role of [Role.ADMIN, Role.LEADER, Role.CLERK, Role.MANAGER, Role.STAFF]) {
    const { calls, list } = fixture();
    const result = await list(role, 'title:desc');
    assert.deepEqual(calls.list[0].orderBy, [{ title: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }]);
    assert.equal(result.items[0].title, 'Tiêu đề cần bảo mật');
    assert.equal('lookupSecretHash' in result.items[0], false);
  }
});
