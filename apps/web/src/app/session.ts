import { useSyncExternalStore } from 'react';
import { session } from '@/lib/api';
import type { CurrentUser } from '@/types/auth';

/** Người dùng đang đăng nhập; cập nhật khi đăng nhập, đăng xuất hoặc hồ sơ thay đổi. */
export function useUser(): CurrentUser | null {
  return useSyncExternalStore(session.subscribe, () => session.user, () => null);
}

/** Dùng bên trong khung quản trị, nơi chắc chắn đã đăng nhập. */
export function useMe(): CurrentUser {
  const user = useUser();
  if (!user) throw new Error('Chưa đăng nhập');
  return user;
}
