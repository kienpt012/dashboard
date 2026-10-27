import { fold } from '../../../lib/fold';
import type { Role } from '../../../types/auth';

// Tính toán thuần của widget lối tắt và tìm kiếm (có kiểm thử): quyền mở một đường dẫn trong hệ thống, chữ cái đại diện
// cho trang web ngoài, gợi ý màn hình theo từ khoá không dấu, địa chỉ trang tra cứu.

export interface ScreenEntry {
  path: string;
  label: string;
  keywords: string;
  roles: readonly Role[];
}

/**
 * Vai trò có mở được đường dẫn này không: tra màn hình trùng đường dẫn (bỏ phần lọc ?…) hoặc là cha gần nhất của nó;
 * đường dẫn không thuộc màn hình nào (hồ sơ một chỉ tiêu…) để máy chủ tự kiểm quyền.
 */
export function canOpenPath(path: string, role: Role, screens: readonly ScreenEntry[]) {
  const pathname = path.split(/[?#]/)[0].replace(/\/$/, '') || '/';
  const owner = screens
    .filter(screen => pathname === screen.path || (screen.path !== '/admin' && pathname.startsWith(`${screen.path}/`)))
    .sort((a, b) => b.path.length - a.path.length)[0];
  return owner ? owner.roles.includes(role) : true;
}

export function monogram(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host.charAt(0).toUpperCase() || '?';
  } catch {
    return '?';
  }
}

export function matchScreens<T extends ScreenEntry>(query: string, role: Role, screens: readonly T[], limit: number): T[] {
  const needle = fold(query.trim());
  if (!needle) return [];
  return screens.filter(screen => screen.roles.includes(role) && fold(`${screen.label} ${screen.keywords}`).includes(needle)).slice(0, limit);
}

export function providerUrl(template: string, query: string) {
  return template.split('{q}').join(encodeURIComponent(query.trim()));
}
