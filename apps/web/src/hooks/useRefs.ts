import { useApi } from './useApi';
import type { Department } from '@/types/core';
import type { Framework } from '@/types/domain';

// Danh mục dùng chung cho bộ lọc và biểu mẫu; giữ lâu trong bộ đệm vì ít thay đổi.

export function useDepartments() {
  return useApi<Department[]>('/departments', { staleTime: 5 * 60_000 });
}

export function useFrameworks(includeInactive = false) {
  return useApi<Framework[]>(`/frameworks${includeInactive ? '?includeInactive=true' : ''}`, { staleTime: 60_000 });
}

export function departmentOptions(list: Department[] | undefined, activeOnly = true) {
  return (list ?? []).filter(item => !activeOnly || item.isActive).map(item => ({ value: item.id, label: item.name }));
}

export function frameworkOptions(list: Framework[] | undefined) {
  return (list ?? []).map(item => ({ value: item.id, label: item.name }));
}
