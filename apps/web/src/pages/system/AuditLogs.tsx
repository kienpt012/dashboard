import { SearchOutlined } from '@ant-design/icons';
import { Card, DatePicker, Descriptions, Input, Select, Table, Tag } from 'antd';
import type { Dayjs } from 'dayjs';
import { useState } from 'react';
import { FilterBar, Page } from '@/components/Page';
import { LoadError } from '@/components/States';
import { useApi } from '@/hooks/useApi';
import { departmentOptions, useDepartments } from '@/hooks/useRefs';
import { query } from '@/lib/api';
import { dateTime, num } from '@/lib/format';
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
  AGENT_ACTION_CANCELLED: 'Huỷ thao tác của trợ lý',
  AGENT_ACTION_EXECUTED: 'Thực hiện thao tác của trợ lý',
  AGENT_ACTION_PROPOSED: 'Trợ lý đề xuất thao tác',
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
  COPILOT_QUERY: 'Hỏi trợ lý',
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
  PROPOSAL_AUTO_BLOCKED: 'Không tự thông qua được đề xuất',
  PROPOSAL_CREATED: 'Tạo đề xuất chỉ tiêu',
  PROPOSAL_REJECTED: 'Từ chối đề xuất',
  PROPOSAL_SUBMITTED: 'Trình đề xuất',
  PUBLIC_DASHBOARD_DRAFT_SAVED: 'Lưu nháp trang công khai',
  PUBLIC_DASHBOARD_PUBLISHED: 'Công bố trang công khai',
  PUBLIC_DASHBOARD_REVISION_RESTORED: 'Khôi phục phiên bản trang công khai',
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
  TARGET_SOURCE_CARD_UPDATED: 'Cập nhật nguồn số liệu',
  TARGET_UNARCHIVED: 'Khôi phục chỉ tiêu',
  TARGET_UPDATED: 'Cập nhật chỉ tiêu',
  TRANSFERRED: 'Chuyển việc',
  USER_CREATED: 'Tạo tài khoản',
  USER_UPDATED: 'Cập nhật tài khoản',
};

const ENTITY: Record<string, string> = {
  Department: 'Phòng ban',
  Feedback: 'Phản ánh',
  ImportBatch: 'Phiên nhập Excel',
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
  AgentAction: 'Trợ lý',
  ExtractionJob: 'Lượt trích xuất',
};

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
  const list = useApi<Response>(
    `/audit-logs${query({ page, pageSize, search: search || undefined, action, entityType, departmentId, fromDate: range?.[0]?.format('YYYY-MM-DD'), toDate: range?.[1]?.format('YYYY-MM-DD') })}`,
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
            scroll={{ x: 1000 }}
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
                  items={Object.entries(row.metadata ?? {}).map(([key, value]) => ({ label: key, children: Array.isArray(value) ? value.join(', ') : String(value) }))}
                />
              ),
            }}
            columns={[
              { title: 'Thời điểm', dataIndex: 'createdAt', width: 160, render: value => <span className="num">{dateTime(value)}</span> },
              {
                title: 'Người thực hiện',
                key: 'actor',
                width: 220,
                render: (_, row) => (
                  <div className="cell-title">
                    <strong>{row.actorUsername}</strong>
                    <span>{roleLabel[row.actorRole] ?? row.actorRole}</span>
                  </div>
                ),
              },
              { title: 'Thao tác', dataIndex: 'action', render: value => ACTION[value] ?? value },
              {
                title: 'Đối tượng',
                key: 'entity',
                width: 240,
                render: (_, row) => (
                  <span>
                    <Tag>{ENTITY[row.entityType] ?? row.entityType}</Tag>
                    {row.metadata?.code ? <span className="secondary">{String(row.metadata.code)}</span> : null}
                  </span>
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
