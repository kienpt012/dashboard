import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { TargetDirection, TargetStatus } from '@prisma/client';
import { calculateProgress, evaluateTarget } from '../src/metrics';
import { currentVietnamYear, parsePlanningDueDate } from '../src/planning-date';

test('chỉ tiêu càng cao càng tốt tính và chặn tiến độ trong 0-100', () => {
  assert.equal(calculateProgress(100, 62), 62);
  assert.equal(calculateProgress(100, 150), 100);
  assert.equal(calculateProgress(100, -10), 0);
});

test('chỉ tiêu càng thấp càng tốt hoàn thành khi giá trị không vượt mục tiêu', () => {
  assert.equal(calculateProgress(24, 30, TargetDirection.LOWER_IS_BETTER), 80);
  assert.equal(calculateProgress(24, 24, TargetDirection.LOWER_IS_BETTER), 100);
  assert.equal(calculateProgress(24, 10, TargetDirection.LOWER_IS_BETTER), 100);
});

test('chưa có báo cáo luôn là chưa bắt đầu dù giá trị mặc định bằng không', () => {
  assert.deepEqual(evaluateTarget({ targetValue: 100, currentValue: 0, hasReport: false }), {
    progress: 0,
    status: TargetStatus.NOT_STARTED,
    completed: false,
  });
});

test('hoàn thành được ưu tiên hơn kiểm tra quá hạn', () => {
  const result = evaluateTarget({
    targetValue: 100,
    currentValue: 100,
    hasReport: true,
    dueDate: '2020-01-01T00:00:00.000Z',
    now: new Date('2026-01-01T00:00:00.000Z'),
  });
  assert.equal(result.status, TargetStatus.COMPLETED);
});

test('chưa đạt và qua hạn được đánh dấu quá hạn', () => {
  const result = evaluateTarget({
    targetValue: 100,
    currentValue: 90,
    hasReport: true,
    dueDate: '2025-12-31T00:00:00.000Z',
    now: new Date('2026-01-01T00:00:00.000Z'),
  });
  assert.equal(result.status, TargetStatus.OVERDUE);
});

test('ngưỡng rủi ro phân biệt đúng tiến độ và có rủi ro', () => {
  assert.equal(evaluateTarget({ targetValue: 100, currentValue: 70, hasReport: true, riskThreshold: 70 }).status, TargetStatus.ON_TRACK);
  assert.equal(evaluateTarget({ targetValue: 100, currentValue: 69, hasReport: true, riskThreshold: 70 }).status, TargetStatus.AT_RISK);
});

test('hạn kế hoạch chỉ quá hạn sau khi kết thúc ngày tại Việt Nam', () => {
  const dueDate = parsePlanningDueDate('2026-07-15');
  assert.equal(dueDate.toISOString(), '2026-07-15T16:59:59.999Z');
  assert.equal(evaluateTarget({
    targetValue: 100,
    currentValue: 50,
    hasReport: true,
    dueDate,
    now: new Date('2026-07-15T16:59:59.998Z'),
  }).status, TargetStatus.AT_RISK);
  assert.equal(evaluateTarget({
    targetValue: 100,
    currentValue: 50,
    hasReport: true,
    dueDate,
    now: new Date('2026-07-15T17:00:00.000Z'),
  }).status, TargetStatus.OVERDUE);
});

test('ngày lịch không tồn tại trả lỗi yêu cầu 400', () => {
  assert.throws(
    () => parsePlanningDueDate('2026-02-30'),
    (error: unknown) => error instanceof BadRequestException && error.getStatus() === 400,
  );
});

test('năm mặc định dùng múi giờ Việt Nam tại thời điểm giao thừa', () => {
  assert.equal(currentVietnamYear(new Date('2026-12-31T16:59:59.999Z')), 2026);
  assert.equal(currentVietnamYear(new Date('2026-12-31T17:00:00.000Z')), 2027);
});
