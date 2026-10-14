import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyScore, datasetsReferenced, evaluateFormula, formatFormula,
  normalizeRow, validateColumns, validateFormula,
  type AggregateSpec, type Condition, type DatasetColumn, type Expr,
  type FormulaSpec, type Row, type ScoreRule,
} from '../src/formula';

const columns: DatasetColumn[] = [
  { key: 'chair', label: 'Chức danh chủ trì', type: 'text' },
  { key: 'amount', label: 'Kinh phí', type: 'number' },
  { key: 'date', label: 'Ngày thực hiện', type: 'date' },
  { key: 'done', label: 'Đã thực hiện', type: 'boolean' },
  { key: 'status', label: 'Trạng thái', type: 'enum', options: ['Đã duyệt', 'Chờ duyệt'] },
];
const datasets = new Map<string, readonly DatasetColumn[]>([['meetings', columns], ['news', columns]]);
const count = (dataset = 'meetings'): AggregateSpec => ({ agg: 'count', dataset });
const parse = (input: unknown): FormulaSpec => {
  const result = validateFormula(input, datasets);
  assert.equal(result.ok, true, result.ok ? undefined : result.errors.join('; '));
  if (!result.ok) throw new Error('Công thức thử nghiệm không hợp lệ.');
  return result.formula;
};
const invalid = (input: unknown): void => {
  const result = validateFormula(input, datasets);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.length > 0);
};
const normalized = (input: unknown, schema = columns): Row => {
  const result = normalizeRow(schema, input);
  assert.equal(result.ok, true, result.ok ? undefined : result.errors.join('; '));
  if (!result.ok) throw new Error('Dữ liệu thử nghiệm không hợp lệ.');
  return result.row;
};

test('DTI 1.2: ba trong bốn cuộc họp đạt tỷ lệ 0,75 và 1,5 điểm', () => {
  const formula = parse({
    value: { op: 'ratio', num: { ...count(), where: [['chair', 'in', ['Bí thư', 'Chủ tịch']]] }, den: count() },
    score: { type: 'linear', max: 2 },
  });
  const rows = [{ chair: 'BÍ THƯ' }, { chair: 'chu tich' }, { chair: '  Chủ   tịch  ' }, { chair: 'Phó Chủ tịch' }];
  const result = evaluateFormula(formula, () => rows);
  assert.deepEqual(result, {
    value: 0.75, score: 1.5, warnings: [],
    traces: [
      { dataset: 'meetings', agg: 'count', matched: 3, total: 4, value: 3 },
      { dataset: 'meetings', agg: 'count', matched: 4, total: 4, value: 4 },
    ],
  });
});

test('DTI 1.4: chấm bậc giảm dần cho 60, 30 và 5 tin bài', () => {
  const formula = parse({ value: count('news'), score: { type: 'steps', steps: [{ gte: 20, score: 1 }, { gte: 52, score: 2 }], otherwise: 0.5 } });
  for (const [length, score] of [[60, 2], [30, 1], [5, 0.5], [52, 2], [20, 1]]) {
    assert.equal(evaluateFormula(formula, () => Array.from({ length }, () => ({}))).score, score);
  }
});

test('DTI 6.4: ngưỡng 0,8 với chấm tuyến tính hoặc không điểm dưới ngưỡng', () => {
  const rule: ScoreRule = { type: 'threshold', min: 0.8, max: 5 };
  assert.equal(applyScore(rule, 0.85), 5);
  assert.equal(applyScore(rule, 0.8), 5);
  assert.equal(applyScore(rule, 0.5), 2.5);
  assert.equal(applyScore({ ...rule, below: 'zero' }, 0.5), 0);
  assert.equal(evaluateFormula(parse({ value: 0.5, score: rule }), () => []).score, 2.5);
});

