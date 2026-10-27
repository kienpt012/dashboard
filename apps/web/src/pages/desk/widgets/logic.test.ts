import assert from 'node:assert/strict';
import test from 'node:test';
import type { AlertItem } from '@/types/domain';
import { filterAlerts, groupDeadlines, periodOrder, seriesTable, shortPeriod, workSections } from './logic';

const alert = (kind: string, severity: AlertItem['severity']): AlertItem => ({ kind, severity, title: kind, detail: '' });

test('cảnh báo: lọc theo loại và mức độ tối thiểu, giữ thứ tự máy chủ', () => {
  const list = [alert('OVERDUE', 'critical'), alert('MISSING_REPORT', 'warning'), alert('REPORT_PENDING', 'info'), alert('AT_RISK', 'warning')];
  assert.deepEqual(filterAlerts(list, { kinds: [], minSeverity: 'info' }).map(item => item.kind), ['OVERDUE', 'MISSING_REPORT', 'REPORT_PENDING', 'AT_RISK']);
  assert.deepEqual(filterAlerts(list, { kinds: [], minSeverity: 'warning' }).map(item => item.kind), ['OVERDUE', 'MISSING_REPORT', 'AT_RISK']);
  assert.deepEqual(filterAlerts(list, { kinds: [], minSeverity: 'critical' }).map(item => item.kind), ['OVERDUE']);
  assert.deepEqual(filterAlerts(list, { kinds: ['AT_RISK', 'REPORT_PENDING'], minSeverity: 'info' }).map(item => item.kind), ['REPORT_PENDING', 'AT_RISK']);
});

test('hạn sắp tới: nhóm quá hạn, hôm nay, ngày mai, trong 7 ngày, sau đó theo giờ Việt Nam; bỏ hạn ngoài khung xem trước', () => {
  const now = new Date('2026-10-27T20:00:00+07:00');
  const at = (value: string, overdue = false) => ({ at: new Date(value).toISOString(), overdue, title: value });
  const groups = groupDeadlines(
    [
      at('2026-10-20T10:00:00+07:00', true),
      at('2026-10-27T23:30:00+07:00'),
      at('2026-10-28T00:30:00+07:00'),
      at('2026-11-02T09:00:00+07:00'),
      at('2026-11-20T09:00:00+07:00'),
      at('2026-12-20T09:00:00+07:00'),
    ],
    30,
    now,
  );
  assert.deepEqual(
    groups.map(group => [group.key, group.items.length]),
    [['overdue', 1], ['today', 1], ['tomorrow', 1], ['week', 1], ['later', 1]],
  );
  assert.equal(groups[0].label, 'Quá hạn');
});

test('kỳ báo cáo: sắp theo thời điểm kết thúc kỳ, kỳ ngắn trước khi trùng; nhãn trục gọn', () => {
  const keys = ['2026', '2026-Q3', '2026-M09', '2026-H1', '2026-M01'];
  assert.deepEqual([...keys].sort((a, b) => periodOrder(a) - periodOrder(b)), ['2026-M01', '2026-H1', '2026-M09', '2026-Q3', '2026']);
  assert.equal(shortPeriod('2026-M09', false), 'T9');
  assert.equal(shortPeriod('2026-M09', true), 'T9/26');
  assert.equal(shortPeriod('2026-Q3', false), 'Q3');
  assert.equal(shortPeriod('2026-H2', false), '6T cuối');
  assert.equal(shortPeriod('2026', false), '2026');
});

test('biểu đồ chỉ tiêu: gộp kỳ của các chỉ tiêu, chỗ thiếu để trống; cùng đơn vị giữ số thật', () => {
  const table = seriesTable([
    { id: 'a', code: 'A', title: 'Thu ngân sách', unit: 'tỷ đồng', targetValue: 100, points: [{ periodKey: '2026-Q1', value: 20 }, { periodKey: '2026-Q2', value: 45 }] },
    { id: 'b', code: 'B', title: 'Chi đầu tư', unit: 'tỷ đồng', targetValue: 80, points: [{ periodKey: '2026-Q2', value: 30 }] },
  ]);
  assert.equal(table.normalized, false);
  assert.deepEqual(table.keys, ['2026-Q1', '2026-Q2']);
  assert.deepEqual(table.rows.map(row => row.values), [[20, 45], [null, 30]]);
  assert.deepEqual(table.rows.map(row => row.plan), [100, 80]);
});

test('biểu đồ chỉ tiêu: khác đơn vị thì quy về % kế hoạch để so được; kế hoạch 0 không chia', () => {
  const table = seriesTable([
    { id: 'a', code: 'A', title: 'Thu ngân sách', unit: 'tỷ đồng', targetValue: 200, points: [{ periodKey: '2026-M01', value: 50 }] },
    { id: 'b', code: 'B', title: 'Hộ nghèo', unit: 'hộ', targetValue: 0, points: [{ periodKey: '2026-M01', value: 12 }] },
  ]);
  assert.equal(table.normalized, true);
  assert.deepEqual(table.rows[0].values, [25]);
  assert.deepEqual(table.rows[1].values, [null]);
  assert.deepEqual(table.rows.map(row => row.plan), [100, null]);
});

test('việc của tôi: mặc định chỉ mục có việc; chọn mục thì hiện đúng mục đã chọn kể cả khi trống', () => {
  const counts = { needReport: 2, toReview: 0, explanations: 1, proposals: 0 };
  assert.deepEqual(workSections(counts, []), ['needReport', 'explanations']);
  assert.deepEqual(workSections(counts, ['toReview', 'needReport']), ['needReport', 'toReview']);
  assert.deepEqual(workSections({ needReport: 0, toReview: 0, explanations: 0, proposals: 0 }, []), []);
});
