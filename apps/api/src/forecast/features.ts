import { dueReportPeriods, parsePeriodKey, periodBounds, reportDeadline } from '../periods';
import type { TargetFrequency } from '@prisma/client';
import { contributions, type LogisticModel, type Sample } from './model';

const DAY = 86_400_000;
export interface Observation {
  value: number; at: Date; periodKey: string | null; approvedAt?: Date; status?: string;
}
export interface ForecastInput {
  id: string; group?: string; year: number; title: string; unit: string; targetValue: number;
  direction: string; kind: string; frequency: TargetFrequency; dueDate: Date; createdAt: Date;
  reportDueDay?: number | null; assignedAt?: Date | null; assigneeId?: string | null;
  observations: Observation[]; events?: { action: string; createdAt: Date }[];
  explanations?: { createdAt: Date; respondedAt: Date | null; status: string }[]; simulated?: boolean;
}
export const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
export function startOfTarget(input: Pick<ForecastInput, 'year' | 'createdAt' | 'kind'>): Date {
  const yearStart = new Date(Date.UTC(input.year, 0, 1, -7));
  // Nhiệm vụ tính từ ngày giao; chỉ tiêu năm tính từ đầu năm dù nhập vào hệ thống muộn.
  return input.kind === 'TASK' && input.createdAt > yearStart ? input.createdAt : yearStart;
}
export function isRatio(input: Pick<ForecastInput, 'unit' | 'kind' | 'direction'>): boolean {
  return input.unit.includes('%') || /tỷ lệ|ty le|phần trăm/i.test(input.unit) || input.kind === 'SCORE' || input.direction === 'LOWER_IS_BETTER';
}
export function attainment(value: number, target: number, direction: string): number {
  const scale = Math.max(Math.abs(target), 1);
  return clamp(direction === 'LOWER_IS_BETTER' ? 1 + (target - value) / scale : value / scale, -2, 3);
}
export function observationsAt(input: ForecastInput, at: Date): Observation[] {
  return input.observations.filter(row => row.at <= at && (!row.approvedAt || row.approvedAt <= at) && (!row.status || row.status === 'APPROVED'))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}
export function linearFit(points: { x: number; y: number }[]) {
  const count = points.length;
  const meanX = points.reduce((sum, row) => sum + row.x, 0) / Math.max(count, 1), meanY = points.reduce((sum, row) => sum + row.y, 0) / Math.max(count, 1);
  const sxx = points.reduce((sum, row) => sum + (row.x - meanX) ** 2, 0);
  const slope = sxx ? points.reduce((sum, row) => sum + (row.x - meanX) * (row.y - meanY), 0) / sxx : 0;
  const intercept = meanY - slope * meanX;
  const variance = count > 2 ? points.reduce((sum, row) => sum + (row.y - intercept - slope * row.x) ** 2, 0) / (count - 2) : null;
  return { slope, intercept, variance, sxx, meanX, count };
}
export function extractFeatures(input: ForecastInput, at: Date) {
  const start = startOfTarget(input), duration = Math.max(DAY, input.dueDate.getTime() - start.getTime());
  const elapsed = clamp((at.getTime() - start.getTime()) / duration, 0, 1);
  const observations = observationsAt(input, at), latest = observations.at(-1), currentValue = latest?.value ?? 0;
  // Không có báo cáo không đồng nghĩa đạt chỉ tiêu càng thấp càng tốt.
  const achieved = latest ? attainment(currentValue, input.targetValue, input.direction) : 0;
  const recent = observations.slice(-5).map(row => ({ x: (row.at.getTime() - start.getTime()) / duration, y: attainment(row.value, input.targetValue, input.direction) }));
  const slope = clamp(linearFit(recent).slope, -5, 5);
  const due = dueReportPeriods(input.frequency, input.year, input.reportDueDay, at, input.createdAt).filter(row => row.overdue && row.deadline <= input.dueDate);
  const submitted = input.observations.filter(row => row.at <= at && row.status !== 'REJECTED');
  const reported = new Set(submitted.map(row => row.periodKey));
  const missing = due.filter(row => !reported.has(row.key)).length;
  const late = due.filter(period => {
    const reports = submitted.filter(row => row.periodKey === period.key);
    return reports.length && reports.every(row => row.at > period.deadline);
  }).length;
  const rejected = input.observations.filter(row => row.at <= at && row.status === 'REJECTED' && (!row.approvedAt || row.approvedAt <= at)).length;
  const transfers = (input.events ?? []).filter(event => event.createdAt <= at && ['TRANSFERRED', 'RETURNED'].includes(event.action)).length;
  const explanation = (input.explanations ?? []).some(row => row.createdAt <= at && (!row.respondedAt || row.respondedAt > at));
  const assignment = (input.events ?? []).filter(event => event.createdAt <= at && event.action === 'ASSIGNED').sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0]?.createdAt ?? input.assignedAt;
  const unassignedDays = Math.max(0, Math.floor(((assignment && assignment <= at ? assignment : at).getTime() - Math.max(start.getTime(), input.createdAt.getTime())) / DAY));
  const x = [achieved, elapsed, achieved - elapsed, slope, due.length ? late / due.length : 0, due.length ? missing / due.length : 0,
    Math.min(rejected, 20), Math.min(transfers, 20), Number(explanation), Math.min(unassignedDays, 365),
    Number(input.kind === 'SCORE'), Number(input.kind === 'TASK'), Number(input.direction === 'LOWER_IS_BETTER'),
    Number(input.frequency === 'MONTHLY'), Number(input.frequency === 'QUARTERLY'), Number(input.frequency === 'SEMIANNUAL'), Number(isRatio(input))];
  return { x, currentValue, observations, elapsed, achieved, late, missing, dueCount: due.length, rejected, transfers, explanation, unassignedDays, slope };
}

