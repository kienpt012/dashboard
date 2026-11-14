// Lịch làm việc của lãnh đạo theo tuần — kiểu dữ liệu và phép tính ngày dùng chung cho màn hình lập lịch, trang công khai
// và khối trên trang chủ công khai. Khớp apps/api/src/schedule.ts.

export type ScheduleSession = 'ALLDAY' | 'AM' | 'PM' | 'EVENING';

export type ScheduleEntry = {
  id?: string;
  date: string;
  session: ScheduleSession;
  startTime?: string | null;
  content: string;
  leader: string;
  location?: string | null;
  participants?: string | null;
  isPublic?: boolean;
};

export type ScheduleFile = { name: string; size: number };

export type Schedule = {
  id?: string;
  weekStart: string;
  weekEnd: string;
  title?: string | null;
  note?: string | null;
  isPublic?: boolean;
  publishedAt?: string | null;
  version?: number;
  updatedAt?: string;
  file: ScheduleFile | null;
  entries: ScheduleEntry[];
};

export type ScheduleWeekResponse = {
  weekStart: string;
  weekEnd: string;
  today: string;
  canEdit: boolean;
  schedule: Schedule | null;
};

export type PublicScheduleResponse = {
  weekStart: string;
  weekEnd: string;
  today: string;
  previousWeek: string | null;
  nextWeek: string | null;
  schedule: Schedule | null;
};

export const SESSIONS: { value: ScheduleSession; label: string }[] = [
  { value: 'ALLDAY', label: 'Cả ngày' },
  { value: 'AM', label: 'Sáng' },
  { value: 'PM', label: 'Chiều' },
  { value: 'EVENING', label: 'Tối' },
];

export const SESSION_LABEL: Record<ScheduleSession, string> = { ALLDAY: 'Cả ngày', AM: 'Sáng', PM: 'Chiều', EVENING: 'Tối' };

const WEEKDAYS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const DAY_MS = 86_400_000;

const utc = (day: string) => new Date(`${day}T00:00:00.000Z`);
const text = (date: Date) => date.toISOString().slice(0, 10);

export function addDays(day: string, days: number) {
  return text(new Date(utc(day).getTime() + days * DAY_MS));
}

export function weekDays(weekStart: string) {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

export function weekdayName(day: string) {
  return WEEKDAYS[utc(day).getUTCDay()];
}

/** "09/11" hoặc "09/11/2026". */
export function shortDate(day: string, withYear = false) {
  const [year, month, date] = day.split('-');
  return withYear ? `${date}/${month}/${year}` : `${date}/${month}`;
}

export function weekRange(weekStart: string) {
  return `${shortDate(weekStart)} – ${shortDate(addDays(weekStart, 6), true)}`;
}

/** Giờ hiển thị của một dòng lịch: "08:00" hoặc tên buổi khi không ghi giờ. */
export function entryTime(entry: Pick<ScheduleEntry, 'session' | 'startTime'>) {
  return entry.startTime || SESSION_LABEL[entry.session];
}

const RANK: Record<ScheduleSession, number> = { ALLDAY: 0, AM: 1, PM: 2, EVENING: 3 };

export function sortEntries<T extends ScheduleEntry>(entries: T[]): T[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) =>
      left.entry.date.localeCompare(right.entry.date)
      || RANK[left.entry.session] - RANK[right.entry.session]
      || (left.entry.startTime ?? '').localeCompare(right.entry.startTime ?? '')
      || left.index - right.index)
    .map(item => item.entry);
}

export function groupByDay<T extends ScheduleEntry>(weekStart: string, entries: T[]) {
  const sorted = sortEntries(entries);
  return weekDays(weekStart).map(day => ({ day, entries: sorted.filter(entry => entry.date === day) }));
}
