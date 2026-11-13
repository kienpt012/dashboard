/** Mô hình logistic có chuẩn hoá, L2 và chia tập theo chỉ tiêu. Không dùng thư viện ML. */
export const FEATURE_VERSION = 'ioc-risk-v1';
export const FEATURES = [
  ['attainment', 'Tỷ lệ đạt mức giao'], ['elapsed', 'Tỷ lệ thời gian đã qua'],
  ['paceGap', 'Chênh lệch nhịp thực hiện'], ['slope', 'Xu hướng các kỳ gần nhất'],
  ['lateRate', 'Tỷ lệ báo cáo trễ'], ['missingRate', 'Tỷ lệ kỳ thiếu báo cáo'],
  ['returns', 'Số lần trả lại báo cáo'], ['transfers', 'Số lần chuyển, trả việc'],
  ['explanation', 'Giải trình đang mở'], ['unassignedDays', 'Số ngày chưa giao người'],
  ['score', 'Bộ chấm điểm'], ['task', 'Bộ nhiệm vụ'], ['lower', 'Chiều càng thấp càng tốt'],
  ['monthly', 'Báo cáo tháng'], ['quarterly', 'Báo cáo quý'], ['semiannual', 'Báo cáo sáu tháng'],
  ['ratio', 'Chỉ tiêu tỷ lệ'],
] as const;

export interface Sample { group: string; x: number[]; y: 0 | 1; simulated?: boolean }
export interface Metrics { auc: number | null; accuracy: number; brier: number; confusion: { tp: number; tn: number; fp: number; fn: number } }
export interface LogisticModel {
  featureVersion: string; coefficients: number[]; intercept: number; means: number[]; scales: number[];
  trained: boolean; fallbackReason: string | null; sampleCount: number; targetCount: number;
  trainSamples: number; testSamples: number; simulatedSamples: number; metrics: Metrics | null;
}

const PRIOR = [-2.1, 1.6, -2.8, -0.8, 1.1, 1.6, 0.18, 0.16, 0.5, 0.012, 0, 0.1, 0, 0, 0, 0, 0];
export function fallbackModel(reason = 'Chưa đủ dữ liệu để huấn luyện'): LogisticModel {
  return { featureVersion: FEATURE_VERSION, coefficients: [...PRIOR], intercept: -0.3,
    means: FEATURES.map(() => 0), scales: FEATURES.map(() => 1), trained: false, fallbackReason: reason,
    sampleCount: 0, targetCount: 0, trainSamples: 0, testSamples: 0, simulatedSamples: 0, metrics: null };
}
export const sigmoid = (z: number) => 1 / (1 + Math.exp(-Math.max(-35, Math.min(35, z))));
export function contributions(model: LogisticModel, x: number[]): number[] {
  return model.coefficients.map((weight, index) => weight * ((x[index] ?? 0) - model.means[index]) / model.scales[index]);
}
export function predict(model: LogisticModel, x: number[]): number {
  return sigmoid(model.intercept + contributions(model, x).reduce((sum, value) => sum + value, 0));
}
export function evaluatePredictions(labels: readonly number[], probabilities: readonly number[]): Metrics {
  const confusion = { tp: 0, tn: 0, fp: 0, fn: 0 };
  labels.forEach((label, index) => {
    const positive = probabilities[index] >= 0.5;
    if (label === 1) positive ? confusion.tp++ : confusion.fn++;
    else positive ? confusion.fp++ : confusion.tn++;
  });
  // Mann–Whitney, hạng trung bình cho xác suất bằng nhau: O(n log n), không so mọi cặp.
  const ranked = labels.map((label, index) => ({ label, p: probabilities[index] })).sort((a, b) => a.p - b.p);
  let positiveRanks = 0;
  for (let start = 0; start < ranked.length;) {
    let end = start + 1;
    while (end < ranked.length && ranked[end].p === ranked[start].p) end++;
    const rank = (start + 1 + end) / 2;
    for (let index = start; index < end; index++) if (ranked[index].label === 1) positiveRanks += rank;
    start = end;
  }
  const positives = labels.filter(value => value === 1).length, negatives = labels.length - positives;
  return {
    auc: positives && negatives ? (positiveRanks - positives * (positives + 1) / 2) / (positives * negatives) : null,
    accuracy: labels.length ? (confusion.tp + confusion.tn) / labels.length : 0,
    brier: labels.length ? probabilities.reduce((sum, p, index) => sum + (p - labels[index]) ** 2, 0) / labels.length : 0,
    confusion,
  };
}

