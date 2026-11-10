import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apiRows, calculateExpression, readJsonPath } from '../../web/src/pages/workspace/widget-utils';

test('workspace calculator respects precedence, parentheses, unary signs and percent', () => {
  const cases: [string, number][] = [
    ['1+2*3', 7], ['(1+2)*3', 9], ['-2*-3', 6], ['200*10%', 20],
    ['1,5 + .5', 2], ['10÷(2+3)', 2], ['--2', 2], ['100/4/5', 5],
    ['-(2+3)', -5], ['2×(3 + 50%)', 7], ['0.1+0.2', 0.3],
  ];
  for (const [expression, expected] of cases) assert.equal(calculateExpression(expression), expected, expression);
});

test('workspace calculator rejects executable text, malformed and unbounded input', () => {
  for (const expression of ['1/0', 'alert(1)', 'globalThis', '2+', '(2+3', '2**3', '2)3', 'NaN', 'Infinity', '1;2', '2'.repeat(161), '']) {
    assert.throws(() => calculateExpression(expression), undefined, expression);
  }
});

test('workspace JSON path reads arrays and root without exposing inherited properties', () => {
  const data = { hourly: { temperature_2m: [0, 21.5] } };
  assert.equal(readJsonPath(data, '$.hourly.temperature_2m[1]'), 21.5);
  assert.equal(readJsonPath(data, 'hourly.temperature_2m.0'), 0);
  assert.equal(readJsonPath(data, '$'), data);
  assert.equal(readJsonPath(data, 'hourly.missing'), undefined);
  assert.equal(readJsonPath({ constructor: { x: 1 } }, 'constructor.x'), undefined);
  assert.equal(readJsonPath(JSON.parse('{"__proto__":{"x":1}}'), '__proto__.x'), undefined);
  assert.equal(readJsonPath(Object.create({ inherited: 5 }), 'inherited'), undefined);
  assert.equal(readJsonPath(null, 'x'), undefined);
});

test('workspace API rows retain zero and negative values and omit invalid entries', () => {
  const result = apiRows([
    { label: 'Không phát sinh', metric: { value: 0 } },
    { label: 'Giảm', metric: { value: -2.5 } },
    { label: 'Chuỗi số', metric: { value: '10.25' } },
    { label: 'Thiếu', metric: { value: null } },
    { label: 'Trống', metric: { value: '' } },
    { label: 'Sai', metric: { value: 'không có' } },
    { label: 'Vô hạn', metric: { value: Infinity } },
  ], 'label', 'metric.value');
  assert.deepEqual(result, [{ name: 'Không phát sinh', value: 0 }, { name: 'Giảm', value: -2.5 }, { name: 'Chuỗi số', value: 10.25 }]);
});

test('workspace API supports Open-Meteo parallel arrays and numeric maps', () => {
  assert.deepEqual(apiRows({ time: ['08:00', '09:00', '10:00'], temperature_2m: [25, null, 28] }, 'time', 'temperature_2m'), [{ name: '08:00', value: 25 }, { name: '10:00', value: 28 }]);
  assert.deepEqual(apiRows({ A: 4, B: 0, C: 'unknown' }, 'name', 'value'), [{ name: 'A', value: 4 }, { name: 'B', value: 0 }]);
  assert.deepEqual(apiRows(null, 'name', 'value'), []);
  assert.equal(apiRows(Array.from({ length: 300 }, (_, i) => i), 'name', 'value').length, 240);
  assert.equal(apiRows([{ label: 'x'.repeat(500), value: 1 }], 'label', 'value')[0].name.length, 120);
});
