import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeMissing, missingItems, numberedItems, recheckText } from '../src/extraction-completeness';

const prose = [
  '[Mục: Điều 3 > d) Chỉ tiêu cải cách hành chính]',
  '(21) Chỉ số PCI xếp hạng từ hạng 10 trở lên. (22) Chỉ số PAPI xếp hạng từ hạng 05 trở lên.',
  '(23) Hoàn thành 100% chỉ tiêu tuyển quân.',
  '(24) Tiếp tục thực hiện Nghị quyết số 05 của Thành ủy.',
].join('\n');

test('đủ mục: mục đánh số có số liệu mục tiêu là mục cần có đề xuất', () => {
  const items = numberedItems(prose, 'section');
  assert.deepEqual(items.map(item => item.ordinal), ['21', '22', '23']);
  assert.match(items[1].text, /^\(22\) Chỉ số PAPI/);
  // "(2)" giữa câu không phải mục.
  assert.deepEqual(numberedItems('Theo điểm (2) khoản 1 thì tỷ lệ đạt 90%.', 'section'), []);
});

test('đủ mục: mục không có đề xuất nào trích từ đó là mục thiếu', () => {
  const extracted = [
    { sourceQuote: 'Chỉ số PCI xếp hạng từ hạng 10 trở lên', targetValue: 10 },
    { sourceQuote: 'Hoàn thành 100% chỉ tiêu tuyển quân', targetValue: 100 },
  ];
  const missing = missingItems(prose, 'section', extracted);
  assert.deepEqual(missing.map(item => item.ordinal), ['22']);
  assert.equal(describeMissing(missing[0], 3), 'trang 3 mục (22): Chỉ số PAPI xếp hạng từ hạng 05 trở lên.');
  const text = recheckText(prose, 'section', missing);
  assert.match(text, /^\[Mục: Điều 3 > d\) Chỉ tiêu cải cách hành chính\]\n\(22\) Chỉ số PAPI/);
  assert.doesNotMatch(text, /PCI|tuyển quân/);
  assert.deepEqual(missingItems(prose, 'section', [...extracted, { sourceQuote: 'Chỉ số PAPI xếp hạng từ hạng 05 trở lên', targetValue: 5 }]), []);
});

test('đủ mục: bảng có cột STT, hàng "-" thuộc hàng đánh số phía trên', () => {
  const table = [
    '[Mục: Phụ lục 1]',
    'STT Chỉ tiêu Đơn vị tính Kế hoạch',
    'I CHỈ TIÊU KINH TẾ',
    '1 Thu ngân sách nhà nước Tỷ đồng 1.200',
    '2 Tỷ lệ trường đạt chuẩn quốc gia',
    '- Mầm non % 60',
    '- Tiểu học % 80',
    '3 Tỷ lệ hộ nghèo % 1,5',
  ].join('\n');
  assert.deepEqual(numberedItems(table, 'table').map(item => item.ordinal), ['1', '2', '3']);
  const missing = missingItems(table, 'table', [
    { sourceQuote: '1 Thu ngân sách nhà nước Tỷ đồng 1.200', targetValue: 1200 },
    { sourceQuote: '- Tiểu học % 80', targetValue: 80 },
  ]);
  assert.deepEqual(missing.map(item => item.ordinal), ['3']);
  assert.match(recheckText(table, 'table', missing), /STT Chỉ tiêu Đơn vị tính Kế hoạch[\s\S]*3 Tỷ lệ hộ nghèo % 1,5$/);
  // Hàng đánh số cột không phải chỉ tiêu.
  assert.deepEqual(numberedItems('1 2 3 4 5', 'table'), []);
});
