// Bộ so sánh cho cột bảng (antd `sorter`). Ô trống xếp như giá trị nhỏ nhất.
import type { TargetStatusKey } from '@/types/domain';

const collator = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' });

type Get<T, V> = (row: T) => V | null | undefined;

/** Chữ tiếng Việt, số trong mã được so theo giá trị (CT-2 trước CT-10). */
export function byText<T>(get: Get<T, string>) {
  return (a: T, b: T) => collator.compare(get(a) ?? '', get(b) ?? '');
}

export function byNumber<T>(get: Get<T, number>) {
  return (a: T, b: T) => {
    const x = get(a);
    const y = get(b);
    if (x === null || x === undefined || Number.isNaN(x)) return y === null || y === undefined || Number.isNaN(y) ? 0 : -1;
    if (y === null || y === undefined || Number.isNaN(y)) return 1;
    return x - y;
  };
}

export function byDate<T>(get: Get<T, string | Date>) {
  return byNumber<T>(row => {
    const value = get(row);
    return value ? new Date(value).getTime() : null;
  });
}

/** Theo thứ tự nghiệp vụ cho trước; giá trị ngoài danh sách xếp cuối. */
export function byRank<T, K extends string>(order: readonly K[], get: Get<T, K | string>) {
  return byNumber<T>(row => {
    const value = get(row);
    const index = value ? order.indexOf(value as K) : -1;
    return index < 0 ? order.length : index;
  });
}

/** Tình trạng chỉ tiêu, nặng nhất trước. */
export const TARGET_STATUS_RANK: TargetStatusKey[] = ['OVERDUE', 'AT_RISK', 'NOT_STARTED', 'ON_TRACK', 'COMPLETED'];

/** Cột số: lần bấm đầu xếp lớn trước. */
export const NUMBER_FIRST = ['descend', 'ascend'] as ('descend' | 'ascend')[];
