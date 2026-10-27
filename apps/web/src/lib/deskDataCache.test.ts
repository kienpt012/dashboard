import assert from 'node:assert/strict';
import test from 'node:test';
import { clearDataCache, dataCacheKey, readDataCache, writeDataCache } from './deskDataCache';

class MemoryStorage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  keys() {
    return [...this.map.keys()];
  }
}

test('khoá bộ đệm số liệu phòng gồm người dùng, phòng, năm', () => {
  assert.equal(dataCacheKey('u1', 'd1', 2026), 'ioc_desk_data_v1:u1:d1:2026');
  assert.notEqual(dataCacheKey('u1', 'd1', 2026), dataCacheKey('u2', 'd1', 2026));
});

test('đọc lại đúng bản đã lưu kèm thời điểm lưu; bản hỏng trả về không có', () => {
  const storage = new MemoryStorage();
  writeDataCache(storage, 'u1', dataCacheKey('u1', 'd1', 2026), { totals: 1 }, 1000);
  assert.deepEqual(readDataCache(storage, dataCacheKey('u1', 'd1', 2026)), { savedAt: 1000, data: { totals: 1 } });
  storage.setItem(dataCacheKey('u1', 'd2', 2026), '{hỏng');
  assert.equal(readDataCache(storage, dataCacheKey('u1', 'd2', 2026)), undefined);
  assert.equal(readDataCache(storage, dataCacheKey('u1', 'd3', 2026)), undefined);
});

test('mỗi người chỉ giữ 6 bản mới nhất, không đụng bản của người khác', () => {
  const storage = new MemoryStorage();
  writeDataCache(storage, 'u2', dataCacheKey('u2', 'x', 2026), {}, 1);
  for (let index = 0; index < 8; index += 1) writeDataCache(storage, 'u1', dataCacheKey('u1', `d${index}`, 2026), { index }, 100 + index);
  const mine = storage.keys().filter(key => key.startsWith('ioc_desk_data_v1:u1:'));
  assert.equal(mine.length, 6);
  assert.ok(!mine.includes(dataCacheKey('u1', 'd0', 2026)) && !mine.includes(dataCacheKey('u1', 'd1', 2026)));
  assert.ok(storage.keys().includes(dataCacheKey('u2', 'x', 2026)));
});

test('đăng xuất xoá mọi bản số liệu phòng, giữ khoá khác', () => {
  const storage = new MemoryStorage();
  writeDataCache(storage, 'u1', dataCacheKey('u1', 'd1', 2026), {}, 1);
  writeDataCache(storage, 'u2', dataCacheKey('u2', 'd1', 2026), {}, 1);
  storage.setItem('ioc_token', 'x');
  clearDataCache(storage);
  assert.deepEqual(storage.keys(), ['ioc_token']);
});

test('bộ nhớ đầy hoặc bị chặn không làm hỏng widget', () => {
  const storage = new MemoryStorage();
  storage.setItem = () => {
    throw new Error('QuotaExceededError');
  };
  assert.doesNotThrow(() => writeDataCache(storage, 'u1', dataCacheKey('u1', 'd1', 2026), {}, 1));
});
