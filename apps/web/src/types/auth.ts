export type Role = 'ADMIN' | 'LEADER' | 'CLERK' | 'MANAGER' | 'STAFF' | 'VIEWER';

/** Người đang đăng nhập (GET /auth/me). */
export type CurrentUser = {
  id: string;
  username: string;
  fullName: string;
  position?: string | null;
  email?: string | null;
  role: Role;
  isActive: boolean;
  departmentId: string | null;
  department?: { id: string; code: string; name: string; isActive: boolean } | null;
  lastLoginAt?: string | null;
};
