import { lunarLabel, vietnamDateParts } from '../../../lib/lunar';

// Tính toán thuần của widget cá nhân (có kiểm thử): lời chào, dòng ngày, đếm ngược, gộp việc riêng khi lưu xung đột,
// nhắc việc, đồng hồ tập trung, lưới lịch tháng. Mọi mốc giờ tính theo giờ Việt Nam.

const WEEKDAYS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

const pad = (value: number) => String(value).padStart(2, '0');

export function vietnamHour(date: Date) {
  return new Date(date.getTime() + 7 * 3_600_000).getUTCHours();
}

export function greetingFor(date: Date) {
  const hour = vietnamHour(date);
  if (hour >= 4 && hour < 11) return 'Chào buổi sáng';
  if (hour >= 11 && hour < 14) return 'Chào buổi trưa';
  if (hour >= 14 && hour < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

export function weekdayName(date: Date) {
  return WEEKDAYS[vietnamDateParts(date).weekday];
}

/** "Thứ Ba, 27/10/2026 · 17/9 Bính Ngọ". */
export function dateLine(date: Date, lunar: boolean) {
  const { day, month, year, weekday } = vietnamDateParts(date);
  const solar = `${WEEKDAYS[weekday]}, ${pad(day)}/${pad(month)}/${year}`;
  return lunar ? `${solar} · ${lunarLabel(date)}` : solar;
}

export function countdownParts(at: string | null | undefined, now: Date) {
  if (!at) return null;
  const target = new Date(at).getTime();
  if (Number.isNaN(target)) return null;
  const left = Math.max(0, Math.floor((target - now.getTime()) / 1000));
  return {
    done: left === 0,
    days: Math.floor(left / 86_400),
    hours: Math.floor((left % 86_400) / 3600),
    minutes: Math.floor((left % 3600) / 60),
    seconds: left % 60,
  };
}

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  dueAt?: string | null;
  remindAt?: string | null;
  createdAt?: string;
}

/**
 * Lưu bị xung đột (sửa ở hai máy): giữ bản trên máy này cho các việc nó có, thêm các việc chỉ có ở nơi khác, trừ
 * việc vừa xoá ở máy này (không hồi sinh).
 */
export function mergeTodos(local: TodoItem[], remote: TodoItem[], removed: Set<string>) {
  const known = new Set(local.map(entry => entry.id));
  return [...local, ...remote.filter(entry => !known.has(entry.id) && !removed.has(entry.id))];
}

const REMIND_WINDOW = 12 * 3_600_000;

export const reminderKey = (entry: TodoItem) => `${entry.id}@${entry.remindAt}`;

/** Việc tới giờ nhắc: chưa xong, chưa nhắc lần này, giờ nhắc đã qua nhưng không quá 12 giờ. */
export function dueReminders(items: TodoItem[], now: Date, notified: Set<string>) {
  return items.filter(entry => {
    if (entry.done || !entry.remindAt || notified.has(reminderKey(entry))) return false;
    const time = new Date(entry.remindAt).getTime();
    return time <= now.getTime() && now.getTime() - time <= REMIND_WINDOW;
  });
}

export interface FocusState {
  phase: 'idle' | 'work' | 'break';
  /** Thời điểm hết phiên (ms) khi đang chạy; null khi chờ hoặc tạm dừng. */
  endsAt: number | null;
  /** Thời gian còn lại (ms) khi tạm dừng. */
  pausedLeft: number | null;
  rounds: number;
}

export const FOCUS_IDLE: FocusState = { phase: 'idle', endsAt: null, pausedLeft: null, rounds: 0 };

export function focusStart(state: FocusState, now: number, workMin: number, _breakMin: number): FocusState {
  if (state.pausedLeft !== null && state.phase !== 'idle') return { ...state, endsAt: now + state.pausedLeft, pausedLeft: null };
  return { phase: 'work', endsAt: now + workMin * 60_000, pausedLeft: null, rounds: state.rounds };
}

export function focusPause(state: FocusState, now: number): FocusState {
  if (state.endsAt === null) return state;
  return { ...state, endsAt: null, pausedLeft: Math.max(0, state.endsAt - now) };
}

/** Một nhịp đồng hồ: hết phiên làm việc thì sang nghỉ (cộng một phiên), hết nghỉ thì về chờ. */
export function focusTick(state: FocusState, now: number, _workMin: number, breakMin: number): { state: FocusState; event: 'work-done' | 'break-done' | null } {
  if (state.endsAt === null || now < state.endsAt) return { state, event: null };
  if (state.phase === 'work') return { state: { phase: 'break', endsAt: now + breakMin * 60_000, pausedLeft: null, rounds: state.rounds + 1 }, event: 'work-done' };
  return { state: { phase: 'idle', endsAt: null, pausedLeft: null, rounds: state.rounds }, event: 'break-done' };
}

export interface CalendarCell {
  year: number;
  month: number;
  day: number;
  inMonth: boolean;
}

/** 42 ô (6 tuần) của tháng `month` (1–12), tuần bắt đầu thứ Hai. */
export function monthGrid(year: number, month: number): CalendarCell[] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1, 1 - lead + index));
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), inMonth: date.getUTCMonth() === month - 1 };
  });
}

/** Giữa trưa giờ Việt Nam của một ngày dương — dùng để tra âm lịch, ngày lễ mà không lệch múi giờ. */
export const noonOf = (cell: Pick<CalendarCell, 'year' | 'month' | 'day'>) => new Date(Date.UTC(cell.year, cell.month - 1, cell.day, 5));
