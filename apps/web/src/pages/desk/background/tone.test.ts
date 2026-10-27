import assert from 'node:assert/strict';
import test from 'node:test';
import { relativeLuminance, toneOfBackground, toneOfHex } from './tone';

test('độ sáng tương đối theo chuẩn WCAG', () => {
  assert.equal(relativeLuminance('#ffffff'), 1);
  assert.equal(relativeLuminance('#000000'), 0);
  assert.ok(Math.abs(relativeLuminance('#808080') - 0.2159) < 0.001);
});

test('tông của màu: chọn màu chữ tương phản hơn', () => {
  assert.equal(toneOfHex('#ffffff'), 'light');
  assert.equal(toneOfHex('#0b1020'), 'dark');
  assert.equal(toneOfHex('#808080'), 'light');
  assert.equal(toneOfHex('#5a5a5a'), 'dark');
});

test('tông của hình nền: dải màu lấy trung bình, nền dựng sẵn theo khai báo', () => {
  assert.equal(toneOfBackground({ kind: 'gradient', stops: ['#ffffff', '#f0f0f0'], angle: 90 }, () => 'dark'), 'light');
  assert.equal(toneOfBackground({ kind: 'gradient', stops: ['#000000', '#202040', '#404040'], angle: 90 }, () => 'light'), 'dark');
  assert.equal(toneOfBackground({ kind: 'preset', id: 'dem-sao' }, id => (id === 'dem-sao' ? 'dark' : 'light')), 'dark');
  assert.equal(toneOfBackground({ kind: 'color', color: '#fafafa' }, () => 'dark'), 'light');
});