test('DTI 3.1: quy tắc dải trả điểm bằng tỷ lệ từ 90% đến dưới 100%', () => {
  const rule: ScoreRule = { type: 'band', max: 1, bands: [{ gte: 0.9, score: 'r' }, { gte: 1, score: 1 }], otherwise: 0 };
  for (const [value, score] of [[1, 1], [0.95, 0.95], [0.9, 0.9], [0.899, 0], [1.2, 1]]) {
    assert.equal(evaluateFormula(parse({ value, score: rule }), () => []).score, score);
  }
  assert.equal(applyScore({ type: 'band', max: 5, bands: [{ gte: 0.5, score: 'rmax' }] }, 0.8), 4);
});

test('Lọc năm kết hợp điều kiện và ghi đúng tổng số dòng trong vết tính', () => {
  const formula = parse({ value: { ...count(), yearColumn: 'date', where: [['done', 'isTrue']] } });
  const rows = [
    { date: '2026-01-01', done: true }, { date: '2026-12-31', done: false },
    { date: '2025-01-01', done: true }, { date: null, done: true },
    { date: '2026-02-31', done: true }, { date: '2026-gia', done: true },
  ];
  assert.deepEqual(evaluateFormula(formula, () => rows, { year: 2026 }).traces,
    [{ dataset: 'meetings', agg: 'count', matched: 1, total: 6, value: 1 }]);
  assert.equal(evaluateFormula(formula, () => rows).value, 5);
});

test('Mẫu số bằng 0 trả kết quả và điểm rỗng kèm cảnh báo tiếng Việt', () => {
  for (const op of ['ratio', 'percent'] as const) {
    const result = evaluateFormula(parse({ value: { op, num: count(), den: 0 }, score: { type: 'binary', max: 1 } }), () => []);
    assert.equal(result.value, null);
    assert.equal(result.score, null);
    assert.match(result.warnings[0], /^Mẫu số bằng 0 /);
  }
});

test('Tổng hợp bỏ qua giá trị không phải số hữu hạn và giữ số dòng khớp', () => {
  const rows = [{ amount: 2 }, { amount: 4 }, { amount: null }, { amount: '9' }, {}, { amount: NaN }, { amount: Infinity }];
  for (const [agg, expected] of [['sum', 6], ['avg', 3], ['min', 2], ['max', 4]] as const) {
    const result = evaluateFormula(parse({ value: { agg, dataset: 'meetings', column: 'amount' } }), () => rows);
    assert.equal(result.value, expected);
    assert.equal(result.traces[0].matched, 7);
    assert.equal(result.traces[0].column, 'amount');
  }
});

test('Tập rỗng có tổng và số lượng bằng 0, trung bình và cực trị rỗng', () => {
  for (const [agg, expected] of [['sum', 0], ['count', 0], ['countDistinct', 0], ['avg', null], ['min', null], ['max', null]] as const) {
    assert.equal(evaluateFormula(parse({ value: { agg, dataset: 'meetings', column: 'amount' } }), () => []).value, expected);
  }
});

test('Đếm phân biệt bỏ ô rỗng, bỏ khoảng trắng ngoài và không phân biệt hoa thường', () => {
  const formula = parse({ value: { agg: 'countDistinct', dataset: 'meetings', column: 'chair' } });
  const rows = ['  Bí thư ', 'BÍ THƯ', 'Chủ tịch', '', '   ', null, undefined].map(chair => ({ chair }));
  assert.equal(evaluateFormula(formula, () => rows).value, 2);
  assert.equal(evaluateFormula(formula, () => [{ chair: 'Đã' }, { chair: 'da' }]).value, 2);
});

test('So sánh chuỗi không phân biệt hoa thường, dấu, đ và khoảng trắng', () => {
  const cases: [Condition, number][] = [
    [['chair', 'eq', 'Đã họp'], 1], [['chair', 'ne', 'Đã họp'], 1],
    [['chair', 'in', ['Đã họp']], 1], [['chair', 'nin', ['Đã họp']], 1],
    [['chair', 'contains', 'ĐÃ'], 1], [['chair', 'notEmpty'], 2],
  ];
  for (const [condition, expected] of cases) {
    assert.equal(evaluateFormula(parse({ value: { ...count(), where: [condition] } }), () => [{ chair: '  DA   HOP ' }, { chair: 'chưa họp' }]).value, expected);
  }
});

