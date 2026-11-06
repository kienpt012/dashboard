import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectThreshold, formatVietnameseNumber, thresholdText } from '../src/target-threshold';

const text = (quote: string, value: number) => thresholdText(detectThreshold(quote, value));

test('ngưỡng: cụm từ trước và sau con số mục tiêu', () => {
  assert.equal(text('Tổng thu ngân sách đạt ít nhất 125,5 tỷ đồng.', 125.5), '>= 125,5');
  assert.equal(text('Tỷ lệ tăng thu từ 8% trở lên so với cùng kỳ.', 8), '>= 8');
  assert.equal(text('Doanh thu thương mại tăng trên 10%.', 10), '> 10');
  assert.equal(text('Tỷ lệ suy dinh dưỡng ở mức dưới 6,5%.', 6.5), '< 6,5');
  assert.equal(text('Tỷ lệ hộ nghèo không vượt quá 2%.', 2), '<= 2');
  assert.equal(text('Tỷ lệ thất nghiệp không quá 3,5%.', 3.5), '<= 3,5');
  assert.equal(text('Số giường bệnh không thấp hơn 30 giường.', 30), '>= 30');
  assert.equal(text('Giảm ít nhất 10% số vụ tai nạn giao thông.', 10), '>= 10');
  assert.equal(text('Tối thiểu 45 doanh nghiệp trở lên được thành lập mới.', 45), '>= 45');
  assert.equal(text('Chỉ số đạt ≥ 95,5%.', 95.5), '>= 95,5');
  assert.equal(text('Tỷ lệ hồ sơ đúng hạn đạt 100%.', 100), '= 100');
  assert.equal(text('Thu hút khoảng 12.000 lượt khách du lịch.', 12000), 'khoảng 12.000');
  assert.equal(text('Tỷ lệ nợ đọng 5% trở xuống.', 5), '<= 5');
});

test('ngưỡng: khoảng giá trị', () => {
  assert.equal(text('Tỷ lệ che phủ cây xanh từ 70% đến 75%.', 70), '70 - 75');
  assert.equal(text('Tăng trưởng 2–3% mỗi năm.', 2), '2 - 3');
  assert.deepEqual(detectThreshold('từ 70% đến 75%', 70), { operator: 'range', value: 70, upper: 75 });
});

test('ngưỡng: cụm từ về đối tượng không phải ngưỡng của con số mục tiêu', () => {
  assert.equal(text('Tỷ lệ người từ 60 tuổi trở lên được khám sức khoẻ định kỳ đạt ít nhất 85%.', 85), '>= 85');
  assert.equal(text('Tỷ lệ trẻ em dưới 5 tuổi suy dinh dưỡng thể thấp còi dưới 6,5%.', 6.5), '< 6,5');
  assert.equal(text('Trẻ em dưới 5 tuổi được tiêm chủng đầy đủ đạt 98%.', 98), '= 98');
});

test('ngưỡng: không tìm thấy con số trong câu thì không đoán', () => {
  assert.equal(detectThreshold('Hoàn thành chỉ tiêu được giao.', 50), null);
  assert.equal(detectThreshold('', 50), null);
  assert.equal(detectThreshold('đạt 50%', null), null);
  // 10 nằm trong 100 không được tính là con số mục tiêu.
  assert.equal(detectThreshold('đạt 100%', 10), null);
});

test('định dạng số kiểu Việt Nam', () => {
  assert.equal(formatVietnameseNumber(125.5), '125,5');
  assert.equal(formatVietnameseNumber(12000), '12.000');
  assert.equal(formatVietnameseNumber(1234567.25), '1.234.567,25');
});
