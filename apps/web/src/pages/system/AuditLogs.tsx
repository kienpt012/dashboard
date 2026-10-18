import { SearchOutlined } from '@ant-design/icons';
import { Card, DatePicker, Descriptions, Input, Select, Table, Tag, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import { useState } from 'react';
import { FilterBar, Page } from '@/components/Page';
import { LoadError } from '@/components/States';
import { useApi } from '@/hooks/useApi';
import { departmentOptions, useDepartments } from '@/hooks/useRefs';
import { query } from '@/lib/api';
import { dateTime, num, vn } from '@/lib/format';
import { roleLabel } from '@/lib/roles';
import type { Role } from '@/types/core';

type Log = {
  id: string;
  actorUsername: string;
  actorRole: Role;
  action: string;
  entityType: string;
  entityId?: string | null;
  department?: { id: string; code: string; name: string } | null;
  metadata?: Record<string, string | number | boolean | string[]> | null;
  createdAt: string;
};
type Response = { items: Log[]; total: number; page: number; pageSize: number; totalPages: number; filters: { actions: string[]; entityTypes: string[] } };

const ACTION: Record<string, string> = {
  AGENT_ACTION_CANCELLED: 'Huỷ thao tác của Jarvis',
  AGENT_ACTION_EXECUTED: 'Thực hiện thao tác của Jarvis',
  AGENT_ACTION_PROPOSED: 'Jarvis đề xuất thao tác',
  AI_CANDIDATE_APPROVED: 'Duyệt đề xuất do AI trích xuất',
  APPLY_EXCEL_IMPORT: 'Áp dụng số liệu từ Excel',
  AI_CANDIDATE_EDITED: 'Hiệu chỉnh đề xuất AI',
  AI_CANDIDATE_REJECTED: 'Từ chối đề xuất AI',
  ASSIGNED: 'Giao việc',
  BUG_REPORT_UPDATED: 'Cập nhật báo lỗi',
  CITIZEN_ATTACHMENTS_ADDED: 'Người dân bổ sung tệp',
  CITIZEN_MESSAGE_ADDED: 'Người dân bổ sung thông tin',
  CITIZEN_RATED: 'Người dân đánh giá',
  CITIZEN_REOPEN_REQUESTED: 'Người dân đề nghị xem xét lại',
  CITIZEN_REOPEN_REQUEST_REJECTED: 'Từ chối đề nghị xem xét lại',
  COMPUTED_UPDATE: 'Tự tính lại số liệu',
  CONTACT_ATTEMPT_LOGGED: 'Ghi nhận liên hệ người dân',
  COPILOT_QUERY: 'Hỏi Jarvis',
  CREATED: 'Tạo mới',
  DATASET_CREATED: 'Tạo bảng dữ liệu',
  DATASET_IMPORTED: 'Nhập Excel vào bảng dữ liệu',
  DATASET_ROW_CREATED: 'Thêm dòng dữ liệu',
  DATASET_ROW_DELETED: 'Xoá dòng dữ liệu',
  DATASET_ROW_UPDATED: 'Sửa dòng dữ liệu',
  DATASET_UPDATED: 'Sửa bảng dữ liệu',
  DEPARTMENT_CREATED: 'Tạo phòng ban',
  DEPARTMENT_UPDATED: 'Cập nhật phòng ban',
  DIRECTIVE_ADDED: 'Thêm văn bản chỉ đạo',
  DIRECTIVE_REMOVED: 'Gỡ văn bản chỉ đạo',
  DOCUMENT_DELETED: 'Xoá văn bản',
  DOCUMENT_EXTRACTION_CANCELLED: 'Dừng trích xuất văn bản',
  DOCUMENT_EXTRACTION_REQUESTED: 'Yêu cầu trích xuất lại',
  DOCUMENT_PUBLICATION_PUBLISHED: 'Công khai văn bản',
  DOCUMENT_PUBLICATION_REVOKED: 'Gỡ công khai văn bản',
  DOCUMENT_PUBLICATION_UPDATED: 'Cập nhật văn bản công khai',
  DOCUMENT_UPDATED: 'Sửa thông tin văn bản',
  DOCUMENT_UPLOADED: 'Tải văn bản lên',
  ESCALATED: 'Báo lên lãnh đạo',
  EVALUATED: 'Đánh giá chỉ tiêu',
  EVIDENCE_ADDED: 'Bổ sung minh chứng',
  EXPLANATION_ANSWERED: 'Trả lời giải trình',
  EXPLANATION_REQUESTED: 'Yêu cầu giải trình',
  EXPORT_PROGRESS_TEMPLATE: 'Tải phiếu nhập Excel',
  EXPORT_TARGET_REPORT: 'Xuất báo cáo chỉ tiêu',
  FEEDBACK_ASSIGNED: 'Phân công phản ánh',
  FEEDBACK_CLOSED: 'Đóng phản ánh',
  FEEDBACK_CLOSED_NO_RESPONSE: 'Đóng phản ánh do quá hạn bổ sung',
  FEEDBACK_MESSAGE_ADDED: 'Trao đổi về phản ánh',
  FEEDBACK_PUBLISHED: 'Công khai kết quả phản ánh',
  FEEDBACK_UNPUBLISHED: 'Gỡ công khai phản ánh',
  FEEDBACK_REJECTED: 'Không tiếp nhận phản ánh',
  FEEDBACK_REOPENED: 'Mở lại phản ánh',
  FEEDBACK_SUBMITTED_FOR_REVIEW: 'Trình duyệt kết quả phản ánh',
  FEEDBACK_STARTED: 'Bắt đầu xử lý phản ánh',
  FEEDBACK_TRIAGED: 'Phân loại phản ánh',
  FRAMEWORK_CREATED: 'Tạo bộ chỉ tiêu',
  FRAMEWORK_TEMPLATE_APPLIED: 'Nạp bộ chỉ tiêu mẫu',
  FRAMEWORK_UPDATED: 'Cập nhật bộ chỉ tiêu',
  INFORMATION_REQUESTED: 'Yêu cầu bổ sung thông tin',
  LOCALITY_SETUP_APPLIED: 'Thiết lập địa phương',
  LOCALITY_UPDATED: 'Cập nhật thông tin địa phương',
  LOGIN: 'Đăng nhập',
  PASSWORD_CHANGED: 'Đổi mật khẩu',
  PASSWORD_RESET_COMPLETED: 'Khôi phục mật khẩu',
  PREVIEW_EXCEL_IMPORT: 'Đối soát tệp Excel',
  PROGRESS_APPROVED: 'Duyệt số liệu',
  PROGRESS_APPROVED_DIRECTLY: 'Ghi nhận số liệu trực tiếp',
  PROGRESS_AUTO_APPROVED: 'Tự thông qua số liệu',
  PROGRESS_REJECTED: 'Trả lại số liệu',
  PROGRESS_SUBMITTED: 'Gửi số liệu chờ duyệt',
  PROPOSAL_APPROVED: 'Duyệt đề xuất chỉ tiêu',
  PROPOSAL_AUTO_APPROVED: 'Tự thông qua đề xuất chỉ tiêu',
  PROPOSAL_AUTO_BLOCKED: 'Không tự thông qua được đề xuất',
  PROPOSAL_CREATED: 'Tạo đề xuất chỉ tiêu',
  PROPOSAL_REJECTED: 'Từ chối đề xuất',
  PROPOSAL_SUBMITTED: 'Trình đề xuất',
  PUBLIC_DASHBOARD_DRAFT_SAVED: 'Lưu nháp trang công khai',
  PUBLIC_DASHBOARD_PUBLISHED: 'Công bố trang công khai',
  PUBLIC_DASHBOARD_REVISION_RESTORED: 'Khôi phục phiên bản trang công khai',
  SUBMIT_EXCEL_IMPORT_FOR_REVIEW: 'Trình duyệt số liệu từ Excel',
  REMINDER: 'Nhắc việc',
  REPORT_APPROVED: 'Duyệt báo cáo',
  REPORT_AUTO_APPROVED: 'Tự thông qua báo cáo',
  REPORT_AUTO_BLOCKED: 'Không tự thông qua được báo cáo',
  REPORT_REJECTED: 'Trả lại báo cáo',
  REPORT_SUBMITTED: 'Gửi báo cáo',
  RESOLUTION_APPROVED: 'Duyệt kết quả phản ánh',
  RESOLUTION_RETURNED: 'Trả lại kết quả phản ánh',
  RETURNED: 'Trả việc',
  SYSTEM_SETTINGS_UPDATED: 'Cập nhật cấu hình',
  TARGET_ARCHIVED: 'Lưu trữ chỉ tiêu',
  TARGET_ASSIGNED: 'Giao chỉ tiêu',
  TARGET_CREATED: 'Tạo chỉ tiêu',
  TARGET_DIRECTIVE_ADDED: 'Thêm văn bản chỉ đạo',
  TARGET_DIRECTIVE_REMOVED: 'Gỡ văn bản chỉ đạo',
  TARGET_EVALUATED: 'Đánh giá chỉ tiêu',
  TARGET_EVIDENCE_ADDED: 'Bổ sung minh chứng',
  TARGET_EXPLANATION_REQUESTED: 'Yêu cầu giải trình',
  TARGET_PUBLISHED: 'Công bố chỉ tiêu',
  TARGET_SOURCE_ANCHOR_CLEARED: 'Bỏ vị trí chỉ tay, để hệ thống tự định vị',
  TARGET_SOURCE_ANCHORED: 'Chỉ vị trí chỉ tiêu trong văn bản giao',
  TARGET_SOURCE_CARD_UPDATED: 'Cập nhật nguồn số liệu',
  TARGET_UNARCHIVED: 'Khôi phục chỉ tiêu',
  TARGET_UNPUBLISHED: 'Thôi công bố chỉ tiêu',
  TARGET_UPDATED: 'Cập nhật chỉ tiêu',
  TRANSFERRED: 'Chuyển việc',
  USER_CREATED: 'Tạo tài khoản',
  USER_UPDATED: 'Cập nhật tài khoản',
};

const ENTITY: Record<string, string> = {
  Department: 'Phòng ban',
  Feedback: 'Phản ánh',
  ImportBatch: 'Phiên nhập Excel',
  IMPORT_BATCH: 'Phiên nhập Excel',
  IMPORT_TEMPLATE: 'Phiếu nhập Excel',
  REPORT_EXPORT: 'Báo cáo xuất ra',
  DocumentPublication: 'Văn bản công khai',
  ProgressUpdate: 'Báo cáo số liệu',
  PublicDashboard: 'Trang công khai',
  PublicDashboardRevision: 'Phiên bản trang công khai',
  SystemSetting: 'Cấu hình',
  Target: 'Chỉ tiêu',
  User: 'Tài khoản',
  Framework: 'Bộ chỉ tiêu',
  Dataset: 'Bảng dữ liệu',
  SourceDocument: 'Văn bản',
  IndicatorCandidate: 'Đề xuất chỉ tiêu',
  DatasetRow: 'Dòng dữ liệu',
  TargetDirective: 'Văn bản chỉ đạo',
  TargetEvaluation: 'Đánh giá',
  TargetEvidence: 'Minh chứng',
  ExplanationRequest: 'Giải trình',
  BugReport: 'Báo lỗi',
  LocalityProfile: 'Địa phương',
  AgentAction: 'Thao tác của Jarvis',
  Copilot: 'Jarvis',
  ExtractionJob: 'Lượt trích xuất',
};

// Bao phủ SAFE_METADATA_KEYS và các khóa metadata được backend ghi vào nhật ký.
const METADATA_NAMES: Record<string, string> = {
  after: 'Sau thay đổi',
  aiModel: 'Mô hình AI',
  anonymizationConfirmed: 'Đã ẩn thông tin cá nhân',
  approved: 'Đã duyệt',
  assignedToId: 'Mã người được giao',
  assignedToName: 'Người được giao',
  baseVersion: 'Phiên bản gốc',
  before: 'Trước thay đổi',
  bounceCount: 'Số lần chuyển, trả',
  candidateName: 'Tên đề xuất',
  category: 'Lĩnh vực',
  changedFields: 'Trường thay đổi',
  changedRows: 'Số dòng thay đổi',
  channel: 'Kênh liên hệ',
  citizenRequested: 'Người dân yêu cầu',
  citizenResponseDueAt: 'Hạn người dân bổ sung',
  code: 'Mã',
  codeGeneratedBySystem: 'Mã do hệ thống tạo',
  comment: 'Nhận xét',
  confidence: 'Độ tin cậy',
  count: 'Số lượng',
  currentActive: 'Đang hoạt động',
  currentRole: 'Vai trò hiện tại',
  dashboardId: 'Mã trang công khai',
  documentCode: 'Mã văn bản',
  documentCount: 'Số lượng hồ sơ',
  departmentCount: 'Số phòng ban',
  dueAt: 'Hạn xử lý',
  emailPublicNote: 'Nội dung gửi người dân',
  errorRows: 'Số dòng lỗi',
  extractionMethod: 'Phương thức trích xuất',
  failed: 'Thất bại',
  frameworkId: 'Mã bộ chỉ tiêu',
  fromCandidate: 'Từ đề xuất',
  fromStatus: 'Trạng thái trước',
  historyCount: 'Số bản ghi lịch sử',
  humanEdited: 'Đã hiệu chỉnh',
  intent: 'Yêu cầu',
  isPublic: 'Công khai',
  mimeType: 'Định dạng tệp',
  name: 'Tên',
  outcome: 'Kết quả',
  passwordReset: 'Đặt lại mật khẩu',
  periodKey: 'Kỳ báo cáo',
  planner: 'Bộ lập kế hoạch',
  previousActive: 'Hoạt động trước thay đổi',
  previousArchiveReason: 'Lý do lưu trữ trước',
  previousArchivedAt: 'Thời điểm lưu trữ trước',
  previousDepartmentId: 'Mã phòng ban trước',
  previousDueAt: 'Hạn xử lý trước',
  previousPriority: 'Mức ưu tiên trước',
  previousPublicCategory: 'Lĩnh vực công khai trước',
  previousPublicDepartmentName: 'Phòng ban công khai trước',
  previousPublicSummary: 'Tóm tắt công khai trước',
  previousPublicTitle: 'Tiêu đề công khai trước',
  previousPublicationVersion: 'Phiên bản công khai trước',
  previousRating: 'Đánh giá trước',
  previousRatingComment: 'Nhận xét trước',
  previousRejectionReason: 'Lý do từ chối trước',
  previousResolutionSummary: 'Kết quả xử lý trước',
  previousRole: 'Vai trò trước',
  previousStatus: 'Trạng thái trước',
  previousValue: 'Giá trị trước',
  previousVersion: 'Phiên bản trước',
  priority: 'Mức ưu tiên',
  progressUpdateId: 'Mã báo cáo số liệu',
  publicCategory: 'Lĩnh vực công khai',
  publicCode: 'Mã công khai',
  publicDepartmentName: 'Phòng ban công khai',
  publicResolutionSummary: 'Kết quả xử lý công khai',
  publicResolvedAt: 'Thời điểm xử lý công khai',
  publicSnapshotVersion: 'Phiên bản bản lưu công khai',
  publicSummary: 'Tóm tắt công khai',
  publicTitle: 'Tiêu đề công khai',
  publicationVersion: 'Phiên bản công khai',
  publishedValue: 'Giá trị công bố',
  rating: 'Đánh giá',
  reason: 'Lý do',
  result: 'Kết quả',
  reviewNote: 'Ý kiến duyệt',
  reviewStatus: 'Trạng thái duyệt',
  reviewers: 'Người duyệt',
  revision: 'Bản sửa đổi',
  revoked: 'Đã thu hồi',
  role: 'Vai trò',
  size: 'Dung lượng tệp',
  source: 'Nguồn',
  sourceDocumentId: 'Mã văn bản nguồn',
  targetCode: 'Mã chỉ tiêu',
  targetCount: 'Số chỉ tiêu',
  targetId: 'Mã định danh chỉ tiêu',
  templateKey: 'Mã biểu mẫu',
  toStatus: 'Trạng thái sau',
  tool: 'Công cụ',
  totalRows: 'Tổng số dòng',
  unchangedRows: 'Số dòng không đổi',
  username: 'Tài khoản',
  value: 'Giá trị',
  version: 'Phiên bản',
  visibility: 'Phạm vi hiển thị',
  wasPublic: 'Đã từng công khai',
  widgetCount: 'Số thành phần',
  year: 'Năm',
};

/** Tên trường cấu hình trong "Trường thay đổi" (nhãn khớp màn hình Cấu hình và hồ sơ). */
const FIELD_NAMES: Record<string, string> = {
  defaultYear: 'Năm kế hoạch mặc định',
  warningDays: 'Cảnh báo trước hạn',
  riskThreshold: 'Ngưỡng có nguy cơ',
  reportAutoApproveDays: 'Tự thông qua báo cáo sau',
  proposalAutoApproveDays: 'Tự thông qua đề xuất sau',
  explanationDueDays: 'Hạn trả lời giải trình',
  assignmentStallDays: 'Nhắc chưa giao người sau',
  maxTransfers: 'Số lần chuyển việc tối đa',
  feedbackFirstResponseDays: 'Hạn phản hồi đầu tiên',
  feedbackResolutionDays: 'Hạn xử lý phản ánh',
  feedbackCitizenResponseDays: 'Hạn người dân bổ sung',
  wallboardRotateSeconds: 'Chuyển trang trình chiếu sau',
  jarvisIntro: 'Hiệu ứng khi gọi Jarvis',
};

function formatMetadata(value: NonNullable<Log['metadata']>[string], key?: string): string {
  if (key === 'changedFields' && Array.isArray(value)) return value.map(item => FIELD_NAMES[String(item)] ?? METADATA_NAMES[String(item)] ?? String(item)).join(', ');
  if (Array.isArray(value)) return value.map(item => formatMetadata(item)).join(', ');
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) && vn(value).isValid()) {
    return vn(value).format('DD/MM/YYYY HH:mm');
  }
  return String(value);
}