test('So sánh số, ngày và luận lý đúng kiểu, không ép ô rỗng thành số 0', () => {
  const rows = [{ amount: 2, date: '2026-01-01', done: true }, { amount: 3, date: '2026-02-01', done: false }, { amount: null }];
  const cases: [Condition, number][] = [
    [['amount', 'gt', 2], 1], [['amount', 'gte', 2], 2], [['amount', 'lt', 3], 1], [['amount', 'lte', 3], 2],
    [['date', 'gt', '2026-01-15'], 1], [['done', 'isTrue'], 1], [['done', 'isFalse'], 1], [['amount', 'eq', null], 1],
  ];
  for (const [condition, expected] of cases) {
    assert.equal(evaluateFormula(parse({ value: { ...count(), where: [condition] } }), () => rows).value, expected);
  }
});

test('Các phép toán lan truyền giá trị rỗng, riêng cực trị bỏ qua nếu còn số', () => {
  const missing: Expr = { agg: 'avg', dataset: 'meetings', column: 'amount' };
  for (const op of ['add', 'sub', 'mul', 'min', 'max'] as const) {
    const result = evaluateFormula(parse({ value: { op, args: [missing, 5] } }), () => []);
    assert.equal(result.value, op === 'min' || op === 'max' ? 5 : null);
  }
  for (const op of ['min', 'max'] as const) {
    assert.equal(evaluateFormula({ value: { op, args: [missing, missing] } }, () => []).value, null);
  }
  assert.equal(evaluateFormula({ value: { op: 'ratio', num: missing, den: 1 } }, () => []).value, null);
});

test('Tính số học, phần trăm và làm tròn đúng số chữ số', () => {
  for (const [op, expected] of [['add', 8], ['sub', 2], ['mul', 15], ['min', 3], ['max', 5]] as const) {
    assert.equal(evaluateFormula(parse({ value: { op, args: [5, 3] } }), () => []).value, expected);
  }
  const result = evaluateFormula(parse({ value: { op: 'ratio', num: 2, den: 3 }, score: { type: 'linear', max: 5 } }), () => []);
  assert.equal(result.value, 0.666667);
  assert.equal(result.score, 3.33);
  assert.equal(evaluateFormula({ value: { op: 'percent', num: 1, den: 4 } }, () => []).value, 25);
  assert.equal(evaluateFormula({ value: 1 }, () => []).score, null);
});

test('Chấm điểm theo giá trị chưa làm tròn để không vượt ngưỡng do làm tròn', () => {
  const formula = parse({ value: 0.8999999, score: { type: 'band', max: 1, bands: [{ gte: 0.9, score: 'r' }] } });
  const result = evaluateFormula(formula, () => []);
  assert.equal(result.value, 0.9);
  assert.equal(result.score, 0);
  assert.equal(evaluateFormula({ value: { op: 'mul', args: [{ op: 'ratio', num: 1, den: 3 }, 3] } }, () => []).value, 1);
});

test('Kết quả tràn số trả rỗng và cảnh báo, trung bình số lớn vẫn hữu hạn', () => {
  const result = evaluateFormula({ value: { op: 'mul', args: [Number.MAX_VALUE, 2] } }, () => []);
  assert.equal(result.value, null);
  assert.ok(result.warnings.length);
  assert.equal(evaluateFormula({ value: { agg: 'avg', dataset: 'meetings', column: 'amount' } }, () => [{ amount: 1e308 }, { amount: 1e308 }]).value, 1e308);
});

test('Chấm tuyến tính, giới hạn, nhị phân và điểm mặc định đúng biên', () => {
  for (const type of ['linear', 'capped'] as const) {
    assert.equal(applyScore({ type, max: 2 }, -1), 0);
    assert.equal(applyScore({ type, max: 2 }, 0.5), 1);
    assert.equal(applyScore({ type, max: 2 }, 3), 2);
  }
  for (const r of [-1, 0, 0.01]) assert.equal(applyScore({ type: 'binary', max: 2 }, r), r > 0 ? 2 : 0);
  assert.equal(applyScore({ type: 'steps', steps: [{ gte: 2, score: 1 }] }, 1), 0);
});

