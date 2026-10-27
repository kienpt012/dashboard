import assert from 'node:assert/strict';
import test from 'node:test';
import { holidaysOn } from './holidays';

const at = (iso: string) => new Date(`${iso}T09:00:00+07:00`);
const names = (iso: string) => holidaysOn(at(iso)).map(item => item.name);

test('ngày lễ dương lịch', () => {
  assert.ok(names('2026-09-02').includes('Quốc khánh'));
  assert.ok(names('2026-04-30').includes('Ngày Giải phóng miền Nam, thống nhất đất nước'));
  assert.ok(names('2026-10-20').includes('Ngày Phụ nữ Việt Nam'));
  assert.deepEqual(names('2026-10-27'), []);
});

test('ngày lễ âm lịch tính theo lịch âm của năm đó', () => {
  assert.ok(names('2026-04-26').includes('Giỗ Tổ Hùng Vương'));
  assert.ok(names('2026-02-17').includes('Tết Nguyên đán'));
  assert.ok(names('2025-10-06').includes('Tết Trung thu'));
});

test('ngày nghỉ chính thức được đánh dấu', () => {
  assert.equal(holidaysOn(at('2026-09-02')).find(item => item.name === 'Quốc khánh')?.official, true);
  assert.equal(holidaysOn(at('2026-10-20')).find(item => item.name === 'Ngày Phụ nữ Việt Nam')?.official, false);
});
