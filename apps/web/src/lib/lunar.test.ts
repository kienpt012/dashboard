import assert from 'node:assert/strict';
import test from 'node:test';
import { canChi, lunarLabel, solarToLunar } from './lunar';

const at = (iso: string) => new Date(`${iso}T09:00:00+07:00`);

test('lịch âm: mùng Một Tết các năm gần đây', () => {
  assert.deepEqual(solarToLunar(at('2023-01-22')), { day: 1, month: 1, year: 2023, leap: false });
  assert.deepEqual(solarToLunar(at('2024-02-10')), { day: 1, month: 1, year: 2024, leap: false });
  assert.deepEqual(solarToLunar(at('2025-01-29')), { day: 1, month: 1, year: 2025, leap: false });
  assert.deepEqual(solarToLunar(at('2026-02-17')), { day: 1, month: 1, year: 2026, leap: false });
});

test('lịch âm: ngày trước Tết vẫn thuộc năm âm lịch cũ', () => {
  assert.deepEqual(solarToLunar(at('2026-02-16')), { day: 29, month: 12, year: 2025, leap: false });
});

test('lịch âm: tháng Hai nhuận năm Quý Mão 2023', () => {
  assert.deepEqual(solarToLunar(at('2023-03-22')), { day: 1, month: 2, year: 2023, leap: true });
});

test('lịch âm: Trung thu 2025 và Giỗ Tổ 2026', () => {
  assert.deepEqual(solarToLunar(at('2025-10-06')), { day: 15, month: 8, year: 2025, leap: false });
  assert.deepEqual(solarToLunar(at('2026-04-26')), { day: 10, month: 3, year: 2026, leap: false });
});

test('lịch âm: tính theo giờ Việt Nam dù máy đặt múi giờ khác', () => {
  assert.deepEqual(solarToLunar(new Date('2026-02-16T18:30:00Z')), { day: 1, month: 1, year: 2026, leap: false });
});

test('can chi của năm và nhãn ngày âm', () => {
  assert.equal(canChi(2024), 'Giáp Thìn');
  assert.equal(canChi(2025), 'Ất Tỵ');
  assert.equal(canChi(2026), 'Bính Ngọ');
  assert.equal(lunarLabel(at('2026-02-17')), '1/1 Bính Ngọ');
  assert.equal(lunarLabel(at('2023-03-22')), '1/2 nhuận Quý Mão');
});