const badFormulas: [string, unknown][] = [
  ['bảng dữ liệu lạ', { value: count('unknown') }],
  ['cột tổng hợp lạ', { value: { ...count(), column: 'unknown' } }],
  ['cột điều kiện lạ', { value: { ...count(), where: [['unknown', 'eq', 1]] } }],
  ['cột năm lạ', { value: { ...count(), yearColumn: 'unknown' } }],
  ['cột năm không phải ngày', { value: { ...count(), yearColumn: 'amount' } }],
  ['thuộc tính công thức lạ', { value: 1, extra: true }],
  ['thuộc tính tổng hợp lạ', { value: { ...count(), extra: true } }],
  ['thuộc tính số học lạ', { value: { op: 'add', args: [1, 2], extra: true } }],
  ['thuộc tính tỷ lệ lạ', { value: { op: 'ratio', num: 1, den: 2, extra: true } }],
  ['tổng thiếu cột', { value: { agg: 'sum', dataset: 'meetings' } }],
  ['tổng cột văn bản', { value: { agg: 'sum', dataset: 'meetings', column: 'chair' } }],
  ['danh sách so sánh không phải mảng', { value: { ...count(), where: [['chair', 'in', 'Bí thư']] } }],
  ['danh sách so sánh quá 200 phần tử', { value: { ...count(), where: [['chair', 'nin', Array(201).fill('a')]] } }],
  ['điều kiện quá 12 mục', { value: { ...count(), where: Array(13).fill(['chair', 'notEmpty']) } }],
  ['so sánh lớn nhỏ trên văn bản', { value: { ...count(), where: [['chair', 'gt', 'a']] } }],
  ['phép chứa trên danh mục', { value: { ...count(), where: [['status', 'contains', 'Đã']] } }],
  ['đúng sai trên cột số', { value: { ...count(), where: [['amount', 'isTrue']] } }],
  ['giá trị thừa của điều kiện không rỗng', { value: { ...count(), where: [['chair', 'notEmpty', undefined]] } }],
  ['giá trị thừa của điều kiện sai', { value: { ...count(), where: [['done', 'isFalse', false]] } }],
  ['điều kiện thiếu giá trị', { value: { ...count(), where: [['chair', 'eq']] } }],
  ['số so sánh sai kiểu', { value: { ...count(), where: [['amount', 'gte', '1']] } }],
  ['ngày so sánh không tồn tại', { value: { ...count(), where: [['date', 'eq', '2026-02-31']] } }],
  ['số không hữu hạn', { value: Infinity }],
  ['phép trừ thừa đối số', { value: { op: 'sub', args: [1, 2, 3] } }],
  ['phép cộng thiếu đối số', { value: { op: 'add', args: [1] } }],
  ['điểm tối đa âm', { value: 1, score: { type: 'linear', max: -1 } }],
  ['điểm tối đa bằng 0', { value: 1, score: { type: 'binary', max: 0 } }],
  ['điểm tối đa vượt 1000', { value: 1, score: { type: 'capped', max: 1001 } }],
  ['thuộc tính điểm lạ', { value: 1, score: { type: 'linear', max: 2, extra: 1 } }],
  ['ngưỡng không hữu hạn', { value: 1, score: { type: 'threshold', max: 2, min: NaN } }],
  ['cách chấm dưới ngưỡng lạ', { value: 1, score: { type: 'threshold', max: 2, min: 0.8, below: 'khac' } }],
  ['bậc rỗng', { value: 1, score: { type: 'steps', steps: [] } }],
  ['quá 20 bậc', { value: 1, score: { type: 'steps', steps: Array(21).fill({ gte: 1, score: 1 }) } }],
  ['điểm bậc không hữu hạn', { value: 1, score: { type: 'steps', steps: [{ gte: 1, score: Infinity }] } }],
  ['điểm mặc định sai kiểu', { value: 1, score: { type: 'steps', steps: [{ gte: 1, score: 1 }], otherwise: '1' } }],
  ['thuộc tính bậc lạ', { value: 1, score: { type: 'steps', steps: [{ gte: 1, score: 1, extra: 2 }] } }],
  ['dải thiếu điểm tối đa', { value: 1, score: { type: 'band', bands: [{ gte: 1, score: 'r' }] } }],
  ['ký hiệu điểm dải lạ', { value: 1, score: { type: 'band', max: 1, bands: [{ gte: 1, score: 'value' }] } }],
  ['đơn vị sai kiểu', { value: 1, unit: 2 }],
  ['ghi chú sai kiểu', { value: 1, note: {} }],
];
for (const [name, input] of badFormulas) test(`Kiểm tra công thức từ chối ${name}`, () => invalid(input));

