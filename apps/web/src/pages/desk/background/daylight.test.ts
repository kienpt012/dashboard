import assert from 'node:assert/strict';
import test from 'node:test';
import { daylightPhase } from './daylight';

const local = (hour: number, minute = 0, day = 27) => new Date(2026, 9, day, hour, minute);

test('nền theo giờ: ranh giới bình minh, ngày, hoàng hôn, đêm', () => {
  assert.equal(daylightPhase(local(4, 59)).id, 'night');
  assert.equal(daylightPhase(local(5, 0)).id, 'dawn');
  assert.equal(daylightPhase(local(7, 59)).id, 'dawn');
  assert.equal(daylightPhase(local(8, 0)).id, 'day');
  assert.equal(daylightPhase(local(16, 59)).id, 'day');
  assert.equal(daylightPhase(local(17, 0)).id, 'dusk');
  assert.equal(daylightPhase(local(19, 0)).id, 'night');
});

test('nền theo giờ: thời điểm đổi nền kế tiếp', () => {
  assert.deepEqual(daylightPhase(local(23, 0)).next, local(5, 0, 28));
  assert.deepEqual(daylightPhase(local(2, 30)).next, local(5, 0));
  assert.deepEqual(daylightPhase(local(9, 15)).next, local(17, 0));
});