function seededRandom(seed: number) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
/** Tất cả mốc, kể cả các năm của cùng chỉ tiêu, luôn ở cùng một tập. */
export function splitByTarget(samples: Sample[], seed = 20261113): { train: Sample[]; test: Sample[] } {
  const byGroup = new Map<string, Sample[]>();
  for (const sample of samples) byGroup.set(sample.group, [...byGroup.get(sample.group) ?? [], sample]);
  const random = seededRandom(seed), testGroups = new Set<string>();
  for (const label of [0, 1]) {
    const groups = [...byGroup].filter(([, rows]) => Number(rows.reduce((sum, row) => sum + row.y, 0) / rows.length >= 0.5) === label).map(([group]) => group).sort();
    for (let index = groups.length - 1; index > 0; index--) { const next = Math.floor(random() * (index + 1)); [groups[index], groups[next]] = [groups[next], groups[index]]; }
    const count = groups.length >= 2 ? Math.max(1, Math.floor(groups.length * 0.25)) : 0;
    groups.slice(0, count).forEach(group => testGroups.add(group));
  }
  return { train: samples.filter(sample => !testGroups.has(sample.group)), test: samples.filter(sample => testGroups.has(sample.group)) };
}

export function trainLogistic(samples: Sample[], options: { iterations?: number; learningRate?: number; l2?: number } = {}): LogisticModel {
  const valid = samples.filter(sample => sample.x.length === FEATURES.length && sample.x.every(Number.isFinite));
  const model = fallbackModel();
  model.sampleCount = valid.length; model.targetCount = new Set(valid.map(row => row.group)).size;
  model.simulatedSamples = valid.filter(row => row.simulated).length;
  if (valid.length < 40 || model.targetCount < 12) return model;
  if (new Set(valid.map(row => row.y)).size < 2) { model.fallbackReason = 'Chưa đủ dữ liệu để huấn luyện: lịch sử chỉ có một lớp kết quả'; return model; }
  const { train, test } = splitByTarget(valid);
  if (!train.length || !test.length || new Set(train.map(row => row.y)).size < 2 || new Set(test.map(row => row.y)).size < 2) {
    model.fallbackReason = 'Chưa đủ dữ liệu để huấn luyện: mỗi tập cần cả chỉ tiêu đạt và không đạt'; return model;
  }
  model.means = FEATURES.map((_, j) => train.reduce((sum, row) => sum + row.x[j], 0) / train.length);
  model.scales = FEATURES.map((_, j) => Math.sqrt(train.reduce((sum, row) => sum + (row.x[j] - model.means[j]) ** 2, 0) / train.length) || 1);
  const normalized = train.map(row => row.x.map((value, j) => (value - model.means[j]) / model.scales[j]));
  model.coefficients = FEATURES.map(() => 0); model.intercept = 0;
  const iterations = options.iterations ?? 1800, rate = options.learningRate ?? 0.07, l2 = options.l2 ?? 0.015;
  // Ràng buộc dấu tránh xác suất tăng khi mức đạt/nhịp tốt hơn, và giảm khi nhiều kỳ bị trễ hơn.
  const negative = new Set([0, 2, 3]), positive = new Set([1, 4, 5, 6, 7, 8, 9]);
  for (let iteration = 0; iteration < iterations; iteration++) {
    const gradient = FEATURES.map(() => 0); let interceptGradient = 0;
    normalized.forEach((x, i) => {
      const error = sigmoid(model.intercept + x.reduce((sum, value, j) => sum + value * model.coefficients[j], 0)) - train[i].y;
      interceptGradient += error;
      for (let j = 0; j < x.length; j++) gradient[j] += error * x[j];
    });
    model.intercept -= rate * interceptGradient / train.length;
    model.coefficients = model.coefficients.map((weight, j) => {
      const updated = weight - rate * (gradient[j] / train.length + l2 * weight);
      return negative.has(j) ? Math.min(0, updated) : positive.has(j) ? Math.max(0, updated) : updated;
    });
  }
  model.trained = true; model.fallbackReason = null; model.trainSamples = train.length; model.testSamples = test.length;
  model.metrics = evaluatePredictions(test.map(row => row.y), test.map(row => predict(model, row.x)));
  return model;
}