test('Giới hạn độ sâu nhận 8 cấp, từ chối 9 cấp và tham chiếu vòng', () => {
  let value: Expr = 1;
  for (let i = 1; i < 8; i++) value = { op: 'add', args: [value, 1] };
  parse({ value });
  invalid({ value: { op: 'add', args: [value, 1] } });
  const cyclic: { op: 'add'; args: unknown[] } = { op: 'add', args: [] };
  cyclic.args = [1, cyclic];
  invalid({ value: cyclic });
});

test('Giới hạn số nút nhận 64 và từ chối 65 kể cả khi mỗi nhánh hợp lệ', () => {
  parse({ value: { op: 'add', args: Array(63).fill(1) } });
  invalid({ value: { op: 'add', args: [{ op: 'add', args: [1, 1] }, ...Array(61).fill(1)] } });
});

test('Nhận đúng biên 12 điều kiện, 200 giá trị và 20 bậc', () => {
  parse({ value: { ...count(), where: Array(12).fill(['chair', 'in', Array(200).fill('Bí thư')]) }, score: { type: 'steps', steps: Array.from({ length: 20 }, (_, gte) => ({ gte, score: 1 })) } });
});

test('Bản sao công thức không dùng chung bộ lọc, đối số hoặc bậc điểm với đầu vào', () => {
  const input: FormulaSpec = {
    value: { op: 'add', args: [{ ...count(), where: [['chair', 'in', ['Bí thư']]] }, 1] },
    score: { type: 'band', max: 2, bands: [{ gte: 1, score: 'rmax' }], otherwise: 0 }, unit: 'điểm', note: 'Ghi chú',
  };
  const snapshot = structuredClone(input);
  const output = parse(input);
  assert.deepEqual(output, input);
  assert.notEqual(output, input);
  if (typeof output.value !== 'number' && 'args' in output.value) {
    const aggregate = output.value.args[0];
    if (typeof aggregate !== 'number' && 'agg' in aggregate) (aggregate.where?.[0][2] as string[]).push('Chủ tịch');
    output.value.args.push(2);
  }
  if (output.score?.type === 'band') output.score.bands[0].gte = 9;
  assert.deepEqual(input, snapshot);
});

test('Không đọc thuộc tính truy cập và từ chối thuộc tính ký hiệu lạ', () => {
  let called = false;
  invalid({ get value() { called = true; return 1; } });
  assert.equal(called, false);
  invalid({ value: 1, [Symbol('la')]: true });
  invalid(JSON.parse('{"value":1,"__proto__":{}}'));
});

test('Danh sách bảng dữ liệu là duy nhất, sắp xếp và vết tính theo thứ tự duyệt', () => {
  const formula = parse({ value: { op: 'add', args: [count('news'), { op: 'ratio', num: count(), den: count('news') }] } });
  assert.deepEqual(datasetsReferenced(formula), ['meetings', 'news']);
  const calls: string[] = [];
  const result = evaluateFormula(formula, dataset => { calls.push(dataset); return [{}]; });
  assert.deepEqual(calls, ['news', 'meetings', 'news']);
  assert.deepEqual(result.traces.map(trace => trace.dataset), calls);
  assert.deepEqual(datasetsReferenced({ value: 1 }), []);
});

