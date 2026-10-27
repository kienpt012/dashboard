import { apiBaseUrl, http, query, session } from '@/lib/api';
import type { AssetList, AssetMeta, DeskPayload, DeskProfileConfig, DeskSpace, DeskSpaceConfig, WidgetDefinition } from './types';

// Gọi API Bàn làm việc số. Ảnh nền tải bằng fetch có JWT rồi tạo blob: URL (thẻ <img> không gửi được header); trình
// duyệt giữ ảnh trong bộ đệm HTTP và hỏi lại bằng ETag, ảnh đã xoá trả 404 nên không hiện lại.

const blobUrls = new Map<string, Promise<string>>();

async function fetchAsset(id: string, size: 'full' | 'thumb') {
  const url = `${apiBaseUrl}/desk/assets/${encodeURIComponent(id)}${size === 'thumb' ? '?size=thumb' : ''}`;
  const response = await fetch(url, { headers: session.token ? { Authorization: `Bearer ${session.token}` } : {} });
  if (!response.ok) throw new Error(`Không tải được ảnh (${response.status})`);
  return response.blob();
}

export const deskApi = {
  load: () => http.get<DeskPayload>('/desk'),
  catalog: () => http.get<WidgetDefinition[]>('/desk/catalog'),
  saveProfile: (config: DeskProfileConfig, expectedVersion: number) =>
    http.put<{ version: number; config: DeskProfileConfig }>('/desk/profile', { config, expectedVersion }),
  createSpace: (body: { name: string; icon: string; copyFromId?: string }) => http.post<DeskSpace>('/desk/spaces', body),
  saveSpace: (id: string, body: { name?: string; icon?: string; config?: DeskSpaceConfig; expectedVersion: number }) =>
    http.put<{ version: number; config?: DeskSpaceConfig }>(`/desk/spaces/${encodeURIComponent(id)}`, body),
  deleteSpace: (id: string) => http.delete<{ ok: true }>(`/desk/spaces/${encodeURIComponent(id)}`),
  orderSpaces: (ids: string[]) => http.post<{ ok: true }>('/desk/spaces/order', { ids }),
  reset: () => http.post<DeskPayload>('/desk/reset'),
  getState: <T>(widgetId: string) => http.get<{ state: T | null; version: number }>(`/desk/widgets/${encodeURIComponent(widgetId)}/state`),
  putState: <T>(widgetId: string, state: T, expectedVersion: number) =>
    http.put<{ version: number }>(`/desk/widgets/${encodeURIComponent(widgetId)}/state`, { state, expectedVersion }),
  assets: () => http.get<AssetList>('/desk/assets'),
  uploadAsset: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return http.post<AssetMeta>('/desk/assets', form);
  },
  updateAsset: (id: string, body: { name?: string; isShared?: boolean }) => http.patch<AssetMeta>(`/desk/assets/${encodeURIComponent(id)}`, body),
  deleteAsset: async (id: string) => {
    await http.delete<{ ok: true }>(`/desk/assets/${encodeURIComponent(id)}`);
    blobUrls.delete(`${id}:full`);
    blobUrls.delete(`${id}:thumb`);
  },
  /** blob: URL của ảnh; lỗi (ảnh đã xoá, mất quyền) trả chuỗi rỗng để bên gọi rơi về nền mặc định. */
  assetBlobUrl: (id: string, size: 'full' | 'thumb' = 'full'): Promise<string> => {
    const key = `${id}:${size}`;
    let pending = blobUrls.get(key);
    if (!pending) {
      pending = fetchAsset(id, size)
        .then(blob => URL.createObjectURL(blob))
        .catch(() => {
          blobUrls.delete(key);
          return '';
        });
      blobUrls.set(key, pending);
    }
    return pending;
  },
  departmentPath: (departmentId: string, year: number) => `/desk/data/department${query({ departmentId, year })}`,
  seriesPath: (ids: string[], year: number) => `/desk/data/series${query({ ids: ids.join(','), year })}`,
  targetsPath: (departmentId: string | null, search: string, year: number) => `/desk/data/targets${query({ departmentId, search, year })}`,
  targetsByIdsPath: (ids: string[]) => `/desk/data/targets${query({ ids: ids.join(',') })}`,
};
