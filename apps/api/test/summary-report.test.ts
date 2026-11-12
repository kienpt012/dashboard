import assert from 'node:assert/strict';
import test from 'node:test';
import { FrameworkKind, IssuingLevel, TargetDirection } from '@prisma/client';
import { buildSummaryWorkbook, summaryRows, SUMMARY_HEADER_ROW, SUMMARY_SHEET_NAME, type SummaryTarget, type SummaryUpdate } from '../src/summary-report';

function target(id: string, overrides: Partial<SummaryTarget> = {}): SummaryTarget {
  return {
    id, title: `Chỉ tiêu ${id}`, standardCode: null, groupName: 'Chỉ tiêu kinh tế', unit: '%', targetText: null,
    targetValue: 100, direction: TargetDirection.HIGHER_IS_BETTER, kind: FrameworkKind.PLAN,
    issuingLevel: IssuingLevel.LOCAL, ...overrides,
  };
}

function update(targetId: string, value: number, overrides: Partial<SummaryUpdate> = {}): SummaryUpdate {
  return { targetId, value, valueText: null, note: null, periodKey: null, createdAt: new Date('2026-03-10T00:00:00Z'), ...overrides };
}

test('Báo cáo tổng kết: gộp chỉ tiêu Đảng ủy và cấp trên theo mã số, lấy số luỹ kế đến hết kỳ', () => {
  const targets = [
    target('a', { standardCode: 'CT1', title: 'Tổng thu ngân sách', unit: 'tỷ', targetValue: 1133 }),
    target('b', { standardCode: 'CT40', groupName: 'Chỉ tiêu văn hoá - xã hội', targetText: 'Trên 95%', targetValue: 95 }),
    target('a-tp', { standardCode: 'ct1', title: 'Thu ngân sách', unit: 'tỷ', targetValue: 1100, issuingLevel: IssuingLevel.PROVINCE }),
    target('c', { title: 'Giảm hộ nghèo', targetValue: 1, direction: TargetDirection.LOWER_IS_BETTER }),
  ];
  const updates = [
    update('a', 500, { periodKey: '2026-M06' }),
    update('a', 1408.7, { periodKey: '2026-M09', note: 'Luỹ kế 1.408,7 tỷ/1.133 tỷ' }),
    update('a', 1500, { periodKey: '2026-M10' }),
    update('b', 83.3, { periodKey: '2026', valueText: '5/6 trường', createdAt: new Date('2026-09-20T00:00:00Z') }),
    update('b', 100, { periodKey: '2026', createdAt: new Date('2026-12-20T00:00:00Z') }),
  ];
  const rows = summaryRows(targets, updates, '2026-Q3');
  assert.deepEqual(rows.map(row => row.title), ['Tổng thu ngân sách', 'Giảm hộ nghèo', 'Chỉ tiêu b']);
  assert.deepEqual(rows[0], {
    group: 'Chỉ tiêu kinh tế', title: 'Tổng thu ngân sách', code: 'CT1', unit: 'tỷ', local: '1.133 tỷ', upper: '1.100 tỷ',
    cumulative: '1.408,7 tỷ', note: 'Luỹ kế 1.408,7 tỷ/1.133 tỷ; Đạt',
  });
  assert.deepEqual([rows[1].upper, rows[1].cumulative, rows[1].note], ['Không', '', '']);
  assert.deepEqual([rows[2].local, rows[2].cumulative, rows[2].note], ['Trên 95%', '5/6 trường', 'Chưa đạt']);
  // Báo cáo năm lấy lượt mới nhất của cả năm.
  assert.equal(summaryRows(targets, updates, '2026')[0].cumulative, '1.500 tỷ');
  assert.throws(() => summaryRows(targets, updates, 'sai'));
});

test('Báo cáo tổng kết: bảng theo mẫu Phụ lục 1, dòng nhóm số La Mã, STT liên tục, in ngang lặp tiêu đề', () => {
  const rows = summaryRows([
    target('a'), target('b', { groupName: '02. Văn hoá - xã hội' }), target('c', { groupName: '02. Văn hoá - xã hội' }),
  ], [], '2026-M09');
  const sheet = buildSummaryWorkbook({ rows, periodKey: '2026-M09', agencyName: 'Ủy ban nhân dân', localityName: 'Phường Lái Thiêu' })
    .getWorksheet(SUMMARY_SHEET_NAME)!;
  assert.equal(sheet.getCell('A2').value, 'PHƯỜNG LÁI THIÊU');
  assert.equal(sheet.getCell('A4').value, 'PHỤ LỤC 1');
  assert.match(String(sheet.getCell('A5').value), /THÁNG 9\/2026$/);
  assert.match(String(sheet.getCell('A6').value), /năm 2026 của UBND phường Lái Thiêu\)$/);
  const cells = (rowNumber: number) => (sheet.getRow(rowNumber).values as unknown[]).slice(1);
  assert.deepEqual(cells(SUMMARY_HEADER_ROW), ['STT', 'CHỈ TIÊU CHỦ YẾU', 'Mã số', 'Đơn vị tính', 'Chỉ tiêu Đảng ủy', 'Chỉ tiêu UBND TP', 'Luỹ kế đến hiện tại', 'Ghi chú']);
  assert.deepEqual(cells(9), ['I', 'CHỈ TIÊU KINH TẾ']);
  assert.deepEqual(cells(10).slice(0, 2), [1, 'Chỉ tiêu a']);
  assert.deepEqual(cells(11), ['II', 'VĂN HOÁ - XÃ HỘI']);
  assert.deepEqual([cells(12)[0], cells(13)[0]], [2, 3]);
  assert.equal(sheet.pageSetup.orientation, 'landscape');
  assert.equal(sheet.pageSetup.printTitlesRow, '8:8');
});
