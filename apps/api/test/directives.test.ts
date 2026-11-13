import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { monthlyPeriods, monthRange, parsePastedTasks, summarizeTasks, taskMetric, taskStatistics } from '../src/directives-logic';
import { parsePlanningDueDate } from '../src/planning-date';

const now = new Date('2026-11-13T04:00:00Z');
const make = (value: number, due: string, reported?: string) => ({ currentValue: value, targetValue: 100, direction: 'HIGHER_IS_BETTER' as const, lastReportedAt: reported ? new Date(reported) : null, dueDate: parsePlanningDueDate(due) });

test('dán danh sách nhận hạn cuối dòng, bỏ STT và kiểm tra ngày thật', () => {
  const items = parsePastedTasks('1. Rà soát hồ sơ trước 30/11/2026\n- Tổng hợp báo cáo trước 5/12/2026');
  assert.equal(items[0].title, 'Rà soát hồ sơ');
  assert.equal(items[0].dueDate.toISOString(), '2026-11-30T16:59:59.999Z');
  assert.equal(items[1].title, 'Tổng hợp báo cáo');
  assert.throws(() => parsePastedTasks('Rà soát trước 31/11/2026'));
  assert.throws(() => parsePastedTasks('Rà soát không có hạn'));
  assert.equal(parsePastedTasks('Rà soát hồ sơ', '2026-11-20').length, 1);
  assert.throws(() => parsePastedTasks(Array.from({ length: 101 }, () => 'Rà soát hồ sơ').join('\n'), '2026-11-20'));
});

test('nhiệm vụ theo hạn: chưa bắt đầu, đang làm, hoàn thành, quá hạn; đúng hết ngày Việt Nam', () => {
  assert.equal(taskMetric(make(0, '2026-11-13'), now).status, 'NOT_STARTED');
  assert.equal(taskMetric(make(0, '2026-11-12'), now).status, 'OVERDUE');
  assert.equal(taskMetric(make(20, '2026-11-20', '2026-11-10T00:00:00Z'), now).status, 'IN_PROGRESS');
  assert.equal(taskMetric(make(100, '2026-11-12', '2026-11-11T00:00:00Z'), now).status, 'COMPLETED');
});

test('thống kê dùng ngày nộp báo cáo đã duyệt, bỏ báo cáo bị từ chối và xử lý nhiệm vụ mở lại', () => {
  const base = make(100, '2026-11-10', '2026-11-12T00:00:00Z');
  const reopened = taskMetric({ ...base, updates: [
    { value: 100, createdAt: new Date('2026-11-09T00:00:00Z'), reviewedAt: now, reviewStatus: 'APPROVED' },
    { value: 60, createdAt: new Date('2026-11-10T00:00:00Z'), reviewedAt: now, reviewStatus: 'APPROVED' },
    { value: 100, createdAt: new Date('2026-11-12T00:00:00Z'), reviewedAt: now, reviewStatus: 'APPROVED' },
  ] }, now);
  assert.equal(reopened.completedLate, true);
  assert.equal(reopened.lateDays, 2);
  const onTime = taskMetric({ ...base, updates: [{ value: 100, createdAt: new Date('2026-11-10T08:00:00Z'), reviewedAt: now, reviewStatus: 'APPROVED' }] }, now);
  assert.equal(onTime.completedOnTime, true);
  const stats = taskStatistics([reopened, onTime, taskMetric(make(0, '2026-11-11'), now)]);
  assert.deepEqual(stats, { total: 3, completedOnTime: 1, completedLate: 1, inProgress: 0, notStarted: 0, overdue: 1, completionRate: 66.7, averageLateDays: 2 });
});

test('việc theo tháng dùng kỳ báo cáo thật, không tạo kỳ quý trong tháng 11', () => {
  const base = { year: 2026, reportDueDay: 20, createdAt: new Date('2026-01-01T00:00:00Z') };
  assert.equal(monthlyPeriods({ ...base, frequency: 'MONTHLY' }, '2026-11')[0].key, '2026-M11');
  assert.equal(monthlyPeriods({ ...base, frequency: 'QUARTERLY' }, '2026-11').length, 0);
  assert.equal(monthlyPeriods({ ...base, frequency: 'QUARTERLY' }, '2026-12')[0].key, '2026-Q4');
  assert.equal(monthRange('2026-11').start.toISOString(), '2026-10-31T17:00:00.000Z');
  assert.throws(() => monthRange('2026-13'));
});

test('tổng hợp chỉ đếm nhiệm vụ chưa hoàn thành trong cửa sổ 7 ngày', () => {
  const tasks = [make(0, '2026-11-15'), make(100, '2026-11-15', '2026-11-12T00:00:00Z'), make(0, '2026-11-12')];
  assert.equal(summarizeTasks(tasks.map(task => taskMetric(task, now)), 1, now, tasks.map(task => task.dueDate)).dueSoon, 1);
});
