import assert from 'node:assert/strict';
import test from 'node:test';
import { alertTitle, type AlertKind } from '../src/alert-text';
const title = 'Tỷ lệ giải ngân vốn đầu tư công';
const expected: Record<AlertKind, string> = {
  OVERDUE: 'quá hạn 5 ngày', AT_RISK: 'có nguy cơ không đạt', MISSING_REPORT: 'thiếu báo cáo Tháng 10', REPORT_PENDING: 'chờ duyệt 5 ngày',
  UNASSIGNED: 'chưa giao người phụ trách', EXPLANATION_OVERDUE: 'quá hạn giải trình 5 ngày', STALLED: 'chuyển, trả 3 lần', DUE_SOON: 'sắp đến hạn báo cáo Tháng 10', PROPOSAL_PENDING: 'đề xuất chờ duyệt 5 ngày',
};
for (const [kind, status] of Object.entries(expected)) test(`mẫu câu cảnh báo ${kind}`, () => {
  assert.equal(alertTitle(title, kind as AlertKind, { days: 5, period: 'Tháng 10', count: 3 }), `${title} — ${status}`);
});
