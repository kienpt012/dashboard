import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { formatScore, scoreExtraction, type GoldDocument } from '../src/extraction-scoring';

const gold = [
  { ordinal: '1', name: 'Tổng thu ngân sách nhà nước trên địa bàn', value: 125.5, unit: 'tỷ đồng', plan: '>= 125,5', group: '1. Chỉ tiêu về kinh tế', category: 'Kinh tế' },
  { ordinal: '2', name: 'Tỷ lệ hộ nghèo', value: 1.5, unit: '%', plan: '< 1,5', group: '1. Chỉ tiêu về kinh tế', category: 'Văn hoá - xã hội' },
  { ordinal: '3', name: 'Tỷ lệ người dân tham gia bảo hiểm y tế', value: 95, unit: '%', group: '2. Chỉ tiêu về y tế' },
];

test('chấm điểm: ghép theo giá trị và tên, tính recall, precision và từng trường', () => {
  const score = scoreExtraction(gold, [
    { name: 'Tổng thu ngân sách nhà nước trên địa bàn', targetValue: 125.5, unit: 'tỷ đồng', ordinal: '(1)', groupName: 'a) Chỉ tiêu về kinh tế', category: 'Kinh tế', sourceQuote: 'Tổng thu ngân sách nhà nước trên địa bàn đạt ít nhất 125,5 tỷ đồng.', direction: 'HIGHER_IS_BETTER' },
    { name: 'Tỷ lệ hộ nghèo', targetValue: 1.5, unit: '%', ordinal: '2', groupName: '1. Chỉ tiêu về kinh tế', category: 'Kinh tế', sourceQuote: 'Tỷ lệ hộ nghèo giảm còn dưới 1,5%.', direction: 'LOWER_IS_BETTER' },
    { name: 'Số liệu nền hộ nghèo năm 2025', targetValue: 80, unit: 'hộ', extractionMethod: 'RULE_BASED' },
  ]);
  assert.equal(score.matched, 2);
  assert.equal(score.recall, 0.667);
  assert.equal(score.precision, 0.667);
  assert.deepEqual(score.fields.unit, { checked: 2, correct: 2, accuracy: 1 });
  assert.deepEqual(score.fields.ordinal, { checked: 2, correct: 2, accuracy: 1 });
  assert.deepEqual(score.fields.plan, { checked: 2, correct: 2, accuracy: 1 });
  assert.deepEqual(score.fields.group, { checked: 2, correct: 2, accuracy: 1 });
  assert.deepEqual(score.fields.category, { checked: 2, correct: 1, accuracy: 0.5 });
  assert.deepEqual(score.missing.map(item => item.name), ['Tỷ lệ người dân tham gia bảo hiểm y tế']);
  assert.deepEqual(score.extra.map(item => item.name), ['Số liệu nền hộ nghèo năm 2025']);
  assert.deepEqual(score.mismatches, [{ name: 'Tỷ lệ hộ nghèo', field: 'category', expected: 'Văn hoá - xã hội', actual: 'Kinh tế' }]);
  const report = formatScore('Mẫu', score);
  assert.match(report, /Bắt được 2\/3 chỉ tiêu \(recall 66\.7%\)/);
  assert.match(report, /Thừa 1:\n {2}- Số liệu nền hộ nghèo năm 2025 = 80 hộ \[RULE_BASED\]/);
});

test('chấm điểm: cùng tên khác giá trị không ghép; một đề xuất chỉ dùng cho một dòng đáp án', () => {
  const twins = [
    { name: 'Tỷ lệ giảm số hộ kinh doanh ngừng hoạt động', value: 5, unit: '%' },
    { name: 'Tỷ lệ giảm số hộ kinh doanh ngừng hoạt động so với năm 2025', value: 5, unit: '%' },
  ];
  const score = scoreExtraction(twins, [
    { name: 'Tỷ lệ giảm số hộ kinh doanh ngừng hoạt động', targetValue: 5, unit: '%' },
    { name: 'Tỷ lệ giảm số hộ kinh doanh ngừng hoạt động', targetValue: 50, unit: '%' },
  ]);
  assert.equal(score.matched, 1);
  assert.equal(score.missing.length, 1);
  assert.equal(score.extra.length, 1);
});

test('đáp án QĐ 015 mẫu: 30 chỉ tiêu, đủ trường, tự chấm với chính nó đạt 100%', () => {
  const document = JSON.parse(readFileSync(path.join(__dirname, '..', '..', '..', 'eval', 'gold-v2', 'qd015.json'), 'utf8')) as GoldDocument;
  assert.equal(document.indicators.length, 30);
  const score = scoreExtraction(document.indicators, document.indicators.map(item => ({
    name: item.name, targetValue: item.value, unit: item.unit, ordinal: item.ordinal, groupName: item.group, category: item.category, targetText: item.plan,
  })));
  assert.equal(score.recall, 1);
  assert.equal(score.precision, 1);
  assert.equal(score.mismatches.length, 0);
});