/** Chỉ dùng hồ sơ kết thúc; đặc trưng ở mốc t tuyệt đối không đọc báo cáo/sự kiện sau t. */
export function historicalSamples(inputs: ForecastInput[], now = new Date()): Sample[] {
  return inputs.flatMap(input => {
    if (input.dueDate >= now || input.kind === 'STAT') return [];
    const approved = observationsAt(input, now);
    if (approved.length < 2) return [];
    const final = approved.at(-1)!;
    const atDeadline = observationsAt(input, input.dueDate).at(-1);
    const meets = (value: number) => input.direction === 'LOWER_IS_BETTER' ? value <= input.targetValue : value >= input.targetValue;
    const y: 0 | 1 = meets(final.value) && atDeadline && meets(atDeadline.value) ? 0 : 1;
    const start = startOfTarget(input), duration = input.dueDate.getTime() - start.getTime();
    return [0.25, 0.5, 0.65, 0.8].map(fraction => {
      const at = new Date(start.getTime() + duration * fraction);
      return { group: input.group ?? input.id, x: extractFeatures(input, at).x, y, simulated: input.simulated };
    });
  });
}

export function explain(input: ForecastInput, at: Date, model: LogisticModel): string[] {
  const f = extractFeatures(input, at), impact = contributions(model, f.x);
  const pace = `Đạt ${Math.round(f.achieved * 100)}% khi đã qua ${Math.round(f.elapsed * 100)}% thời gian`;
  const texts: Record<number, string> = {
    0: pace, 1: pace, 2: pace, 3: f.slope < 0 ? 'Xu hướng thực hiện các kỳ gần đây giảm' : 'Nhịp thực hiện các kỳ gần đây tăng',
    4: `Chậm ${f.late}/${f.dueCount} kỳ báo cáo`, 5: `Thiếu ${f.missing}/${f.dueCount} kỳ báo cáo`,
    6: `${f.rejected} lần báo cáo bị trả lại`, 7: `${f.transfers} lần chuyển hoặc trả việc`,
    8: 'Có yêu cầu giải trình đang mở', 9: `Chưa giao người trong ${f.unassignedDays} ngày`,
  };
  const eligible = [0, 1, 2, 3, ...(f.late ? [4] : []), ...(f.missing ? [5] : []), ...(f.rejected ? [6] : []), ...(f.transfers ? [7] : []), ...(f.explanation ? [8] : []), ...(f.unassignedDays ? [9] : [])];
  const chosen = eligible.sort((a, b) => Math.abs(impact[b]) - Math.abs(impact[a])).map(index => texts[index]);
  return [...new Set([...(!f.observations.length ? ['Chưa có báo cáo số liệu được duyệt'] : []), ...chosen, pace])].slice(0, 3);
}

export function observationFromHistory(row: { value: number; reportedAt: Date; periodKey: string }): Observation {
  return { value: row.value, at: row.reportedAt, approvedAt: row.reportedAt, periodKey: row.periodKey, status: 'APPROVED' };
}
export function validHistoricalPeriod(periodKey: string, year: number) { return parsePeriodKey(periodKey)?.year === year; }
export { periodBounds, reportDeadline };
