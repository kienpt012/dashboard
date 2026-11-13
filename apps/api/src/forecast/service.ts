import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type FrameworkKind, type PrismaClient } from '@prisma/client';
import { type Actor, audit, isLeadership, resolveReadDepartmentScope } from '../access';
import { PrismaService } from '../prisma.service';
import { currentVietnamYear } from '../planning-date';
import { explain, extractFeatures, type ForecastInput, historicalSamples, observationFromHistory } from './features';
import { FEATURES, FEATURE_VERSION, fallbackModel, type LogisticModel, type Metrics, predict, trainLogistic } from './model';
import { projectValue } from './projection';
import type { HistoricalRow } from './history';

export function assertForecastAdmin(actor: Pick<Actor, 'role'>) {
  if (!isLeadership(actor)) throw new ForbiddenException('Chỉ quản trị và lãnh đạo được quản lý mô hình dự báo');
}
export function forecastYear(raw?: string) {
  if (!raw) return currentVietnamYear();
  const year = Number(raw); if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new BadRequestException('Năm không hợp lệ'); return year;
}
const targetInclude = {
  department: { select: { id: true, name: true } },
  sourceDocument: { select: { docNumber: true } },
  framework: { select: { name: true, legalBasis: true, sourceDocument: { select: { docNumber: true } } } },
  updates: { orderBy: { createdAt: 'asc' as const } },
  workEvents: { select: { action: true, createdAt: true } },
  explanationRequests: { select: { createdAt: true, respondedAt: true, status: true } },
} satisfies Prisma.TargetInclude;
type LoadedTarget = Prisma.TargetGetPayload<{ include: typeof targetInclude }>;
function inputFromTarget(target: LoadedTarget): ForecastInput {
  const observations = target.updates.map(row => ({ value: row.value, at: row.createdAt, approvedAt: row.reviewedAt ?? row.createdAt, periodKey: row.periodKey, status: row.reviewStatus }));
  // Chỉ tiêu tính tự động chưa có lịch sử kỳ chỉ dùng giá trị tính gần nhất; không dựng lịch sử giả.
  if (!observations.length && target.lastReportedAt && target.valueSource !== 'MANUAL') observations.push({ value: target.currentValue, at: target.lastReportedAt, approvedAt: target.lastReportedAt, periodKey: null, status: 'APPROVED' });
  return { ...target, group: target.standardCode ? `live:${target.standardCode}:${target.unit}:${target.direction}` : `live:${target.id}`, observations, events: target.workEvents, explanations: target.explanationRequests };
}
type StoredModel = Awaited<ReturnType<PrismaClient['forecastModel']['findFirst']>>;
function deserialize(row: StoredModel): LogisticModel {
  if (!row || row.featureVersion !== FEATURE_VERSION) return fallbackModel();
  const coefficients = row.coefficients as number[], means = row.means as number[], scales = row.scales as number[];
  if (![coefficients, means, scales].every(values => Array.isArray(values) && values.length === FEATURES.length && values.every(Number.isFinite)) || scales.some(value => value <= 0)) return fallbackModel('Mô hình lưu không tương thích, cần huấn luyện lại');
  return { ...row, coefficients, means, scales, metrics: row.metrics as unknown as Metrics | null };
}
function sourceLabel(model: LogisticModel, date?: Date | null) {
  if (!model.trained) return 'Ước lượng theo nhịp thực hiện (chưa đủ dữ liệu huấn luyện)';
  const day = date ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }).format(date) : '';
  return `Mô hình huấn luyện ngày ${day}, ${model.sampleCount} mẫu${model.simulatedSamples ? ` (${model.simulatedSamples} mẫu mô phỏng)` : ''}`;
}
function modelInfo(row: StoredModel) {
  const model = deserialize(row), total = model.coefficients.reduce((sum, value) => sum + Math.abs(value), 0) || 1;
  return { id: row?.id ?? null, trainedAt: row?.trainedAt ?? null, ...model,
    sourceLabel: sourceLabel(model, row?.trainedAt),
    evaluationLabel: model.simulatedSamples ? 'Chỉ số kiểm tra có dữ liệu mô phỏng; chưa chứng minh độ chính xác trên số liệu thực tế' : model.trained ? 'Chỉ số trên tập kiểm tra tách theo chỉ tiêu' : 'Chưa có chỉ số kiểm tra',
    importance: FEATURES.map(([feature, label], index) => ({ feature, label, weight: model.coefficients[index], importance: Math.abs(model.coefficients[index]) / total })).sort((a, b) => b.importance - a.importance),
  };
}
const FORECAST_KINDS: FrameworkKind[] = ['PLAN', 'SCORE'];
export async function loadTrainingInputs(prisma: PrismaClient, now = new Date()): Promise<ForecastInput[]> {
  const [targets, history] = await Promise.all([
    // Nhiệm vụ của văn bản chỉ đạo chỉ có xong/chưa xong và một hạn: không đủ tín hiệu để dự báo, đã có theo dõi hạn riêng.
    prisma.target.findMany({ where: { kind: { in: FORECAST_KINDS }, dueDate: { lt: now } }, include: targetInclude }),
    prisma.forecastHistory.findMany({ where: { dueDate: { lt: now } }, orderBy: [{ seriesKey: 'asc' }, { year: 'asc' }, { reportedAt: 'asc' }] }),
  ]);
  const groups = new Map<string, typeof history>();
  for (const row of history) { const key = `${row.seriesKey}:${row.year}:${row.simulated}`; groups.set(key, [...groups.get(key) ?? [], row]); }
  return [...targets.map(inputFromTarget), ...[...groups].map(([key, rows]): ForecastInput => {
    const row = rows[0];
    return { id: key, group: `history:${row.seriesKey}`, title: row.title, year: row.year, unit: row.unit, targetValue: row.targetValue, direction: row.direction, kind: row.kind, frequency: row.frequency, dueDate: row.dueDate, createdAt: new Date(Date.UTC(row.year, 0, 1, -7)),
      assignedAt: new Date(Date.UTC(row.year, 0, 1, -7)), observations: rows.map(observationFromHistory), simulated: row.simulated };
  })];
}
export async function trainForecast(prisma: PrismaClient, actor: Actor, now = new Date()) {
  assertForecastAdmin(actor);
  const model = trainLogistic(historicalSamples(await loadTrainingInputs(prisma, now), now));
  const row = await prisma.$transaction(async tx => {
    const saved = await tx.forecastModel.create({ data: { ...model, coefficients: model.coefficients, means: model.means, scales: model.scales, metrics: model.metrics ? JSON.parse(JSON.stringify(model.metrics)) : Prisma.DbNull, trainedById: actor.id, trainedAt: now } });
    await audit(tx, actor, { action: 'FORECAST_TRAINED', entityType: 'ForecastModel', entityId: saved.id, metadata: { trained: model.trained, samples: model.sampleCount, simulatedSamples: model.simulatedSamples, featureVersion: model.featureVersion } });
    return saved;
  });
  return modelInfo(row);
}

