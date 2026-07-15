import { BadRequestException } from '@nestjs/common';

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function currentVietnamYear(now = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
  }).format(now));
}

/**
 * A planning deadline is a Vietnam calendar day, not an instant at midnight.
 * Store 23:59:59.999 Asia/Ho_Chi_Minh as its equivalent UTC instant.
 */
export function parsePlanningDueDate(value: string): Date {
  const match = DATE_ONLY.exec(value);
  if (!match) throw new BadRequestException('Ngày kế hoạch phải có định dạng YYYY-MM-DD');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendarCheck = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarCheck.getUTCFullYear() !== year
    || calendarCheck.getUTCMonth() !== month - 1
    || calendarCheck.getUTCDate() !== day
  ) {
    throw new BadRequestException('Ngày kế hoạch không hợp lệ');
  }
  return new Date(Date.UTC(year, month - 1, day, 16, 59, 59, 999));
}
