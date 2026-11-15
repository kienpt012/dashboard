import type { CurrentUser } from '@/types/auth';
import { emptySession, isCurrentSessionToken, readSessionSnapshot, sessionIdentityChanged, TOKEN_KEY, USER_KEY } from './session-state';

// Lớp gọi API: một chỗ gắn token, đổi lỗi máy chủ thành thông báo tiếng Việt, tự đăng xuất khi phiên hết hạn.

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:3000/api';

export class ApiError extends Error {
  status: number;
  details: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

type Listener = () => void;
const listeners = new Set<Listener>();

function readSavedSession() {
  try { return readSessionSnapshot(localStorage); } catch { return emptySession(); }
}

let cachedSession = readSavedSession();

function currentToken(token: string | null) {
  try { return isCurrentSessionToken(cachedSession, localStorage, token); } catch { return false; }
}

/** Phiên đăng nhập; giao diện theo dõi qua useSession(). */
export const session = {
  get token() {
    return cachedSession.token;
  },
  get user() {
    return cachedSession.user;
  },
  set(token: string, user: CurrentUser) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    cachedSession = { token, user };
    listeners.forEach(listener => listener());
  },
  setUser(user: CurrentUser) {
    if (cachedSession.user?.id !== user.id || !currentToken(cachedSession.token)) return;
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    cachedSession = { ...cachedSession, user };
    listeners.forEach(listener => listener());
  },
  clear(expectedToken?: string | null) {
    if (expectedToken !== undefined && !currentToken(expectedToken)) return false;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    cachedSession = emptySession();
    listeners.forEach(listener => listener());
    return true;
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

// Bind both fields to one in-memory snapshot. Another tab's token is never paired with this tab's old user.
window.addEventListener('storage', event => {
  if (event.key !== null && event.key !== TOKEN_KEY && event.key !== USER_KEY) return;
  const next = readSavedSession();
  if (next.token === cachedSession.token && JSON.stringify(next.user) === JSON.stringify(cachedSession.user)) return;
  const changedIdentity = sessionIdentityChanged(cachedSession, next);
  cachedSession = next;
  listeners.forEach(listener => listener());
  // QueryClient clears on token changes; reload also discards route-local forms and editors from the old account.
  if (changedIdentity) window.location.reload();
});

function messageOf(payload: unknown, status: number) {
  const raw = (payload as { message?: unknown } | null)?.message;
  const message = Array.isArray(raw) ? raw[0] : raw;
  if (typeof message === 'string' && message) return message;
  if (message && typeof message === 'object' && 'message' in message) return String((message as { message: unknown }).message);
  if (status === 401) return 'Phiên đăng nhập đã hết hạn';
  if (status === 403) return 'Bạn không có quyền thực hiện thao tác này';
  if (status === 404) return 'Không tìm thấy dữ liệu';
  if (status === 409) return 'Dữ liệu vừa được người khác thay đổi';
  if (status === 413) return 'Tệp quá lớn';
  if (status >= 502 && status <= 504) return 'Máy chủ tạm thời không phản hồi, vui lòng thử lại';
  return 'Có lỗi xảy ra khi xử lý yêu cầu';
}

async function readError(response: Response) {
  const type = response.headers.get('content-type') || '';
  try {
    if (type.includes('application/json')) return await response.json();
    const text = await response.text();
    return text && !/^\s*</.test(text) ? { message: text.trim() } : {};
  } catch {
    return {};
  }
}

async function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (init.body != null && !(init.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const token = session.token;
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('Không kết nối được máy chủ', 0, error);
  }
  if (!response.ok) {
    const payload = await readError(response);
    if (response.status === 401 && path !== '/auth/login' && session.clear(token)) {
      if (!window.location.pathname.startsWith('/admin/login')) {
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.assign(`/admin/login?next=${next}`);
      }
    }
    throw new ApiError(messageOf(payload, response.status), response.status, payload);
  }
  return response;
}

async function parse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const type = response.headers.get('content-type') || '';
  if (type.includes('application/json')) return (await response.json()) as T;
  return (await response.text()) as unknown as T;
}

const body = (value: unknown) => (value instanceof FormData ? value : value === undefined ? undefined : JSON.stringify(value));

export const http = {
  get: <T>(path: string, signal?: AbortSignal) => request(path, { signal }).then(parse<T>),
  post: <T>(path: string, data?: unknown) => request(path, { method: 'POST', body: body(data) }).then(parse<T>),
  patch: <T>(path: string, data?: unknown) => request(path, { method: 'PATCH', body: body(data) }).then(parse<T>),
  put: <T>(path: string, data?: unknown) => request(path, { method: 'PUT', body: body(data) }).then(parse<T>),
  delete: <T>(path: string) => request(path, { method: 'DELETE' }).then(parse<T>),
  blob: (path: string, init: RequestInit = {}) => request(path, init).then(response => response.blob()),
};

/** Chuỗi truy vấn từ đối tượng, bỏ giá trị rỗng. */
export function query(params: Record<string, string | number | boolean | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

/** Tải tệp nhị phân về máy với tên cho trước. */
export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function errorText(error: unknown, fallback = 'Có lỗi xảy ra') {
  return error instanceof Error && error.message ? error.message : fallback;
}

export const apiBaseUrl = API_URL;
