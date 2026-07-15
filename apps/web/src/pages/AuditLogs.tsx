import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Filter,
  History,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, auth } from '../api';
import { Empty, PageHead, Spinner } from '../components/UI';
import type { Department, Role } from '../types';
import '../audit.css';

type SafeMetadata = Record<string, string | number | boolean | string[]>;

type AuditLog = {
  id: string;
  actorUsername: string;
  actorRole: Role;
  action: string;
  entityType: string;
  entityId?: string | null;
  departmentId?: string | null;
  department?: Pick<Department, 'id' | 'code' | 'name'> | null;
  metadata?: SafeMetadata | null;
  createdAt: string;
};

type AuditLogResponse = {
  items: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  filters: { actions: string[]; entityTypes: string[] };
};

type Filters = {
  search: string;
  action: string;
  entityType: string;
  departmentId: string;
  fromDate: string;
  toDate: string;
};

const emptyFilters: Filters = {
  search: '',
  action: '',
  entityType: '',
  departmentId: '',
  fromDate: '',
  toDate: '',
};

const actionNames: Record<string, string> = {
  DEPARTMENT_CREATED: 'Tạo phòng ban',
  DEPARTMENT_UPDATED: 'Cập nhật phòng ban',
  EXPORT_PROGRESS_TEMPLATE: 'Tải tệp báo cáo mẫu',
  EXPORT_TARGET_REPORT: 'Xuất báo cáo chỉ tiêu',
  FEEDBACK_ASSIGNED: 'Phân công phản ánh',
  FEEDBACK_CLOSED: 'Đóng phản ánh',
  FEEDBACK_MESSAGE_ADDED: 'Trao đổi về phản ánh',
  FEEDBACK_PUBLISHED: 'Công khai kết quả phản ánh',
  FEEDBACK_REJECTED: 'Từ chối phản ánh',
  FEEDBACK_REOPENED: 'Mở lại phản ánh',
  FEEDBACK_SUBMITTED_FOR_REVIEW: 'Trình duyệt kết quả phản ánh',
  FEEDBACK_STARTED: 'Bắt đầu xử lý phản ánh',
  FEEDBACK_TRIAGED: 'Phân loại phản ánh',
  INFORMATION_REQUESTED: 'Yêu cầu bổ sung thông tin',
  PREVIEW_EXCEL_IMPORT: 'Kiểm tra tệp Excel',
  PROGRESS_APPROVED: 'Duyệt số liệu tiến độ',
  PROGRESS_APPROVED_DIRECTLY: 'Cập nhật tiến độ trực tiếp',
  PROGRESS_REJECTED: 'Từ chối số liệu tiến độ',
  PROGRESS_SUBMITTED: 'Gửi số liệu chờ duyệt',
  RESOLUTION_APPROVED: 'Duyệt kết quả phản ánh',
  RESOLUTION_RETURNED: 'Yêu cầu xử lý lại phản ánh',
  SYSTEM_SETTINGS_UPDATED: 'Cập nhật cấu hình hệ thống',
  TARGET_CREATED: 'Tạo chỉ tiêu',
  TARGET_PUBLISHED: 'Công bố chỉ tiêu',
  TARGET_UPDATED: 'Cập nhật chỉ tiêu',
  USER_CREATED: 'Tạo tài khoản',
  USER_UPDATED: 'Cập nhật tài khoản',
};

const entityNames: Record<string, string> = {
  Department: 'Phòng ban',
  Feedback: 'Phản ánh',
  ImportBatch: 'Phiên nhập Excel',
  ProgressUpdate: 'Báo cáo tiến độ',
  SystemSetting: 'Cấu hình hệ thống',
  Target: 'Chỉ tiêu',
  User: 'Tài khoản',
};

const roleNames: Record<Role, string> = {
  ADMIN: 'Quản trị',
  MANAGER: 'Lãnh đạo đơn vị',
  STAFF: 'Cán bộ cập nhật',
  VIEWER: 'Chỉ xem',
};

const metadataNames: Record<string, string> = {
  baseVersion: 'Phiên bản gốc',
  category: 'Nhóm phản ánh',
  changedFields: 'Trường thay đổi',
  changedRows: 'Dòng thay đổi',
  code: 'Mã nghiệp vụ',
  currentActive: 'Trạng thái mới',
  currentRole: 'Vai trò mới',
  errorRows: 'Dòng lỗi',
  fromStatus: 'Trạng thái trước',
  historyCount: 'Số bản ghi lịch sử',
  passwordReset: 'Đặt lại mật khẩu',
  previousActive: 'Trạng thái trước',
  previousRole: 'Vai trò trước',
  previousVersion: 'Phiên bản trước',
  priority: 'Mức ưu tiên',
  publishedValue: 'Giá trị công bố',
  reviewStatus: 'Trạng thái duyệt',
  role: 'Vai trò',
  targetCount: 'Số chỉ tiêu',
  toStatus: 'Trạng thái sau',
  totalRows: 'Tổng số dòng',
  unchangedRows: 'Dòng không đổi',
  username: 'Tài khoản',
  value: 'Giá trị',
  version: 'Phiên bản mới',
  visibility: 'Phạm vi hiển thị',
  year: 'Năm',
};

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'Không thể tải nhật ký hệ thống';
}

