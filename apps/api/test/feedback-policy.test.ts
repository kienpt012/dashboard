import assert from 'node:assert/strict';
import test from 'node:test';
import { feedbackCodeYear } from '../src/feedback';

test('mã phản ánh dùng năm lịch Việt Nam tại biên giao thừa', () => {
  assert.equal(feedbackCodeYear(new Date('2026-12-31T16:59:59.999Z')), 2026);
  assert.equal(feedbackCodeYear(new Date('2026-12-31T17:00:00.000Z')), 2027);
});
