import { BadRequestException } from '@nestjs/common';
import { DirectiveKind, FrameworkKind, ProgressReviewStatus, TargetDirection } from '@prisma/client';
import { evaluateTarget } from './metrics';
import { parsePlanningDueDate } from './planning-date';
import { periodLabel, periodsOfYear, reportDeadline } from './periods';

export const DIRECTIVE_KINDS: Record<DirectiveKind, string> = {
  CHUONG_TRINH: 'Chương trình công tác', THONG_BAO_KET_LUAN: 'Thông báo kết luận', KE_HOACH: 'Kế hoạch',
  CONG_VAN: 'Công văn', CHI_THI: 'Chỉ thị', QUYET_DINH: 'Quyết định', NGHI_QUYET: 'Nghị quyết', BAO_CAO: 'Báo cáo', KHAC: 'Khác',
};
export const TASK_STATUS = { NOT_STARTED: 'Chưa bắt đầu', IN_PROGRESS: 'Đang thực hiện', COMPLETED: 'Hoàn thành', OVERDUE: 'Quá hạn' } as const;
export type TaskStatus = keyof typeof TASK_STATUS;
const DAY = 86_400_000;

export interface TaskMetricInput {
  currentValue: number; targetValue: number; direction: TargetDirection; lastReportedAt: Date | null; dueDate: Date;
  updates?: { value: number; createdAt: Date; reviewedAt: Date | null; reviewStatus?: ProgressReviewStatus }[];
}

/** Thời điểm hoàn thành lấy từ báo cáo 100% đã duyệt; ngày nộp kết quả quyết định đúng hạn, không phạt thời gian chờ duyệt. */
export function taskMetric(task: TaskMetricInput, now = new Date()) {
  const metric = evaluateTarget({ ...task, hasReport: Boolean(task.lastReportedAt), kind: FrameworkKind.TASK, now });
  const status: TaskStatus = metric.completed ? 'COMPLETED' : task.dueDate < now ? 'OVERDUE' : task.lastReportedAt ? 'IN_PROGRESS' : 'NOT_STARTED';
  const approved = [...(task.updates ?? [])].filter(report => !report.reviewStatus || report.reviewStatus === 'APPROVED')
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  let currentCompletion: Date | null = null;
  for (const report of approved) currentCompletion = report.value >= task.targetValue ? currentCompletion ?? report.createdAt : null;
  const completedAt = metric.completed ? currentCompletion ?? task.lastReportedAt : null;
  const lateDays = completedAt && completedAt > task.dueDate ? Math.ceil((completedAt.getTime() - task.dueDate.getTime()) / DAY) : 0;
  return { progress: metric.progress, status, completedAt, completedOnTime: Boolean(completedAt && !lateDays), completedLate: Boolean(lateDays), lateDays };
}

export function summarizeTasks(tasks: ReturnType<typeof taskMetric>[], documents = 0, now = new Date(), dueDates: Date[] = []) {
  const count = (status: TaskStatus) => tasks.filter(task => task.status === status).length;
  return {
    documents, total: tasks.length, completed: count('COMPLETED'), inProgress: count('IN_PROGRESS'), notStarted: count('NOT_STARTED'),
    overdue: count('OVERDUE'), dueSoon: tasks.filter((task, index) => task.status !== 'COMPLETED' && dueDates[index] && dueDates[index] >= now && dueDates[index].getTime() <= now.getTime() + 7 * DAY).length,
    progress: tasks.length ? Math.round(tasks.reduce((sum, task) => sum + task.progress, 0) / tasks.length) : 0,
  };
}

export function taskStatistics(tasks: ReturnType<typeof taskMetric>[]) {
  const completedOnTime = tasks.filter(task => task.completedOnTime).length;
  const completedLate = tasks.filter(task => task.completedLate).length;
  return {
    total: tasks.length, completedOnTime, completedLate,
    inProgress: tasks.filter(task => task.status === 'IN_PROGRESS').length,
    notStarted: tasks.filter(task => task.status === 'NOT_STARTED').length,
    overdue: tasks.filter(task => task.status === 'OVERDUE').length,
    completionRate: tasks.length ? Math.round((completedOnTime + completedLate) * 1000 / tasks.length) / 10 : 0,
    averageLateDays: completedLate ? Math.round(tasks.reduce((sum, task) => sum + task.lateDays, 0) * 10 / completedLate) / 10 : 0,
  };
}

/** Chỉ nhận ngày thật và tối đa 100 việc; toàn bộ danh sách được kiểm tra trước khi ghi. */
export function parsePastedTasks(text: string, fallbackDueDate?: string) {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length || lines.length > 100) throw new BadRequestException('Danh sách cần có từ 1 đến 100 nhiệm vụ');
  return lines.map((line, index) => {
    const match = /(?:\s*[-–—;,]?\s+)(?:trước|hạn|đến ngày|đến|hoàn thành trước)\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s*[.;]?$/iu.exec(line);
    const title = (match ? line.slice(0, match.index) : line).replace(/^\s*(?:\d+[.)]|[-•])\s*/, '').trim();
    if (title.length < 3 || title.length > 500) throw new BadRequestException(`Dòng ${index + 1}: nội dung cần từ 3 đến 500 ký tự`);
    const date = match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : fallbackDueDate;
    if (!date) throw new BadRequestException(`Dòng ${index + 1}: chưa có hạn hoàn thành`);
    if (!/^(20\d{2}|2100)-/.test(date)) throw new BadRequestException(`Dòng ${index + 1}: năm hoàn thành phải từ 2000 đến 2100`);
    return { title, dueDate: parsePlanningDueDate(date) };
  });
}

export function monthRange(month: string) {
  if (!/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(month)) throw new BadRequestException('Tháng phải có định dạng YYYY-MM');
  const [year, number] = month.split('-').map(Number);
  return { year, start: new Date(Date.UTC(year, number - 1, 1, -7)), end: new Date(Date.UTC(year, number, 1, -7)) };
}

export function monthlyPeriods(target: { frequency: Parameters<typeof periodsOfYear>[0]; year: number; reportDueDay: number | null; createdAt: Date }, month: string) {
  const { start, end } = monthRange(month);
  return periodsOfYear(target.frequency, target.year).map(key => ({ key, label: periodLabel(key), deadline: reportDeadline(key, target.reportDueDay)! }))
    .filter(period => period.deadline >= start && period.deadline < end && period.deadline >= target.createdAt);
}