function paramsOf(filters: Filters, page: number, pageSize: number) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  for (const [key, value] of Object.entries(filters)) {
    if (value.trim()) params.set(key, value.trim());
  }
  return params.toString();
}

function formatValue(value: SafeMetadata[string]) {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  return String(value);
}

function Metadata({ value }: { value?: SafeMetadata | null }) {
  const entries = Object.entries(value || {});
  if (!entries.length) return <span className="audit-muted">Không có chi tiết bổ sung</span>;
  return <dl className="audit-metadata">{entries.map(([key, item]) => <div key={key}>
    <dt>{metadataNames[key] || key}</dt>
    <dd>{formatValue(item)}</dd>
  </div>)}</dl>;
}

function AuditCard({ row }: { row: AuditLog }) {
  return <article className="audit-card">
    <div className="audit-card-head">
      <span className="audit-action">{actionNames[row.action] || row.action}</span>
      <time dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleString('vi-VN')}</time>
    </div>
    <div className="audit-card-grid">
      <div><span>Người thao tác</span><strong>@{row.actorUsername}</strong><small>{roleNames[row.actorRole]}</small></div>
      <div><span>Đối tượng</span><strong>{entityNames[row.entityType] || row.entityType}</strong><small>{row.entityId ? `Mã: ${row.entityId}` : 'Toàn hệ thống'}</small></div>
      <div><span>Phòng ban</span><strong>{row.department?.name || 'Toàn hệ thống'}</strong><small>{row.department?.code || '—'}</small></div>
    </div>
    <details><summary>Xem chi tiết an toàn</summary><Metadata value={row.metadata} /></details>
  </article>;
}

