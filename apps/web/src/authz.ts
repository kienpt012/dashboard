import type { Role, User } from './types';

// Sáu vai trò theo đúng bộ máy cấp xã được khảo sát: quản trị kỹ thuật tách khỏi thẩm quyền nghiệp vụ.
export const ALL_ROLES:readonly Role[]=['ADMIN','LEADER','CLERK','MANAGER','STAFF','VIEWER'];
/** Vai trò được làm việc (khác chỉ xem): đề xuất chỉ tiêu, bổ sung minh chứng, báo lỗi. */
export const WORKING_ROLES:readonly Role[]=['ADMIN','LEADER','CLERK','MANAGER','STAFF'];
/** Phạm vi toàn địa phương. */
export const GLOBAL_ROLES:readonly Role[]=['ADMIN','LEADER','CLERK'];
/** Thẩm quyền giao, đánh giá, yêu cầu giải trình. */
export const LEADERSHIP_ROLES:readonly Role[]=['ADMIN','LEADER'];
export const IMPORT_ROLES:readonly Role[]=['ADMIN','LEADER','MANAGER','STAFF'];
export const DOCUMENT_ROLES:readonly Role[]=['ADMIN','LEADER','CLERK','MANAGER','STAFF'];
export const APPROVAL_ROLES:readonly Role[]=['ADMIN','LEADER','MANAGER'];
export const SUPERVISOR_ROLES:readonly Role[]=['ADMIN','LEADER','MANAGER'];
export const FRAMEWORK_EDITOR_ROLES:readonly Role[]=['ADMIN','LEADER','CLERK'];
export const ADMIN_ROLES:readonly Role[]=['ADMIN'];

export const roleLabels:Record<Role,string>={
  ADMIN:'Quản trị hệ thống',
  LEADER:'Lãnh đạo UBND',
  CLERK:'Văn thư',
  MANAGER:'Trưởng phòng',
  STAFF:'Chuyên viên',
  VIEWER:'Người xem',
};

export const roleDescriptions:Record<Role,string>={
  ADMIN:'Cấu hình hệ thống, tài khoản, thiết lập địa phương; có toàn quyền để xử lý sự cố',
  LEADER:'Chủ tịch, Phó Chủ tịch: giao chỉ tiêu, duyệt đề xuất, đánh giá, yêu cầu giải trình',
  CLERK:'Văn thư, Chánh Văn phòng: tiếp nhận văn bản, rà soát đề xuất AI, trình lãnh đạo',
  MANAGER:'Trưởng phòng: chịu trách nhiệm chỉ tiêu của phòng, giao chuyên viên, duyệt số liệu',
  STAFF:'Chuyên viên: cập nhật số liệu, minh chứng, đề xuất chỉ tiêu mới',
  VIEWER:'Chỉ xem số liệu của phòng',
};

export function hasAnyRole(user:User|null|undefined,allowed:readonly Role[]){
  return Boolean(user&&allowed.includes(user.role));
}

export function isGlobal(user:User|null|undefined){
  return hasAnyRole(user,GLOBAL_ROLES);
}

export function getInitials(fullName?:string){
  if(!fullName)return 'ND';
  return fullName.trim().split(/\s+/).slice(-2).map(part=>part[0]).join('').toUpperCase()||'ND';
}