test('Chuẩn hóa số Việt Nam, số phần trăm và số âm', () => {
  for (const [input, expected] of [['1.234,5', 1234.5], ['95,5', 95.5], ['3.450', 3450], ['12%', 12], ['-1.234,50', -1234.5], [0, 0], [12.5, 12.5]] as const) {
    assert.equal(normalized({ amount: input }).amount, expected);
  }
  for (const amount of [Infinity, NaN, '1,234.5', '12abc', '1.23', {}, true]) assert.equal(normalizeRow(columns, { amount }).ok, false);
});

test('Chuẩn hóa ngày Việt Nam, ISO, Date và serial Excel', () => {
  const cases: [unknown, string][] = [
    ['14/10/2026', '2026-10-14'], ['2024-02-29', '2024-02-29'],
    [new Date('2026-10-14T12:00:00Z'), '2026-10-14'], [45658, '2025-01-01'],
    [1, '1900-01-01'], [59, '1900-02-28'], [61, '1900-03-01'],
    [45658.5, '2025-01-01'], [2958465, '9999-12-31'], ['01/01/0099', '0099-01-01'],
  ];
  for (const [date, expected] of cases) assert.equal(normalized({ date }).date, expected);
});

test('Từ chối ngày không tồn tại và serial ngoài phạm vi', () => {
  for (const date of ['31/02/2026', '2026-02-29', '31/04/2026', '2026-13-01', '2026-00-01', '2026-01-00', '0000-01-01', 0, 60, 2958466, new Date(NaN)]) {
    assert.equal(normalizeRow(columns, { date }).ok, false, String(date));
  }
});

test('Chuẩn hóa luận lý có dấu, không dấu, chữ hoa và giá trị số', () => {
  for (const done of [true, 1, 'có', 'CO', ' X ', 'ĐÃ', 'yes']) assert.equal(normalized({ done }).done, true);
  for (const done of [false, 0, 'Không', 'KHONG', 'chưa', 'no']) assert.equal(normalized({ done }).done, false);
  assert.equal(normalizeRow(columns, { done: 'có thể' }).ok, false);
});

test('Danh mục không dấu khớp và giữ nguyên lựa chọn gốc; văn bản được cắt trắng', () => {
  assert.equal(normalized({ status: ' DA DUYET ' }).status, 'Đã duyệt');
  assert.equal(normalized({ chair: '  Bí thư  ' }).chair, 'Bí thư');
  assert.equal(normalizeRow(columns, { status: 'Khác' }).ok, false);
  assert.equal(normalizeRow(columns, { chair: 'a'.repeat(2000) }).ok, true);
  assert.equal(normalizeRow(columns, { chair: 'a'.repeat(2001) }).ok, false);
});

test('Ô không bắt buộc rỗng lưu null, kể cả ô luận lý rỗng', () => {
  assert.deepEqual(normalized({ chair: '  ', amount: null, date: undefined, done: '', status: '' }), {
    chair: null, amount: null, date: null, done: null, status: null,
  });
});

test('Cột bắt buộc thiếu hoặc rỗng có đúng thông báo, số 0 và sai vẫn hợp lệ', () => {
  const required: DatasetColumn[] = [{ key: 'chair', label: 'Chức danh chủ trì', type: 'text', required: true }];
  for (const input of [{}, { chair: '' }, { chair: null }, { chair: undefined }]) {
    assert.deepEqual(normalizeRow(required, input), { ok: false, errors: ['Cột «Chức danh chủ trì» là bắt buộc'] });
  }
  assert.equal(normalizeRow([{ key: 'done', label: 'Đã thực hiện', type: 'boolean', required: true }], { done: false }).ok, true);
  assert.equal(normalizeRow([{ key: 'amount', label: 'Kinh phí', type: 'number', required: true }], { amount: 0 }).ok, true);
});

