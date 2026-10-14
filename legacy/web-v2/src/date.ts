export function currentVietnamYear(now = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
  }).format(now));
}
