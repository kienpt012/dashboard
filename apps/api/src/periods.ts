import { TargetFrequency } from '@prisma/client';

// Kỳ báo cáo theo giờ Việt Nam. Mã kỳ: "2026" (năm), "2026-H1" (6 tháng), "2026-Q3" (quý), "2026-M09" (tháng).
// Hạn báo cáo của một kỳ là ngày `dueDay` (mặc định 20 — theo QĐ 333/QĐ-UBND: "báo cáo tháng chậm nhất
// ngày 20 hằng tháng") của tháng cuối kỳ, tính đến hết ngày theo giờ Việt Nam.

export const DEFAULT_REPORT_DUE_DAY = 20;
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const PERIOD_KEY = /^(\d{4})(?:-(H[12]|Q[1-4]|M(0[1-9]|1[0-2])))?$/;
const ROMAN = ['I', 'II', 'III', 'IV'];

export interface PeriodParts {
  year: number;
  frequency: TargetFrequency;
  index: number; // 1-based: tháng 1..12, quý 1..4, nửa năm 1..2, năm = 1
}

function vietnamCalendar(now: Date) {
  const shifted = new Date(now.getTime() + VN_OFFSET_MS);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

export function isValidPeriodKey(key: string): boolean {
  return PERIOD_KEY.test(key);
}

export function parsePeriodKey(key: string): PeriodParts | null {
  const match = PERIOD_KEY.exec(key);
  if (!match) return null;
  const year = Number(match[1]);
  if (year < 2000 || year > 2100) return null;
  const suffix = match[2];
  if (!suffix) return { year, frequency: TargetFrequency.YEARLY, index: 1 };
  const index = Number(suffix.slice(1));
  if (suffix.startsWith('H')) return { year, frequency: TargetFrequency.SEMIANNUAL, index };
  if (suffix.startsWith('Q')) return { year, frequency: TargetFrequency.QUARTERLY, index };
  return { year, frequency: TargetFrequency.MONTHLY, index };
}

export function formatPeriodKey(parts: PeriodParts): string {
  switch (parts.frequency) {
    case TargetFrequency.MONTHLY:
      return `${parts.year}-M${String(parts.index).padStart(2, '0')}`;
    case TargetFrequency.QUARTERLY:
      return `${parts.year}-Q${parts.index}`;
    case TargetFrequency.SEMIANNUAL:
      return `${parts.year}-H${parts.index}`;
    default:
      return String(parts.year);
  }
}

export function periodKeyFor(frequency: TargetFrequency, date: Date = new Date()): string {
  const { year, month } = vietnamCalendar(date);
  switch (frequency) {
    case TargetFrequency.MONTHLY:
      return formatPeriodKey({ year, frequency, index: month });
    case TargetFrequency.QUARTERLY:
      return formatPeriodKey({ year, frequency, index: Math.ceil(month / 3) });
    case TargetFrequency.SEMIANNUAL:
      return formatPeriodKey({ year, frequency, index: month <= 6 ? 1 : 2 });
    default:
      return String(year);
  }
}

/** Tháng đầu và tháng cuối (1..12) của kỳ. */
export function periodMonths(parts: PeriodParts): { first: number; last: number } {
  switch (parts.frequency) {
    case TargetFrequency.MONTHLY:
      return { first: parts.index, last: parts.index };
    case TargetFrequency.QUARTERLY:
      return { first: (parts.index - 1) * 3 + 1, last: parts.index * 3 };
    case TargetFrequency.SEMIANNUAL:
      return { first: parts.index === 1 ? 1 : 7, last: parts.index === 1 ? 6 : 12 };
    default:
      return { first: 1, last: 12 };
  }
}

function endOfVietnamDay(year: number, month: number, day: number): Date {
  // 23:59:59.999 giờ Việt Nam = 16:59:59.999 UTC cùng ngày.
  return new Date(Date.UTC(year, month - 1, day, 16, 59, 59, 999));
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function periodBounds(key: string): { start: Date; end: Date } | null {
  const parts = parsePeriodKey(key);
  if (!parts) return null;
  const { first, last } = periodMonths(parts);
  return {
    start: new Date(Date.UTC(parts.year, first - 1, 1, -7, 0, 0, 0)),
    end: endOfVietnamDay(parts.year, last, daysInMonth(parts.year, last)),
  };
}

/** Hạn nộp báo cáo của kỳ: ngày dueDay của tháng cuối kỳ (không vượt quá số ngày trong tháng). */
export function reportDeadline(key: string, dueDay: number | null | undefined = DEFAULT_REPORT_DUE_DAY): Date | null {
  const parts = parsePeriodKey(key);
  if (!parts) return null;
  const { last } = periodMonths(parts);
  const day = Math.max(1, Math.min(dueDay ?? DEFAULT_REPORT_DUE_DAY, daysInMonth(parts.year, last)));
  return endOfVietnamDay(parts.year, last, day);
}

export function previousPeriodKey(key: string): string | null {
  const parts = parsePeriodKey(key);
  if (!parts) return null;
  const perYear = parts.frequency === TargetFrequency.MONTHLY ? 12
    : parts.frequency === TargetFrequency.QUARTERLY ? 4
      : parts.frequency === TargetFrequency.SEMIANNUAL ? 2 : 1;
  if (parts.index > 1) return formatPeriodKey({ ...parts, index: parts.index - 1 });
  return formatPeriodKey({ year: parts.year - 1, frequency: parts.frequency, index: perYear });
}

export function periodsOfYear(frequency: TargetFrequency, year: number): string[] {
  const count = frequency === TargetFrequency.MONTHLY ? 12
    : frequency === TargetFrequency.QUARTERLY ? 4
      : frequency === TargetFrequency.SEMIANNUAL ? 2 : 1;
  return Array.from({ length: count }, (_value, offset) => formatPeriodKey({ year, frequency, index: offset + 1 }));
}

export function periodLabel(key: string): string {
  const parts = parsePeriodKey(key);
  if (!parts) return key;
  switch (parts.frequency) {
    case TargetFrequency.MONTHLY:
      return `Tháng ${parts.index}/${parts.year}`;
    case TargetFrequency.QUARTERLY:
      return `Quý ${ROMAN[parts.index - 1]}/${parts.year}`;
    case TargetFrequency.SEMIANNUAL:
      return parts.index === 1 ? `6 tháng đầu năm ${parts.year}` : `6 tháng cuối năm ${parts.year}`;
    default:
      return `Năm ${parts.year}`;
  }
}

/**
 * Kỳ cần báo cáo tại thời điểm `now`: kỳ hiện hành. Một kỳ được coi là thiếu báo cáo khi đã qua hạn
 * (ngày dueDay của tháng cuối kỳ) mà chưa có báo cáo nào (chờ duyệt hoặc đã duyệt) gắn mã kỳ đó.
 */
export function dueReportPeriods(
  frequency: TargetFrequency,
  year: number,
  dueDay: number | null | undefined,
  now: Date = new Date(),
): { key: string; deadline: Date; overdue: boolean }[] {
  const nowYear = vietnamCalendar(now).year;
  if (year > nowYear) return [];
  return periodsOfYear(frequency, year)
    .map(key => {
      const deadline = reportDeadline(key, dueDay)!;
      const bounds = periodBounds(key)!;
      return { key, deadline, started: bounds.start <= now, overdue: deadline < now };
    })
    .filter(period => period.started)
    .map(({ key, deadline, overdue }) => ({ key, deadline, overdue }));
}

export function isPeriodWithinYear(key: string, year: number): boolean {
  const parts = parsePeriodKey(key);
  return Boolean(parts && parts.year === year);
}
