import type { CurrentUser, Role } from '@/types/auth';

// Sáu vai trò theo bộ máy UBND cấp xã; quyền cuối cùng luôn do máy chủ quyết định, giao diện chỉ ẩn thao tác không có quyền.

export const ROLES: Role[] = ['ADMIN', 'LEADER', 'CLERK', 'MANAGER', 'STAFF', 'VIEWER'];

export const roleLabel: Record<Role, string> = {
  ADMIN: 'Quản trị hệ thống',
  LEADER: 'Lãnh đạo UBND',
  CLERK: 'Văn thư',
  MANAGER: 'Trưởng phòng',
  STAFF: 'Chuyên viên',
  VIEWER: 'Người xem',
};

export const ALL: readonly Role[] = ROLES;
export const WORKING: readonly Role[] = ['ADMIN', 'LEADER', 'CLERK', 'MANAGER', 'STAFF'];
export const GLOBAL: readonly Role[] = ['ADMIN', 'LEADER', 'CLERK'];
export const LEADERSHIP: readonly Role[] = ['ADMIN', 'LEADER'];
export const APPROVERS: readonly Role[] = ['ADMIN', 'LEADER', 'MANAGER'];
export const SUPERVISORS: readonly Role[] = ['ADMIN', 'LEADER', 'MANAGER'];
export const REPORTERS: readonly Role[] = ['ADMIN', 'LEADER', 'MANAGER', 'STAFF'];
export const IMPORTERS: readonly Role[] = ['ADMIN', 'LEADER', 'MANAGER', 'STAFF'];
export const FRAMEWORK_EDITORS: readonly Role[] = ['ADMIN', 'LEADER', 'CLERK'];
export const DATASET_ADMINS: readonly Role[] = ['ADMIN', 'LEADER', 'CLERK'];
export const ADMINS: readonly Role[] = ['ADMIN'];

export function can(user: CurrentUser | null | undefined, roles: readonly Role[]) {
  return Boolean(user && roles.includes(user.role));
}

export function isGlobal(user: CurrentUser | null | undefined) {
  return can(user, GLOBAL);
}

export function initials(name?: string | null) {
  if (!name) return 'ND';
  return name.trim().split(/\s+/).slice(-2).map(part => part[0]).join('').toUpperCase() || 'ND';
}
