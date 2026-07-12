const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
export const auth = {
  get token() { return localStorage.getItem('ioc_token'); },
  get user() { const raw = localStorage.getItem('ioc_user'); return raw ? JSON.parse(raw) : null; },
  set(data: any) { localStorage.setItem('ioc_token', data.accessToken); localStorage.setItem('ioc_user', JSON.stringify(data.user)); },
  clear() { localStorage.removeItem('ioc_token'); localStorage.removeItem('ioc_user'); },
};
export async function api(path: string, options: RequestInit = {}) {
  const isForm = options.body instanceof FormData;
  const response = await fetch(`${API_URL}${path}`, { ...options, headers: { ...(isForm ? {} : {'Content-Type':'application/json'}), ...(auth.token ? {Authorization:`Bearer ${auth.token}`} : {}), ...options.headers } });
  if (response.status === 401) { auth.clear(); window.location.href = '/admin/login'; throw new Error('Phiên đăng nhập đã hết hạn'); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message[0] : data.message || 'Có lỗi xảy ra');
  return data;
}