@Injectable()
export class ForecastService {
  constructor(private readonly prisma: PrismaService) {}
  async model(actor: Actor) {
    assertForecastAdmin(actor);
    const [row, realHistoryRows, simulatedHistoryRows] = await Promise.all([
      this.prisma.forecastModel.findFirst({ orderBy: { trainedAt: 'desc' } }), this.prisma.forecastHistory.count({ where: { simulated: false } }), this.prisma.forecastHistory.count({ where: { simulated: true } }),
    ]);
    return { ...modelInfo(row), history: { realRows: realHistoryRows, simulatedRows: simulatedHistoryRows } };
  }
  private forecast(target: LoadedTarget, row: StoredModel, now: Date) {
    const input = inputFromTarget(target), model = deserialize(row), features = extractFeatures(input, now), probability = predict(model, features.x);
    const risk = probability >= 0.7 ? 'HIGH' : probability >= 0.4 ? 'MEDIUM' : 'LOW';
    return { applicable: true, targetId: target.id, title: target.title, departmentId: target.departmentId, departmentName: target.department.name,
      documentNumber: target.sourceDocument?.docNumber ?? target.framework?.sourceDocument?.docNumber ?? target.legalBasis ?? target.framework?.legalBasis ?? null,
      unit: target.unit, targetValue: target.targetValue, currentValue: features.currentValue, direction: target.direction, dueDate: target.dueDate, probability, risk,
      riskLabel: risk === 'HIGH' ? 'Cao' : risk === 'MEDIUM' ? 'Trung bình' : 'Thấp',
      ...projectValue(input, now), factors: explain(input, now, model), sourceLabel: sourceLabel(model, row?.trainedAt), model: modelInfo(row), generatedAt: now,
    };
  }
  async list(actor: Actor, query: { year?: string; departmentId?: string; scope?: string; risk?: string; frameworkId?: string }, now = new Date()) {
    const departmentId = await resolveReadDepartmentScope(this.prisma, actor, query.departmentId, query.scope), year = forecastYear(query.year);
    if (query.risk && !['LOW', 'MEDIUM', 'HIGH'].includes(query.risk)) throw new BadRequestException('Mức nguy cơ không hợp lệ');
    const [targets, model] = await Promise.all([
      this.prisma.target.findMany({ where: { year, isArchived: false, kind: { in: FORECAST_KINDS }, dueDate: { gt: now }, ...(departmentId ? { departmentId } : {}), ...(query.frameworkId ? { frameworkId: query.frameworkId } : {}) }, include: targetInclude }),
      this.prisma.forecastModel.findFirst({ orderBy: { trainedAt: 'desc' } }),
    ]);
    const items = targets.map(target => this.forecast(target, model, now)).filter(row => !query.risk || row.risk === query.risk).sort((a, b) => b.probability - a.probability || a.title.localeCompare(b.title, 'vi'));
    return { items, model: modelInfo(model), generatedAt: now };
  }
  async target(actor: Actor, id: string, now = new Date()) {
    const target = await this.prisma.target.findUnique({ where: { id }, include: targetInclude });
    if (!target) throw new NotFoundException('Không tìm thấy chỉ tiêu');
    await resolveReadDepartmentScope(this.prisma, actor, target.departmentId, 'all');
    if (target.kind === 'TASK') return { applicable: false, targetId: id, reason: 'Nhiệm vụ được theo dõi theo hạn hoàn thành, không dự báo' };
    if (target.kind === 'STAT' || target.dueDate <= now || target.isArchived) return { applicable: false, targetId: id, reason: target.kind === 'STAT' ? 'Chỉ tiêu thống kê không có mức giao để dự báo' : 'Chỉ tiêu đã hết hạn hoặc được lưu trữ' };
    return this.forecast(target, await this.prisma.forecastModel.findFirst({ orderBy: { trainedAt: 'desc' } }), now);
  }
  async importHistory(actor: Actor, rows: HistoricalRow[], simulated: boolean, source: string) {
    assertForecastAdmin(actor);
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('forecast-history-import'))::text`;
      // Không cho lần nhập sau tạo chuỗi mâu thuẫn với các kỳ đã có.
      const existing = await tx.forecastHistory.findMany({ where: { OR: rows.map(row => ({ seriesKey: row.seriesKey, year: row.year, simulated })) }, select: { seriesKey: true, year: true, targetValue: true, direction: true, unit: true, kind: true, dueDate: true, frequency: true } });
      const first = new Map(existing.map(row => [`${row.seriesKey}:${row.year}`, row]));
      for (const row of rows) { const old = first.get(`${row.seriesKey}:${row.year}`); if (old && (old.targetValue !== row.targetValue || old.direction !== row.direction || old.unit !== row.unit || old.kind !== row.kind || old.frequency !== row.frequency || old.dueDate.getTime() !== row.dueDate.getTime())) throw new BadRequestException('Các kỳ mới mâu thuẫn với mức giao, hạn hoặc cấu hình chuỗi đã nhập'); }
      const result = await tx.forecastHistory.createMany({ data: rows.map(row => ({ ...row, simulated, source, importedById: actor.id })), skipDuplicates: true });
      await audit(tx, actor, { action: 'FORECAST_HISTORY_IMPORTED', entityType: 'ForecastHistory', metadata: { imported: result.count, duplicates: rows.length - result.count, simulated } });
      return { imported: result.count, duplicates: rows.length - result.count };
    });
  }
  train(actor: Actor) { return trainForecast(this.prisma, actor); }
}
