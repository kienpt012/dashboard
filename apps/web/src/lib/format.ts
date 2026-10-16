import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import relative from 'dayjs/plugin/relativeTime';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relative);
dayjs.locale('vi');

export const VN_TZ = 'Asia/Ho_Chi_Minh';
export const vn = (value?: string | Date | null) => dayjs(value ?? undefined).tz(VN_TZ);

const numberFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });

export function num(value: number | null | undefined, empty = '—') {
  return value === null || value === undefined || !Number.isFinite(value) ? empty : numberFormat.format(value);
}

export function pct(value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(value) ? '—' : `${numberFormat.format(Math.round(value * 10) / 10)}%`;
}

export function withUnit(value: number | null | undefined, unit?: string | null) {
  return `${num(value)}${unit ? ` ${unit}` : ''}`;
}

export function date(value?: string | Date | null) {
  return value ? vn(value).format('DD/MM/YYYY') : '—';
}

export function dateTime(value?: string | Date | null) {
  return value ? vn(value).format('HH:mm DD/MM/YYYY') : '—';
}

export function fromNow(value?: string | Date | null) {
  return value ? vn(value).fromNow() : '—';
}

/** "còn 18 giờ" / "quá 2 ngày" tới một mốc. */
export function until(value?: string | null) {
  if (!value) return '';
  const diff = dayjs(value).diff(dayjs());
  const hours = Math.round(Math.abs(diff) / 3_600_000);
  const text = hours < 48 ? `${hours} giờ` : `${Math.round(hours / 24)} ngày`;
  return diff >= 0 ? `còn ${text}` : `quá ${text}`;
}

export const msUntil = (value?: string | null) => (value ? dayjs(value).diff(dayjs()) : Number.POSITIVE_INFINITY);

export function currentYear() {
  return vn().year();
}

export function fileSize(bytes?: number | null) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}
