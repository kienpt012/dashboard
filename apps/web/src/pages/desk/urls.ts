// Kiểm tra địa chỉ phía giao diện (cùng quy tắc với apps/api/src/desk/validate.ts) để báo lỗi ngay khi nhập.

const INTERNAL_PREFIXES = ['/admin', '/trinh-chieu', '/phan-anh'];

export function isSafeUrl(value: string): boolean {
  if (typeof value !== 'string' || value.length > 2000) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function isInternalPath(value: string): boolean {
  if (typeof value !== 'string' || value.length > 500 || !value.startsWith('/') || value.startsWith('//')) return false;
  if (/[\s\\]/.test(value) || /(^|\/)\.\.?(\/|$|\?|#)/.test(value)) return false;
  return INTERNAL_PREFIXES.some(prefix => value === prefix || ['/', '?', '#'].some(next => value.startsWith(prefix + next)));
}

/** Tên miền gọn để hiện dưới biểu tượng lối tắt (bỏ "www."). */
export function hostOf(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
