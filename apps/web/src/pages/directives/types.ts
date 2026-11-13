export type DirectiveStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE';
export type DirectivePermissions = { canCreate: boolean; canDispatch: boolean };
export type DirectiveSummary = { documents: number; total: number; completed: number; inProgress: number; notStarted: number; overdue: number; dueSoon: number; progress: number };
export type DirectiveDepartment = { id: string; name: string; color?: string };
export type DirectiveTask = {
  id: string; title: string; ordinal?: string | null; departmentId: string; department: DirectiveDepartment;
  coordinators: { departmentId: string; department: DirectiveDepartment }[];
  dueDate: string; assignee: { id: string; fullName: string } | null;
  progress: number; status: DirectiveStatus; version: number; relatedTargetId: string | null;
  dispatchedByName: string | null; dispatchedAt: string | null; frameworkId: string | null;
};
export type Directive = {
  id: string; name: string; directiveKind: string | null; docNumber: string | null;
  issuedDate: string | null; issuer: string | null; signer: string | null;
  sourceDocumentId: string | null; isActive: boolean; version: number; summary: DirectiveSummary;
};
export type DirectiveList = { items: Directive[]; summary: DirectiveSummary; permissions: DirectivePermissions };
export type DirectiveDetail = Directive & {
  sourceDocument: { id: string; title: string; docNumber: string | null } | null;
  tasks: DirectiveTask[]; permissions: DirectivePermissions;
};
export type DirectiveOptions = {
  departments: DirectiveDepartment[];
  documents: { id: string; title: string; docNumber: string | null; issuedDate: string | null; issuer: string | null }[];
  relatedTargets: { id: string; title: string }[];
  kinds: { value: string; label: string }[];
  permissions: DirectivePermissions; defaultDepartmentId: string | null;
};
export type DirectiveFilters = { year?: number; kind?: string; departmentId?: string; status?: string; q?: string; includeArchived?: boolean };
export type DirectiveStatistic = {
  id: string; name: string; total: number; completedOnTime: number; completedLate: number;
  inProgress: number; notStarted: number; overdue: number; completionRate: number; averageLateDays: number;
};
export type DirectiveStatistics = {
  summary: DirectiveSummary; byDocument: DirectiveStatistic[]; byDepartment: DirectiveStatistic[];
  byKind: DirectiveStatistic[]; byMonth: DirectiveStatistic[];
};
export type MonthlyItem = DirectiveTask & { targetId?: string; kind: string; periodLabel?: string; frameworkName?: string; docNumber?: string | null };
export type MonthlyWork = {
  month: string; departmentName: string | null;
  groups: { id: string; name: string; items: MonthlyItem[] }[];
  permissions: DirectivePermissions;
};
