import { SEVERITY_RANK } from '../../../lib/alerts';
import { vn } from '../../../lib/format';
import type { AlertItem } from '../../../types/domain';

// Phần tính toán thuần của widget dữ liệu (có kiểm thử): lọc cảnh báo, nhóm hạn theo ngày, sắp kỳ báo cáo, dựng bảng
// số liệu cho biểu đồ chỉ tiêu, chọn mục của "Việc của tôi".

export function filterAlerts(alerts: AlertItem[], { kinds, minSeverity }: { kinds: string[]; minSeverity: AlertItem['severity'] }) {
  const floor = SEVERITY_RANK[minSeverity] ?? 0;
  return alerts.filter(alert => (!kinds.length || kinds.includes(alert.kind)) && (SEVERITY_RANK[alert.severity] ?? 0) >= floor);
}

export type DeadlineGroupKey = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later';

const GROUP_LABELS: Record<DeadlineGroupKey, string> = {
  overdue: 'Quá hạn',
  today: 'Hôm nay',
  tomorrow: 'Ngày mai',
  week: 'Trong 7 ngày',
  later: 'Sau đó',
};

const GROUP_ORDER: DeadlineGroupKey[] = ['overdue', 'today', 'tomorrow', 'week', 'later'];

/** Nhóm hạn theo ngày (giờ Việt Nam) trong khung `days` ngày tới; hạn đã qua mà chưa xong luôn hiện ở nhóm đầu. */
export function groupDeadlines<T extends { at: string; overdue: boolean }>(items: T[], days: number, now = new Date()) {
  const today = vn(now).startOf('day');
  const groups = new Map<DeadlineGroupKey, T[]>();
  for (const item of items) {
    const offset = vn(item.at).startOf('day').diff(today, 'day');
    if (!item.overdue && offset > days) continue;
    const key: DeadlineGroupKey = item.overdue ? 'overdue' : offset <= 0 ? 'today' : offset === 1 ? 'tomorrow' : offset <= 7 ? 'week' : 'later';
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return GROUP_ORDER.filter(key => groups.has(key)).map(key => ({ key, label: GROUP_LABELS[key], items: groups.get(key)! }));
}

const PERIOD = /^(\d{4})(?:-(H[12]|Q[1-4]|M(0[1-9]|1[0-2])))?$/;

/** Thứ tự kỳ: theo tháng kết thúc kỳ; trùng tháng thì kỳ ngắn trước (tháng 9, quý III, năm). */
export function periodOrder(key: string) {
  const match = PERIOD.exec(key);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const year = Number(match[1]);
  const suffix = match[2];
  if (!suffix) return year * 100 + 12 * 4 + 3;
  const index = Number(suffix.slice(1));
  if (suffix[0] === 'M') return year * 100 + index * 4;
  if (suffix[0] === 'Q') return year * 100 + index * 3 * 4 + 1;
  return year * 100 + index * 6 * 4 + 2;
}

/** Nhãn kỳ ngắn cho trục biểu đồ. */
export function shortPeriod(key: string, withYear: boolean) {
  const match = PERIOD.exec(key);
  if (!match) return key;
  const [, year, suffix] = match;
  if (!suffix) return year;
  const tail = withYear ? `/${year.slice(2)}` : '';
  const index = Number(suffix.slice(1));
  if (suffix[0] === 'M') return `T${index}${tail}`;
  if (suffix[0] === 'Q') return `Q${index}${tail}`;
  return `${index === 1 ? '6T đầu' : '6T cuối'}${tail}`;
}

export interface ChartInput {
  id: string;
  code: string;
  title: string;
  unit: string;
  targetValue: number;
  points: { periodKey: string; value: number }[];
}

/**
 * Bảng số liệu cho biểu đồ nhiều chỉ tiêu: trục là hợp các kỳ đã có số liệu (sắp theo thời gian), kỳ thiếu để trống.
 * Các chỉ tiêu khác đơn vị được quy về % kế hoạch để vẽ chung một trục.
 */
export function seriesTable(targets: ChartInput[]) {
  const keys = [...new Set(targets.flatMap(target => target.points.map(point => point.periodKey)))].sort((a, b) => periodOrder(a) - periodOrder(b));
  const normalized = new Set(targets.map(target => target.unit.trim().toLocaleLowerCase('vi'))).size > 1;
  const rows = targets.map(target => {
    const byKey = new Map(target.points.map(point => [point.periodKey, point.value]));
    const scale = (value: number) => (normalized ? (target.targetValue ? Math.round((value / target.targetValue) * 1000) / 10 : null) : value);
    return {
      id: target.id,
      name: `${target.code} · ${target.title}`,
      unit: target.unit,
      plan: normalized ? (target.targetValue ? 100 : null) : target.targetValue,
      values: keys.map(key => (byKey.has(key) ? scale(byKey.get(key)!) : null)),
      raw: keys.map(key => byKey.get(key) ?? null),
    };
  });
  return { keys, normalized, rows };
}

export type WorkSection = 'needReport' | 'toReview' | 'explanations' | 'proposals';

const WORK_ORDER: WorkSection[] = ['needReport', 'toReview', 'explanations', 'proposals'];

/** Mục hiện ở widget "Việc của tôi": các mục đã chọn (theo thứ tự cố định), hoặc mặc định mọi mục đang có việc. */
export function workSections(counts: Record<WorkSection, number>, selected: string[]) {
  return WORK_ORDER.filter(key => (selected.length ? selected.includes(key) : counts[key] > 0));
}
