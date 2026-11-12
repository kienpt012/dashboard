import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nameMissingFromQuote } from '../src/extraction-validation';

test('B10: tên không bám câu trích (lấy nhầm tên chỉ tiêu liền trước) thì gắn cờ', () => {
  assert.equal(nameMissingFromQuote('Tốc độ tăng tổng thu ngân sách so với năm', 'Tổng mức bán lẻ hàng hóa và doanh thu dịch vụ tiêu dùng tăng trên 10% so với năm 2025'), true);
  assert.equal(nameMissingFromQuote('Tốc độ tăng tổng thu ngân sách so với năm 2025', 'Tổng thu ngân sách tăng từ 8% trở lên so với năm 2025.'), false);
  assert.equal(nameMissingFromQuote('Vốn đầu tư trực tiếp nước ngoài (FDI) thu hút', 'Phấn đấu trong năm 2027 thu hút FDI đạt 12 tỷ USD'), false);
  assert.equal(nameMissingFromQuote('Tỷ lệ trường Tiểu học đạt chuẩn', 'Tỷ lệ trường Tiểu học đạt chuẩn % 60'), false);
  assert.equal(nameMissingFromQuote('Tỷ lệ hộ nghèo', ''), false);
});
