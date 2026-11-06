/** Data paths only: no expression execution or inherited/prototype property access. */
export function readJsonPath(value: unknown, path: string): unknown {
  const keys = path.trim().replace(/^\$\.?/, '').replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let result = value;
  for (const key of keys) {
    if (['__proto__', 'prototype', 'constructor'].includes(key) || !result || typeof result !== 'object' || !Object.prototype.hasOwnProperty.call(result, key)) return undefined;
    result = (result as Record<string, unknown>)[key];
  }
  return result;
}

function numeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

/** Normalizes the three common public JSON shapes without fabricating missing values. */
export function apiRows(value: unknown, xKey: string, yKey: string): { name: string; value: number }[] {
  if (Array.isArray(value)) return value.slice(0, 240).flatMap((row, index) => {
    const y = numeric(typeof row === 'object' && row !== null ? readJsonPath(row, yKey) : row);
    return y === null ? [] : [{ name: String(typeof row === 'object' && row !== null ? readJsonPath(row, xKey) ?? index + 1 : index + 1).slice(0, 120), value: y }];
  });
  const ys = readJsonPath(value, yKey);
  const xs = readJsonPath(value, xKey);
  if (Array.isArray(ys)) return ys.slice(0, 240).flatMap((entry, index) => {
    const y = numeric(entry);
    return y === null ? [] : [{ name: String(Array.isArray(xs) ? xs[index] ?? index + 1 : index + 1).slice(0, 120), value: y }];
  });
  if (value && typeof value === 'object') return Object.entries(value).slice(0, 240).flatMap(([name, raw]) => {
    const y = numeric(raw);
    return y === null ? [] : [{ name, value: y }];
  });
  return [];
}

/** Recursive-descent arithmetic parser; never evaluates JavaScript or executable input. */
export function calculateExpression(input: string): number {
  const source = input.replaceAll('×', '*').replaceAll('÷', '/').replaceAll(',', '.').replace(/\s/g, '');
  if (!source || source.length > 160 || /[^\d.+\-*/()%]/.test(source)) throw new Error('Biểu thức chưa hợp lệ');
  let index = 0;
  const factor = (): number => {
    let sign = 1;
    while (source[index] === '+' || source[index] === '-') { if (source[index] === '-') sign *= -1; index++; }
    let value: number;
    if (source[index] === '(') { index++; value = sum(); if (source[index++] !== ')') throw new Error('Thiếu dấu đóng ngoặc'); }
    else {
      const match = source.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
      if (!match) throw new Error('Biểu thức chưa hoàn chỉnh');
      index += match[0].length;
      value = Number(match[0]);
    }
    while (source[index] === '%') { value /= 100; index++; }
    return sign * value;
  };
  const product = (): number => {
    let value = factor();
    while (source[index] === '*' || source[index] === '/') {
      const operation = source[index++];
      const right = factor();
      if (operation === '/' && right === 0) throw new Error('Không thể chia cho 0');
      value = operation === '*' ? value * right : value / right;
    }
    return value;
  };
  const sum = (): number => {
    let value = product();
    while (source[index] === '+' || source[index] === '-') {
      const operation = source[index++];
      const right = product();
      value = operation === '+' ? value + right : value - right;
    }
    return value;
  };
  const answer = sum();
  if (index !== source.length || !Number.isFinite(answer)) throw new Error('Biểu thức không hợp lệ hoặc kết quả quá lớn');
  return Number(answer.toPrecision(12));
}
