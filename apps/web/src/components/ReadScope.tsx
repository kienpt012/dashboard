import { Segmented } from 'antd';
import { useSyncExternalStore } from 'react';
import { useMe } from '@/app/session';
import { useApi } from '@/hooks/useApi';
import { isGlobal } from '@/lib/roles';

export type ReadScope = 'mine' | 'all';
const EVENT = 'ioc-read-scope-change';
const subscribe = (callback: () => void) => {
  window.addEventListener(EVENT, callback);
  window.addEventListener('storage', callback);
  return () => { window.removeEventListener(EVENT, callback); window.removeEventListener('storage', callback); };
};

/** Lựa chọn chỉ áp dụng cho màn hình xem; không truyền vào danh sách việc hay hàng đợi duyệt. */
export function useReadScope() {
  const user = useMe();
  const config = useApi<{ crossDepartmentView: boolean }>('/settings/client', { staleTime: 30_000 });
  const key = `ioc.read-scope.${user.id}`;
  const saved = useSyncExternalStore(subscribe, () => {
    try { return localStorage.getItem(key) === 'all' ? 'all' : 'mine'; } catch { return 'mine'; }
  });
  const visible = Boolean(user.departmentId && config.data?.crossDepartmentView);
  const scope: ReadScope = !user.departmentId ? 'all' : visible ? saved : isGlobal(user) ? 'all' : 'mine';
  const setScope = (value: ReadScope) => {
    try { localStorage.setItem(key, value); } catch { /* Lựa chọn vẫn an toàn khi bộ nhớ bị chặn. */ }
    window.dispatchEvent(new Event(EVENT));
  };
  return { scope, setScope, visible };
}

export function ReadScopeSwitch({ value }: { value: ReturnType<typeof useReadScope> }) {
  if (!value.visible) return null;
  return <Segmented aria-label="Phạm vi xem chỉ tiêu" value={value.scope} onChange={next => value.setScope(next as ReadScope)} options={[{ value: 'mine', label: 'Phòng tôi' }, { value: 'all', label: 'Toàn địa phương' }]} />;
}