test('Chuẩn hóa dòng từ chối khóa lạ và đầu vào không phải đối tượng', () => {
  for (const input of [{ unknown: 1 }, null, [], 'dữ liệu', JSON.parse('{"__proto__":{}}')]) assert.equal(normalizeRow(columns, input).ok, false);
  const input = Object.freeze({ chair: ' Bí thư ' });
  normalized(input);
  assert.equal(input.chair, ' Bí thư ');
});

test('Kiểm tra cột trả bản sao sạch và giữ nguyên chuỗi lựa chọn gốc', () => {
  const result = validateColumns(columns);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.columns, columns);
    assert.notEqual(result.columns[0], columns[0]);
    assert.notEqual(result.columns[4].options, columns[4].options);
  }
  assert.equal(validateColumns(Array.from({ length: 40 }, (_, i) => ({ key: `c${i}`, label: `Cột ${i}`, type: 'text' }))).ok, true);
  assert.equal(validateColumns([{ key: 'a'.repeat(40), label: 'a'.repeat(120), type: 'enum', options: Array.from({ length: 50 }, (_, i) => String(i)) }]).ok, true);
});

test('Kiểm tra cột từ chối mã trùng, mã sai và danh mục trùng khi bỏ dấu', () => {
  const bad: unknown[] = [
    [], Array(41).fill(columns[0]), [columns[0], columns[0]],
    ...['Chair', '1chair', 'chu-tri', 'chủ_trì', 'a'.repeat(41)].map(key => [{ ...columns[0], key }]),
    [{ ...columns[0], label: ' ' }], [{ ...columns[0], label: 'a'.repeat(121) }],
    [{ ...columns[0], extra: true }], [{ ...columns[0], required: 'có' }],
    [{ ...columns[0], options: ['a'] }], [{ ...columns[0], type: 'unknown' }],
    [{ key: 'status', label: 'Trạng thái', type: 'enum', options: [] }],
    [{ key: 'status', label: 'Trạng thái', type: 'enum', options: ['Đã duyệt', ' DA DUYET '] }],
    [{ key: 'status', label: 'Trạng thái', type: 'enum', options: [''] }],
    [{ key: 'status', label: 'Trạng thái', type: 'enum', options: Array.from({ length: 51 }, (_, i) => String(i)) }],
  ];
  for (const input of bad) assert.equal(validateColumns(input).ok, false);
});

test('Mô tả công thức dùng nhãn bảng và cột bằng tiếng Việt', () => {
  const formula = parse({ value: { op: 'ratio', num: { ...count(), where: [['chair', 'in', ['Bí thư', 'Chủ tịch']]] }, den: count() }, score: { type: 'linear', max: 2 } });
  const text = formatFormula(formula, { dataset: () => 'Cuộc họp CĐS', column: (_, key) => columns.find(column => column.key === key)!.label });
  for (const expected of ['Tỷ lệ', 'Cuộc họp CĐS', 'Chức danh chủ trì', '[Bí thư, Chủ tịch]', 'tuyến tính tối đa 2 điểm']) assert.ok(text.includes(expected), text);
});

test('Mô tả dải điểm giải thích điểm bằng tỷ lệ và tỷ lệ nhân điểm tối đa', () => {
  const formula = parse({ value: 0.95, score: { type: 'band', max: 5, bands: [{ gte: 0.5, score: 'rmax' }, { gte: 0.9, score: 'r' }, { gte: 1, score: 5 }] }, unit: 'điểm', note: 'Theo dữ liệu đã duyệt' });
  const snapshot = structuredClone(formula);
  const text = formatFormula(formula);
  assert.ok(text.includes('từ 0,9 được giá trị công thức điểm'));
  assert.ok(text.includes('giá trị công thức nhân 5'));
  assert.ok(text.indexOf('từ 1 ') < text.indexOf('từ 0,9'));
  assert.ok(text.includes('Theo dữ liệu đã duyệt'));
  evaluateFormula(formula, () => []);
  assert.deepEqual(formula, snapshot);
});
