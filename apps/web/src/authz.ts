import type { Role, User } from './types';

export const ALL_ROLES:readonly Role[]=['ADMIN','MANAGER','STAFF','VIEWER'];
export const IMPORT_ROLES:readonly Role[]=['ADMIN','MANAGER','STAFF'];
export const DOCUMENT_ROLES:readonly Role[]=IMPORT_ROLES;
export const APPROVAL_ROLES:readonly Role[]=['ADMIN','MANAGER'];
export const ADMIN_ROLES:readonly Role[]=['ADMIN'];

export const roleLabels:Record<Role,string>={
  ADMIN:'Quản trị hệ thống',
  MANAGER:'Lãnh đạo đơn vị',
  STAFF:'Cán bộ cập nhật',
  VIEWER:'Người dùng chỉ xem',
};

export function hasAnyRole(user:User|null|undefined,allowed:readonly Role[]){
  return Boolean(user&&allowed.includes(user.role));
}

export function getInitials(fullName?:string){
  if(!fullName)return 'ND';
  return fullName.trim().split(/\s+/).slice(-2).map(part=>part[0]).join('').toUpperCase()||'ND';
}
