import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { FEATURES, evaluatePredictions, fallbackModel, predict, splitByTarget, trainLogistic, type Sample } from '../src/forecast/model';
import { extractFeatures, historicalSamples, type ForecastInput } from '../src/forecast/features';
import { projectValue } from '../src/forecast/projection';
import { assertForecastAdmin } from '../src/forecast/service';
import { parseCsv, validateHistoryRows, HISTORY_HEADERS } from '../src/forecast/history';

function separable(): Sample[] {
  return Array.from({ length: 60 }, (_, group) => Array.from({ length: 4 }, (_, point): Sample => {
    const y = (group % 2) as 0 | 1, x = FEATURES.map(() => 0);
    x[0] = y ? 0.1 + point * 0.03 : 0.8 + point * 0.02; x[1] = 0.7; x[2] = x[0] - x[1]; x[4] = y ? 0.5 : 0; x[5] = y ? 0.3 : 0;
    return { group: `target-${group}`, x, y };
  })).flat();
}
function target(overrides: Partial<ForecastInput> = {}): ForecastInput {
  return { id: 'a', title: 'Thu ngân sách', year: 2025, unit: 'Triệu đồng', targetValue: 100, direction: 'HIGHER_IS_BETTER', kind: 'PLAN', frequency: 'MONTHLY', dueDate: new Date('2025-12-31T16:59:59.999Z'), createdAt: new Date('2024-12-31T17:00:00Z'), assignedAt: new Date('2024-12-31T17:00:00Z'),
    observations: [3, 6, 9, 12].map(month => ({ value: month * 10, at: new Date(`2025-${String(month).padStart(2, '0')}-15T08:00:00Z`), periodKey: `2025-M${String(month).padStart(2, '0')}`, status: 'APPROVED' })), ...overrides };
}
test('logistic học dữ liệu tách được, AUC > 0,9 và seed tái lập', () => {
  const model = trainLogistic(separable());
  assert.equal(model.trained, true); assert.ok(model.metrics!.auc! > 0.9); assert.ok(model.metrics!.brier < 0.1);
  assert.deepEqual(trainLogistic(separable()), model);
});
test('chia tập theo chỉ tiêu: không rò các mốc của cùng chỉ tiêu', () => {
  const split = splitByTarget(separable()), train = new Set(split.train.map(row => row.group));
  assert.ok(split.test.every(row => !train.has(row.group))); assert.ok(split.test.length > 0);
});
test('ít mẫu hoặc một lớp dùng tiên nghiệm và không bịa chỉ số', () => {
  for (const data of [separable().slice(0, 10), separable().map(row => ({ ...row, y: 1 as const }))]) {
    const model = trainLogistic(data); assert.equal(model.trained, false); assert.equal(model.metrics, null); assert.match(model.fallbackReason!, /Chưa đủ dữ liệu/);
  }
});
test('AUC xử lý đồng hạng và thiếu lớp', () => {
  assert.equal(evaluatePredictions([0, 1], [0.5, 0.5]).auc, 0.5);
  assert.equal(evaluatePredictions([1, 1], [0.2, 0.8]).auc, null);
});
test('xác suất đơn điệu: đạt cao hơn giảm nguy cơ, thiếu kỳ làm tăng nguy cơ', () => {
  for (const model of [fallbackModel(), trainLogistic(separable())]) {
    const low = FEATURES.map(() => 0); low[0] = 0.3; low[1] = 0.8; low[2] = -0.5;
    const high = [...low]; high[0] = 0.7; high[2] = -0.1;
    assert.ok(predict(model, low) > predict(model, high));
    const missing = [...low]; missing[5] = 0.8; assert.ok(predict(model, missing) >= predict(model, low));
  }
});
test('đặc trưng tại t không đọc báo cáo, trả lại hoặc chuyển việc tương lai', () => {
  const base = target(), cutoff = new Date('2025-07-01T00:00:00Z');
  const before = extractFeatures(base, cutoff);
  const after = extractFeatures({ ...base, observations: [...base.observations, { value: 999, at: new Date('2025-10-01'), status: 'APPROVED', periodKey: '2025-M10' }], events: [{ action: 'TRANSFERRED', createdAt: new Date('2025-10-01') }], explanations: [{ status: 'OPEN', createdAt: new Date('2025-10-01'), respondedAt: null }] }, cutoff);
  assert.deepEqual(before.x, after.x); assert.equal(before.currentValue, 60);
});
test('báo cáo được duyệt sau mốc t chưa được tính vào số thực hiện', () => {
  const input = target({ observations: [{ value: 99, at: new Date('2025-03-01'), approvedAt: new Date('2025-09-01'), status: 'APPROVED', periodKey: '2025-M03' }] });
  assert.equal(extractFeatures(input, new Date('2025-07-01')).currentValue, 0);
});
test('nhãn cuối kỳ không đạt hoặc đạt sau hạn đều là 1', () => {
  assert.ok(historicalSamples([target()], new Date('2026-01-10')).every(row => row.y === 0));
  const late = target(); late.observations[3].at = new Date('2026-01-02');
  assert.ok(historicalSamples([late], new Date('2026-01-10')).every(row => row.y === 1));
  assert.equal(historicalSamples([target()], new Date('2025-07-01')).length, 0);
});
test('càng thấp càng tốt: số thấp giảm nguy cơ và hồi quy đúng hướng', () => {
  const lower = target({ targetValue: 5, unit: '%', direction: 'LOWER_IS_BETTER', observations: [3, 6, 9].map((month, i) => ({ value: 10 - i * 2, at: new Date(`2025-${String(month).padStart(2, '0')}-15`), periodKey: `2025-M${String(month).padStart(2, '0')}` })) });
  const at = new Date('2025-10-01'), f = extractFeatures(lower, at), projection = projectValue(lower, at);
  const worse = target({ ...lower, observations: lower.observations.map(row => ({ ...row, value: row.value + 3 })) });
  assert.ok(predict(fallbackModel(), f.x) < predict(fallbackModel(), extractFeatures(worse, at).x));
  assert.ok(projection.projectedValue < 5); assert.ok(projection.interval); assert.ok(projection.interval!.lower <= projection.projectedValue && projection.interval!.upper >= projection.projectedValue);
  assert.equal(extractFeatures({ ...lower, observations: [] }, at).achieved, 0);
});
test('ngoại suy cộng dồn theo nhịp và không tạo khoảng giả khi ít kỳ', () => {
  const result = projectValue(target(), new Date('2025-09-30T08:00:00Z'));
  assert.ok(result.projectedValue > 115 && result.projectedValue < 125); assert.ok(result.interval);
  assert.equal(projectValue(target({ observations: [] }), new Date('2025-09-30')).interval, null);
});

