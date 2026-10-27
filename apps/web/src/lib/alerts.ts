import { date, fromNow } from './format';
import type { AlertItem } from '@/types/domain';

// Cảnh báo điều hành dùng chung cho Trung tâm điều hành và widget cảnh báo của bàn làm việc.

export const ALERT_KINDS: Record<string, string> = {
  STALLED: 'Bị treo',
  MISSING_REPORT: 'Thiếu báo cáo',
  AT_RISK: 'Nguy cơ không đạt',
  OVERDUE: 'Quá hạn',
  UNASSIGNED: 'Chưa giao',
  PROPOSAL_PENDING: 'Đề xuất chờ duyệt',
  REPORT_PENDING: 'Báo cáo chờ duyệt',
  EXPLANATION_OVERDUE: 'Giải trình quá hạn',
};

/** Chỉ các loại cảnh báo này có detail là tên chỉ tiêu/nội dung; loại khác detail là câu giải thích của máy chủ. */
export const DETAIL_KINDS = new Set(['OVERDUE', 'AT_RISK', 'MISSING_REPORT', 'EXPLANATION_OVERDUE', 'STALLED']);

export const SEVERITY_RANK: Record<AlertItem['severity'], number> = { critical: 2, warning: 1, info: 0 };

/** Trang mở khi bấm cảnh báo; `departmentId` là phòng của cảnh báo "chưa giao" (nếu biết). */
export function alertLink(alert: AlertItem, departmentId?: string | null) {
  if (alert.targetId) return `/admin/targets/${alert.targetId}`;
  if (alert.candidateId) return `/admin/proposals?id=${encodeURIComponent(alert.candidateId)}`;
  if (alert.kind === 'UNASSIGNED') return `/admin/targets?assignee=none${departmentId ? `&departmentId=${departmentId}` : ''}`;
  return undefined;
}

export function alertWhen(alert: AlertItem) {
  if (!alert.at) return '';
  return alert.kind === 'OVERDUE' || alert.kind === 'EXPLANATION_OVERDUE' ? `Hạn ${date(alert.at)}` : fromNow(alert.at);
}