export default function AuditLogs() {
  const isAdmin = auth.user?.role === 'ADMIN';
  const [rows, setRows] = useState<AuditLog[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [draft, setDraft] = useState<Filters>(emptyFilters);
  const [applied, setApplied] = useState<Filters>(emptyFilters);
  const [actions, setActions] = useState<string[]>([]);
  const [entityTypes, setEntityTypes] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (nextFilters: Filters, nextPage: number, nextPageSize: number) => {
    if (!isAdmin) return;
    setLoading(true);
    setError('');
    try {
      const result = await api<AuditLogResponse>(`/audit-logs?${paramsOf(nextFilters, nextPage, nextPageSize)}`);
      setRows(result.items);
      setTotal(result.total);
      setPage(result.page);
      setPageSize(result.pageSize);
      setTotalPages(result.totalPages);
      setActions(result.filters.actions);
      setEntityTypes(result.filters.entityTypes);
    } catch (reason) {
      setRows([]);
      setError(messageOf(reason));
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) { setLoading(false); return; }
    api<Department[]>('/departments').then(setDepartments).catch(() => setDepartments([]));
    void load(emptyFilters, 1, 20);
  }, [isAdmin, load]);

  const visibleRange = useMemo(() => {
    if (!total || !rows.length) return '0 bản ghi';
    const start = (page - 1) * pageSize + 1;
    return `${start}–${start + rows.length - 1} / ${total} bản ghi`;
  }, [page, pageSize, rows.length, total]);

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    if (draft.fromDate && draft.toDate && draft.fromDate > draft.toDate) {
      setError('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc');
      return;
    }
    setApplied(draft);
    void load(draft, 1, pageSize);
  }

  function clearFilters() {
    setDraft(emptyFilters);
    setApplied(emptyFilters);
    void load(emptyFilters, 1, pageSize);
  }

  function goTo(nextPage: number) {
    if (loading || nextPage < 1 || nextPage > totalPages) return;
    void load(applied, nextPage, pageSize);
  }

  if (!isAdmin) return <>
    <PageHead eyebrow="AN TOÀN HỆ THỐNG" title="Không có quyền truy cập" description="Nhật ký hệ thống chỉ dành cho quản trị viên được ủy quyền." />
    <Empty title="Quyền truy cập bị giới hạn" description="Vui lòng quay lại trang tổng quan." />
  </>;

  return <>
    <PageHead
      eyebrow="AN TOÀN & TRUY VẾT"
      title="Nhật ký hệ thống"
      description="Theo dõi các thao tác quan trọng để kiểm tra trách nhiệm, phát hiện sai lệch và hỗ trợ xử lý sự cố."
      actions={<button type="button" className="btn secondary" onClick={() => void load(applied, page, pageSize)} disabled={loading}><RefreshCw />Làm mới</button>}
    />

    <div className="audit-assurance"><ShieldCheck /><div><strong>Dữ liệu chỉ đọc và đã giới hạn thông tin</strong><p>Nhật ký không cho phép sửa hoặc xóa; mật khẩu, thông tin liên hệ và nội dung nghiệp vụ nhạy cảm không được hiển thị.</p></div></div>

    <form className="audit-filters" onSubmit={applyFilters}>
      <label className="audit-search"><span>Tìm kiếm</span><div className="search"><Search /><input maxLength={120} value={draft.search} onChange={event => setDraft(current => ({ ...current, search: event.target.value }))} placeholder="Tài khoản, hành động hoặc mã đối tượng" /></div></label>
      <label><span>Hành động</span><select value={draft.action} onChange={event => setDraft(current => ({ ...current, action: event.target.value }))}><option value="">Tất cả hành động</option>{actions.map(action => <option key={action} value={action}>{actionNames[action] || action}</option>)}</select></label>
      <label><span>Đối tượng</span><select value={draft.entityType} onChange={event => setDraft(current => ({ ...current, entityType: event.target.value }))}><option value="">Tất cả đối tượng</option>{entityTypes.map(entity => <option key={entity} value={entity}>{entityNames[entity] || entity}</option>)}</select></label>
      <label><span>Phòng ban</span><select value={draft.departmentId} onChange={event => setDraft(current => ({ ...current, departmentId: event.target.value }))}><option value="">Toàn hệ thống</option>{departments.map(department => <option key={department.id} value={department.id}>{department.name}{department.isActive ? '' : ' (đã ngừng)'}</option>)}</select></label>
      <label><span>Từ ngày</span><div className="audit-date"><CalendarDays /><input type="date" value={draft.fromDate} onChange={event => setDraft(current => ({ ...current, fromDate: event.target.value }))} /></div></label>
      <label><span>Đến ngày</span><div className="audit-date"><CalendarDays /><input type="date" value={draft.toDate} onChange={event => setDraft(current => ({ ...current, toDate: event.target.value }))} /></div></label>
      <div className="audit-filter-actions"><button type="submit" className="btn primary" disabled={loading}><Filter />Áp dụng</button><button type="button" className="btn secondary" onClick={clearFilters} disabled={loading}>Xóa bộ lọc</button></div>
    </form>

    {error && <div className="form-error" role="alert">{error}</div>}

    <section className="audit-results" aria-busy={loading}>
      <div className="audit-results-head"><div><History /><span>Kết quả truy vết</span></div><strong>{visibleRange}</strong></div>
      {loading ? <Spinner /> : rows.length ? <>
        <div className="table-wrap audit-table"><table><thead><tr><th>Thời gian</th><th>Người thao tác</th><th>Hành động</th><th>Đối tượng</th><th>Phòng ban</th><th>Chi tiết</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}>
          <td><time dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleString('vi-VN')}</time></td>
          <td><div className="audit-actor"><UserRound /><span><strong>@{row.actorUsername}</strong><small>{roleNames[row.actorRole]}</small></span></div></td>
          <td><span className="audit-action">{actionNames[row.action] || row.action}</span><small className="audit-code">{row.action}</small></td>
          <td><strong>{entityNames[row.entityType] || row.entityType}</strong><small className="audit-code">{row.entityId || 'Toàn hệ thống'}</small></td>
          <td>{row.department?.name || <span className="audit-muted">Toàn hệ thống</span>}</td>
          <td><details className="audit-details"><summary>Xem chi tiết</summary><Metadata value={row.metadata} /></details></td>
        </tr>)}</tbody></table></div>
        <div className="audit-cards">{rows.map(row => <AuditCard key={row.id} row={row} />)}</div>
      </> : <Empty title="Không có nhật ký phù hợp" description="Hãy thay đổi từ khóa, bộ lọc hoặc khoảng thời gian." />}

      {!loading && rows.length > 0 && <div className="audit-pagination">
        <label>Số dòng<select aria-label="Số dòng mỗi trang" value={pageSize} onChange={event => { const size = Number(event.target.value); void load(applied, 1, size); }}><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option><option value={100}>100</option></select></label>
        <span>Trang {page} / {totalPages}</span>
        <div><button type="button" aria-label="Trang trước" onClick={() => goTo(page - 1)} disabled={page <= 1}><ChevronLeft /></button><button type="button" aria-label="Trang sau" onClick={() => goTo(page + 1)} disabled={page >= totalPages}><ChevronRight /></button></div>
      </div>}
    </section>
  </>;
}
