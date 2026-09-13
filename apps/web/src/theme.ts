/** Quản lý chế độ hiển thị sáng / tối / theo hệ thống.
 *
 *  Giá trị được ghi vào `localStorage` và phản chiếu lên thuộc tính `data-theme`
 *  của thẻ <html>. Một đoạn mã nội tuyến trong `index.html` áp dụng lại giá trị này
 *  TRƯỚC khi trang được vẽ, nhờ vậy người dùng chế độ tối không bị chớp trắng.
 */

export type ThemeChoice = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'ioc_theme';

/** Màu thanh trạng thái trình duyệt trên di động, khớp với nền của từng chế độ. */
const THEME_COLOR: Record<'light' | 'dark', string> = {
  light: '#f5f7fb',
  dark: '#080b14',
};

function isChoice(value: unknown): value is ThemeChoice {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function readTheme(): ThemeChoice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isChoice(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

/** Chế độ thực sự đang hiển thị sau khi đã giải nghĩa lựa chọn "theo hệ thống". */
export function resolveTheme(choice: ThemeChoice): 'light' | 'dark' {
  if (choice !== 'system') return choice;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

let switchTimer = 0;

export function applyTheme(choice: ThemeChoice, animated = false) {
  const root = document.documentElement;

  /* Đổi giao diện mà mọi thứ nhảy màu tức thì thì rất chói. Bật một lớp trong nửa
     giây để nền, viền và chữ chuyển màu êm, rồi tắt đi — không để lại transition
     toàn cục làm chậm các thao tác khác. */
  if (animated && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    root.classList.add('theme-switching');
    window.clearTimeout(switchTimer);
    switchTimer = window.setTimeout(() => root.classList.remove('theme-switching'), 420);
  }

  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);

  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = THEME_COLOR[resolveTheme(choice)];
}

export function writeTheme(choice: ThemeChoice) {
  try {
    if (choice === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    /* Trình duyệt chặn lưu trữ cục bộ — vẫn áp dụng cho phiên hiện tại. */
  }
  applyTheme(choice, true);
}

/** Lắng nghe thay đổi của hệ điều hành; chỉ có tác dụng khi đang ở chế độ "theo hệ thống". */
export function watchSystemTheme(onChange: () => void) {
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
