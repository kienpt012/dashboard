export type Role='ADMIN'|'MANAGER'|'STAFF'|'VIEWER';
export type ScopeKind='GLOBAL'|'DEPARTMENT';

export type Department={id:string;code:string;name:string;color:string;description?:string;isActive:boolean;_count?:{users:number;targets:number}};
export type Target={
  id:string;
  code:string;
  title:string;
  description?:string;
  unit:string;
  targetValue:number;
  currentValue:number;
  weight:number;
  year:number;
  frequency:'MONTHLY'|'QUARTERLY'|'YEARLY';
  direction:'HIGHER_IS_BETTER'|'LOWER_IS_BETTER';
  status:string;
  dueDate:string;
  version:number;
  isPublic:boolean;
  lastReportedAt?:string|null;
  publishedValue?:number|null;
  publishedAt?:string|null;
  publishedBy?:string|null;
  progress?:number;
  pendingUpdates?:number;
  department:Department;
};
export type User={
  id:string;
  username:string;
  fullName:string;
  email?:string;
  role:Role;
  isActive:boolean;
  departmentId?:string|null;
  department?:Department|null;
  lastLoginAt?:string|null;
};

export type DataScope={kind:ScopeKind;departmentId?:string;departmentName?:string};
export type ScopedResponse<T>={data:T;scope:DataScope};
export type AuthMeResponse=User|{user:User;scope?:DataScope};
export const statusMeta:Record<string,{label:string;color:string}>={NOT_STARTED:{label:'Chưa bắt đầu',color:'slate'},ON_TRACK:{label:'Đúng tiến độ',color:'green'},AT_RISK:{label:'Có rủi ro',color:'amber'},OVERDUE:{label:'Quá hạn',color:'red'},COMPLETED:{label:'Hoàn thành',color:'blue'}};
