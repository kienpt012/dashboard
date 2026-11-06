import assert from 'node:assert/strict';
import test from 'node:test';
import { EXTRA_WALLPAPERS } from '../apps/web/src/pages/workspace/background/catalog';
import { resolveDaylightPreset } from '../apps/web/src/pages/workspace/background/daylight';

const local = (hour: number, minute = 0) => new Date(2026, 10, 6, hour, minute);

test('wallpaper daylight switches at local morning, daytime, sunset and evening boundaries', () => {
  const cases: [number, number, string][] = [
    [0, 0, 'dem-sao'], [4, 59, 'dem-sao'], [5, 0, 'binh-minh'], [7, 59, 'binh-minh'],
    [8, 0, 'gom'], [16, 59, 'gom'], [17, 0, 'dusk'], [18, 59, 'dusk'], [19, 0, 'dem-sao'], [23, 59, 'dem-sao'],
  ];
  for (const [hour, minute, expected] of cases) assert.equal(resolveDaylightPreset(local(hour, minute)), expected);
});

test('every automatic wallpaper resolves to a supported preset without changing its date', () => {
  const supported = new Set<string>([...EXTRA_WALLPAPERS.map(({ id }) => id), 'dusk']);
  for (let hour = 0; hour < 24; hour++) {
    const now = local(hour, 32);
    const timestamp = now.getTime();
    assert.ok(supported.has(resolveDaylightPreset(now)));
    assert.equal(now.getTime(), timestamp);
  }
  assert.equal(resolveDaylightPreset(new Date(Number.NaN)), 'dem-sao');
});
