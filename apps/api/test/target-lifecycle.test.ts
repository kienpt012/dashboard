import assert from 'node:assert/strict';
import test from 'node:test';
import { archiveTargetData, restoreTargetData } from '../src/target-lifecycle';

test('lưu trữ chỉ tiêu giữ dấu vết và ngừng công khai', () => {
  const archivedAt = new Date('2026-07-15T08:00:00.000Z');
  assert.deepEqual(archiveTargetData('admin-1', '  Kết thúc kỳ kế hoạch  ', archivedAt), {
    isArchived: true,
    archivedAt,
    archivedBy: 'admin-1',
    archiveReason: 'Kết thúc kỳ kế hoạch',
    isPublic: false,
  });
});

test('khôi phục chỉ tiêu về trạng thái nội bộ để kiểm tra trước khi công bố lại', () => {
  assert.deepEqual(restoreTargetData(), {
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
    archiveReason: null,
    isPublic: false,
  });
});
