import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useMe } from '@/app/session';
import { ApiError, http } from '@/lib/api';
import { dataCacheKey, readDataCache, writeDataCache } from '@/lib/deskDataCache';
import { deskApi } from '../api';
import type { DepartmentSnapshot } from '../types';
import { useWidget } from './context';

// Gói số liệu của phòng widget đang xem. Mọi widget cùng phòng, cùng năm dùng chung một truy vấn (khoá theo đường dẫn
// như useApi, nên nút làm mới và các thao tác ghi làm mới được). Bản lưu trên máy hiện ngay khi mở bàn làm việc.

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export const statusOf = (error: unknown) => (error instanceof ApiError ? error.status : 0);

/** `enabled = false`: không tải (widget đã tắt phần cần số liệu phòng). */
export function useDepartmentData(enabled = true) {
  const { departmentId, year, refreshMs } = useWidget();
  const user = useMe();
  const path = departmentId ? deskApi.departmentPath(departmentId, year) : null;
  const key = departmentId ? dataCacheKey(user.id, departmentId, year) : null;
  const cached = useMemo(() => {
    const local = storage();
    return key && local ? readDataCache<DepartmentSnapshot>(local, key) : undefined;
  }, [key]);

  const query = useQuery({
    queryKey: [path],
    queryFn: async ({ signal }) => {
      const data = await http.get<DepartmentSnapshot>(path!, signal);
      const local = storage();
      if (local && key) writeDataCache(local, user.id, key, data);
      return data;
    },
    enabled: Boolean(path) && enabled,
    refetchInterval: refreshMs,
    initialData: cached?.data,
    initialDataUpdatedAt: cached?.savedAt,
    retry: (count, error) => ![400, 403, 404].includes(statusOf(error)) && count < 2,
  });

  return {
    data: query.data,
    departmentId,
    /** Chưa xác định được phòng (vai trò toàn địa phương chưa chọn phòng, hoặc tài khoản không thuộc phòng nào). */
    missing: !departmentId,
    forbidden: statusOf(query.error) === 403,
    isError: query.isError,
    error: query.error,
    isFetching: query.isFetching,
    refetch: query.refetch,
    /** Đang hiện bản cũ: tải lại lỗi, hoặc bản lưu trên máy chưa được thay bằng bản mới. */
    isStale: query.isError || (Boolean(cached) && query.dataUpdatedAt === cached?.savedAt),
  };
}
