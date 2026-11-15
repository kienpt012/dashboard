export type AlertKind = 'OVERDUE' | 'AT_RISK' | 'MISSING_REPORT' | 'REPORT_PENDING' | 'UNASSIGNED' | 'EXPLANATION_OVERDUE' | 'STALLED' | 'DUE_SOON' | 'PROPOSAL_PENDING';

/** Câu ngắn, tên trước trạng thái; các chi tiết thuộc dòng phụ. */
export function alertTitle(title: string, kind: AlertKind, options: { days?: number; period?: string; count?: number } = {}) {
  const days = Math.max(0, Math.floor(options.days ?? 0));
  const status: Record<AlertKind, string> = {
    OVERDUE: `quá hạn ${days} ngày`,
    AT_RISK: 'có nguy cơ không đạt',
    MISSING_REPORT: `thiếu báo cáo${options.period ? ` ${options.period}` : ''}`,
    REPORT_PENDING: `chờ duyệt ${days} ngày`,
    UNASSIGNED: 'chưa giao người phụ trách',
    EXPLANATION_OVERDUE: `quá hạn giải trình ${days} ngày`,
    STALLED: `chuyển, trả ${options.count ?? 0} lần`,
    DUE_SOON: `sắp đến hạn${options.period ? ` báo cáo ${options.period}` : ''}`,
    PROPOSAL_PENDING: `đề xuất chờ duyệt ${days} ngày`,
  };
  return `${title.trim()} — ${status[kind]}`;
}
