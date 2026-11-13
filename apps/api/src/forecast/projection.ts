import { clamp, extractFeatures, type ForecastInput, isRatio, linearFit, startOfTarget } from './features';

export interface ForecastPoint { date: string; actual: number | null; predicted: number | null; lower: number | null; upper: number | null }
export function projectValue(input: ForecastInput, at: Date) {
  const f = extractFeatures(input, at), start = startOfTarget(input), duration = Math.max(86_400_000, input.dueDate.getTime() - start.getTime());
  const points = f.observations.map(row => ({ x: clamp((row.at.getTime() - start.getTime()) / duration, 0, 1), y: row.value }));
  const ratio = isRatio(input), fit = linearFit(points);
  // Tỷ lệ so với kế hoạch (ví dụ thu ngân sách) có thể vượt 100%; không cắt dự báo theo ký hiệu đơn vị.
  const bound = (value: number) => Math.max(0, value);
  const rate = f.elapsed > 0 ? f.currentValue / f.elapsed : 0;
  const estimate = (x: number) => bound(ratio ? points.length >= 2 ? fit.intercept + fit.slope * x : f.currentValue : rate * x);
  const residualVariance = points.length > 2 ? ratio ? fit.variance : points.reduce((sum, row) => sum + (row.y - rate * row.x) ** 2, 0) / (points.length - 1) : null;
  // Khoảng dự báo 95% từ phần dư; dùng t tới hạn bảo thủ khi ít kỳ. Không có đủ điểm thì trả null.
  const t = points.length <= 4 ? 4.303 : points.length <= 7 ? 2.776 : points.length <= 12 ? 2.262 : 1.96;
  const intervalAt = (x: number) => {
    if (residualVariance === null) return null;
    const uncertainty = t * Math.sqrt(residualVariance * (1 + 1 / points.length + (fit.sxx ? (x - fit.meanX) ** 2 / fit.sxx : 0)));
    return { lower: bound(estimate(x) - uncertainty), upper: bound(estimate(x) + uncertainty) };
  };
  const series: ForecastPoint[] = f.observations.map(row => ({ date: row.at.toISOString(), actual: row.value, predicted: null, lower: null, upper: null }));
  for (let step = 0; step <= 6; step++) {
    const x = f.elapsed + (1 - f.elapsed) * step / 6, interval = intervalAt(x);
    series.push({ date: new Date(start.getTime() + duration * x).toISOString(), actual: null, predicted: estimate(x), lower: interval?.lower ?? null, upper: interval?.upper ?? null });
  }
  return { projectedValue: estimate(1), interval: intervalAt(1), series, method: ratio ? 'Hồi quy tuyến tính theo thời gian' : 'Ngoại suy theo nhịp cộng dồn', intervalLabel: residualVariance === null ? 'Chưa đủ kỳ để tính khoảng dự báo' : 'Khoảng dự báo 95% từ phần dư' };
}