export default function AuditLogs() {
  const departments = useDepartments();
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [action, setAction] = useState<string>();
  const [entityType, setEntityType] = useState<string>();
  const [departmentId, setDepartmentId] = useState<string>();
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const list = useApi<Response>(
    `/audit-logs${query({ page, pageSize, order, search: search || undefined, action, entityType, departmentId, fromDate: range?.[0]?.format('YYYY-MM-DD'), toDate: range?.[1]?.format('YYYY-MM-DD') })}`,
    { keepPrevious: true },
  );
  const reset = () => setPage(1);

  return (
    <Page title="Nhật ký hệ thống" meta={list.data && <span>{num(list.data.total)} bản ghi</span>} wide>
      <Card className="card-flush">
        <div className="table-filters">
          <FilterBar
            active={[action, entityType, departmentId, range].filter(Boolean).length}
            search={
              <Input
                allowClear
                prefix={<SearchOutlined />}
                placeholder="Tài khoản, mã đối tượng"
                value={text}
                onChange={event => {
                  setText(event.target.value);
                  if (!event.target.value) {
                    setSearch('');
                    reset();
                  }
                }}
                onPressEnter={() => {
                  setSearch(text.trim());
                  reset();
                }}
                style={{ width: '100%', maxWidth: 260 }}
              />
            }
            filters={
              <>
                <Select allowClear showSearch={{ optionFilterProp: 'label' }} placeholder="Thao tác" value={action} onChange={value => { setAction(value); reset(); }} options={(list.data?.filters.actions ?? []).map(value => ({ value, label: ACTION[value] ?? value }))} style={{ width: 230 }} popupMatchSelectWidth={false} />
                <Select allowClear placeholder="Đối tượng" value={entityType} onChange={value => { setEntityType(value); reset(); }} options={(list.data?.filters.entityTypes ?? []).map(value => ({ value, label: ENTITY[value] ?? value }))} style={{ width: 180 }} />
                <Select allowClear placeholder="Phòng ban" value={departmentId} onChange={value => { setDepartmentId(value); reset(); }} options={departmentOptions(departments.data, false)} style={{ width: 200 }} popupMatchSelectWidth={false} />
                <DatePicker.RangePicker value={range} onChange={value => { setRange(value as [Dayjs | null, Dayjs | null] | null); reset(); }} format="DD/MM/YYYY" />
              </>
            }
          />
        </div>
        {list.error && !list.data ? (
          <LoadError error={list.error} retry={() => void list.refetch()} />
        ) : (
          <Table
            rowKey="id"
            size="middle"
            loading={list.isLoading || list.isFetching}
            dataSource={list.data?.items ?? []}
            scroll={{ x: 1100 }}
            tableLayout="fixed"
            pagination={{
              current: page,
              pageSize,
              total: list.data?.total ?? 0,
              showSizeChanger: true,
              pageSizeOptions: [20, 50, 100],
              onChange: (next, size) => {
                setPage(size !== pageSize ? 1 : next);
                setPageSize(size);
              },
              showTotal: total => `${num(total)} bản ghi`,
            }}
            expandable={{
              rowExpandable: row => Boolean(row.metadata && Object.keys(row.metadata).length),
              expandedRowRender: row => (
                <Descriptions
                  size="small"
                  column={{ xs: 1, md: 2, xl: 3 }}
                  styles={{ label: { whiteSpace: 'normal' }, content: { minWidth: 0, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' } }}
                  items={Object.entries(row.metadata ?? {}).map(([key, value]) => ({ key, label: METADATA_NAMES[key] ?? key, children: formatMetadata(value, key) }))}
                />
              ),
            }}
            onChange={(_pagination, _filters, sorter, extra) => {
              if (extra.action !== 'sort') return;
              const next = Array.isArray(sorter) ? sorter[0] : sorter;
              // Bảng phân trang ở máy chủ: chỉ sắp xếp theo thời điểm (máy chủ hỗ trợ), không sắp xếp riêng trang đang xem.
              setOrder(next?.order === 'ascend' ? 'asc' : 'desc');
              setPage(1);
            }}
            columns={[
              {
                title: 'Thời điểm',
                key: 'createdAt',
                dataIndex: 'createdAt',
                width: 160,
                sorter: true,
                sortOrder: order === 'asc' ? 'ascend' : 'descend',
                sortDirections: ['descend', 'ascend', 'descend'],
                render: value => <span className="num">{dateTime(value)}</span> },
              {
                title: 'Người thực hiện',
                key: 'actor',
                width: 180,
                render: (_, row) => (
                  <div className="cell-title">
                    <strong>{row.actorUsername}</strong>
                    <span>{roleLabel[row.actorRole] ?? row.actorRole}</span>
                  </div>
                ),
              },
              { title: 'Thao tác', key: 'action', dataIndex: 'action', width: 220, render: value => ACTION[value] ?? value },
              {
                title: 'Đối tượng',
                key: 'entity',
                width: 260,
                render: (_, row) => (
                  <div className="cell-title" style={{ minWidth: 0 }}>
                    <div><Tag>{ENTITY[row.entityType] ?? row.entityType}</Tag></div>
                    {row.metadata?.code ? <span className="secondary" style={{ overflowWrap: 'anywhere' }}>{String(row.metadata.code)}</span> : null}
                    {row.entityId ? (
                      <Typography.Paragraph type="secondary" copyable={{ text: row.entityId }} style={{ margin: 0, maxWidth: '100%', fontSize: 12, overflowWrap: 'anywhere' }}>
                        {row.entityId}
                      </Typography.Paragraph>
                    ) : <span>Toàn hệ thống</span>}
                  </div>
                ),
              },
              { title: 'Phòng ban', key: 'dept', width: 200, render: (_, row) => row.department?.name ?? <span className="muted">—</span> },
            ]}
          />
        )}
      </Card>
    </Page>
  );
}