test('tỷ lệ so với kế hoạch có thể dự báo vượt 100 phần trăm', () => {
  const input = target({ unit: '%', targetValue: 105 });
  assert.ok(projectValue(input, new Date('2025-09-30')).projectedValue > 100);
});
test('quyền quản lý mô hình chỉ ADMIN/LEADER, kể cả gọi service trực tiếp', () => {
  for (const role of ['ADMIN', 'LEADER'] as const) assert.doesNotThrow(() => assertForecastAdmin({ role }));
  for (const role of ['MANAGER', 'STAFF', 'VIEWER', 'CLERK'] as const) assert.throws(() => assertForecastAdmin({ role }), ForbiddenException);
});
test('CSV có ô trích dẫn, tiếng Việt và dòng mới được đọc đúng', () => {
  assert.deepEqual(parseCsv('Tên,Kỳ\r\n"Thu, chi",2025-M01\r\n"Hai\ndòng",2025-M02'), [['Tên', 'Kỳ'], ['Thu, chi', '2025-M01'], ['Hai\ndòng', '2025-M02']]);
  assert.throws(() => parseCsv('a,b\n"abc,def'));
});
test('lịch sử kiểm tra năm/kỳ, ngày thực, công thức, trùng và tính nhất quán', () => {
  const row = [2025, 'CT01', 'Thu ngân sách', '2025-M01', 10, 100, '2025-01-15', '2025-12-31', 'Triệu đồng', 'HIGHER_IS_BETTER', 'PLAN'];
  assert.equal(validateHistoryRows([HISTORY_HEADERS, row], new Date('2026-01-10')).length, 1);
  for (const bad of [row.map((v, i) => i === 6 ? '2025-02-30' : v), row.map((v, i) => i === 4 ? { formula: '1+1' } : v), row.map((v, i) => i === 3 ? '2024-M01' : v)]) assert.throws(() => validateHistoryRows([HISTORY_HEADERS, bad], new Date('2026-01-10')));
  assert.throws(() => validateHistoryRows([HISTORY_HEADERS, row, row], new Date('2026-01-10')));
  assert.throws(() => validateHistoryRows([HISTORY_HEADERS, row, row.map((v, i) => i === 3 ? '2025-M02' : i === 5 ? 200 : v)], new Date('2026-01-10')));
});
