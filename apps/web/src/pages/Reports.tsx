import { AlertTriangle, CalendarClock, CheckCircle2, Download, FileBarChart, Filter, Printer, TrendingUp } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api, auth, downloadApi } from '../api';
import { Empty, PageHead, SkeletonTable } from '../components/UI';
import { toast } from '../components/Toast';
import { currentVietnamYear } from '../date';
import type { Department } from '../types';
import { statusMeta } from '../types';
import '../styles/dashboard.css';

type ReportRow = {
  code: string;
  title: string;
  department: string;
  target: number;
  current: number;
  unit: string;
  progress: number;
  status: string;
  dueDate: string;
  lastReportedAt?: string | null;
};

type AppliedFilter = { year: number; departmentId: string };
type DashboardSummary = { year: number; overallProgress: number };

const currentYear = currentVietnamYear();

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'Có lỗi xảy ra, vui lòng thử lại';
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function queryOf(filter: AppliedFilter) {
  const params = new URLSearchParams({ year: String(filter.year) });
  if (filter.departmentId) params.set('departmentId', filter.departmentId);
  return params.toString();
}

export default function Reports() {
  const user = auth.user;
  const isAdmin = user?.role === 'ADMIN';
  const ownDepartmentId = user?.departmentId || '';
  const [departments, setDepartments] = useState<Department[]>([]);
  const [year, setYear] = useState(String(currentYear));
  const [departmentId, setDepartmentId] = useState(isAdmin ? '' : ownDepartmentId);
  const [appliedFilter, setAppliedFilter] = useState<AppliedFilter>({ year: currentYear, departmentId: isAdmin ? '' : ownDepartmentId });
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [overallProgress, setOverallProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAdmin) return;
    api<Department[]>('/departments')
      .then(items => setDepartments(items.filter(item => item.isActive)))
      .catch(error => setError(messageOf(error)));
  }, [isAdmin]);

  async function loadReport(filter?: AppliedFilter) {
    setLoading(true);
    setError('');
    try {
      const query = filter ? `?${queryOf(filter)}` : '';
      const [reportRows, dashboard] = await Promise.all([
        api<ReportRow[]>(`/dashboard/report${query}`),
        api<DashboardSummary>(`/dashboard${query}`),
      ]);
      const resolvedFilter = filter || { year: dashboard.year, departmentId: isAdmin ? '' : ownDepartmentId };
      setRows(reportRows);
      setOverallProgress(dashboard.overallProgress);
      setAppliedFilter(resolvedFilter);
      if (!filter) {
        setYear(String(dashboard.year));
        setDepartmentId(resolvedFilter.departmentId);
      }
    } catch (error) {
      setRows([]);
      setOverallProgress(0);
      setError(messageOf(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadReport();
  }, []);

  const summary = useMemo(() => {
    const completed = rows.filter(row => row.status === 'COMPLETED').length;
    const attention = rows.filter(row => row.status === 'AT_RISK' || row.status === 'OVERDUE').length;
    const lastReportedAt = rows.reduce<Date | null>((latest, row) => {
      if (!row.lastReportedAt) return latest;
      const date = new Date(row.lastReportedAt);
      return !latest || date > latest ? date : latest;
    }, null);
    return { completed, attention, lastReportedAt };
  }, [rows]);

  const appliedDepartment = departments.find(item => item.id === appliedFilter.departmentId)
    || (!isAdmin ? user?.department : null);
  const scopeName = appliedDepartment?.name || (isAdmin ? 'Toàn hệ thống' : 'Phòng ban của bạn');
  const selectedYear = Number(year);
  const yearIsValid = Number.isInteger(selectedYear) && selectedYear >= 2000 && selectedYear <= 2100;
  const filtersDirty = !yearIsValid || selectedYear !== appliedFilter.year || (isAdmin ? departmentId : ownDepartmentId) !== appliedFilter.departmentId;
  const completedRate = rows.length ? Math.round(summary.completed / rows.length * 100) : 0;

  async function exportExcel() {
    setExporting(true);
    setError('');
    const fileName = `Bao_cao_chi_tieu_${appliedDepartment?.code || 'toan-he-thong'}_${appliedFilter.year}.xlsx`;
    try {
      const blob = await downloadApi(`/exports/targets.xlsx?${queryOf(appliedFilter)}`);
      saveBlob(blob, fileName);
      toast.ok('Đã tạo tệp báo cáo Excel', fileName);
    } catch (error) {
      const message = messageOf(error);
      setError(message);
      toast.error('Không xuất được báo cáo Excel', message);
    } finally {
      setExporting(false);
    }
  }

  const cards = [
    { label: 'Tổng chỉ tiêu', value: String(rows.length), meta: `Kế hoạch năm ${appliedFilter.year} · ${scopeName}`, icon: FileBarChart, tone: 'teal' },
    { label: 'Tiến độ theo trọng số', value: `${overallProgress}%`, meta: 'Tổng hợp theo trọng số đã cấu hình cho từng chỉ tiêu', icon: TrendingUp, tone: 'blue' },
    { label: 'Hoàn thành', value: String(summary.completed), meta: `${completedRate}% tổng chỉ tiêu`, icon: CheckCircle2, tone: 'green' },
    { label: 'Cần tập trung', value: String(summary.attention), meta: 'Chỉ tiêu có rủi ro hoặc đã quá hạn', icon: AlertTriangle, tone: 'orange' },
  ];

  return <>
    <PageHead
      eyebrow="BÁO CÁO ĐIỀU HÀNH"
      title="Báo cáo thực hiện chỉ tiêu"
      description={`Dữ liệu đã được duyệt trong phạm vi ${scopeName}, kế hoạch năm ${appliedFilter.year}.`}
      actions={<>
        <button className="btn secondary" onClick={() => window.print()} disabled={loading || filtersDirty} title={filtersDirty ? 'Hãy áp dụng bộ lọc trước khi in' : undefined}><Printer />In báo cáo</button>
        <button className="btn primary" onClick={exportExcel} disabled={loading || exporting || filtersDirty} title={filtersDirty ? 'Hãy áp dụng bộ lọc trước khi xuất Excel' : undefined}><Download />{exporting ? 'Đang tạo Excel...' : 'Xuất báo cáo Excel'}</button>
      </>}
    />

    {/* Thanh công cụ lọc: năm, phạm vi phòng ban, nút áp dụng và mốc dữ liệu. */}
    <section className="report-filters" aria-label="Bộ lọc báo cáo">
      <div className="field">
        <label htmlFor="report-year">Năm báo cáo</label>
        <input id="report-year" aria-invalid={!yearIsValid || undefined} type="number" min="2000" max="2100" value={year} onChange={event => setYear(event.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="report-department">Phạm vi phòng ban</label>
        {isAdmin
          ? <select id="report-department" value={departmentId} onChange={event => setDepartmentId(event.target.value)}><option value="">Toàn hệ thống</option>{departments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          : <select id="report-department" value={ownDepartmentId} disabled><option value={ownDepartmentId}>{user?.department?.name || 'Chưa được gắn phòng ban'}</option></select>}
      </div>
      <button className="btn secondary" onClick={() => loadReport({ year: selectedYear, departmentId: isAdmin ? departmentId : ownDepartmentId })} disabled={loading || !yearIsValid}><Filter />{loading ? 'Đang tải...' : 'Áp dụng'}</button>
      <span className={`report-date${filtersDirty ? ' pending' : ''}`} role="status">
        <CalendarClock aria-hidden="true" />
        {filtersDirty ? 'Bộ lọc vừa đổi chưa được áp dụng' : summary.lastReportedAt ? `Dữ liệu cập nhật gần nhất ${summary.lastReportedAt.toLocaleString('vi-VN')}` : 'Chưa có lần báo cáo chính thức'}
      </span>
    </section>

    {error && <div className="form-error load-error" role="alert">
      <span>{error}</span>
      <button type="button" className="btn sm secondary" disabled={loading} onClick={() => void loadReport(appliedFilter)}>Thử lại</button>
    </div>}

    <div className="stat-grid">{cards.map(({ label, value, meta, icon: Icon, tone }) => <div className="stat-card" key={label}>
      <div className={`stat-icon ${tone}`} aria-hidden="true"><Icon /></div>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{meta}</p>
    </div>)}</div>

    {loading ? <SkeletonTable rows={8} /> : <section className="panel flush report-table" aria-label="Bảng kết quả thực hiện chỉ tiêu">
      {rows.length ? <>
        <div className="table-wrap tall"><table className="stack-table">
          <thead><tr><th className="index">STT</th><th>Chỉ tiêu</th><th>Đơn vị phụ trách</th><th className="number">Mục tiêu</th><th className="number">Thực hiện</th><th>Tiến độ</th><th>Đánh giá</th><th>Cập nhật gần nhất</th></tr></thead>
          <tbody>{rows.map((row, index) => <tr key={`${row.code}-${row.department}`}>
            <td className="index no-label">{index + 1}</td>
            <td data-label="Chỉ tiêu"><div className="cell-target"><span className="code">{row.code}</span><strong>{row.title}</strong></div></td>
            <td data-label="Đơn vị phụ trách">{row.department}</td>
            <td className="number" data-label="Mục tiêu">{row.target.toLocaleString('vi-VN')} {row.unit}</td>
            <td className="number" data-label="Thực hiện"><b>{row.current.toLocaleString('vi-VN')}</b> {row.unit}</td>
            <td data-label="Tiến độ"><div className="report-progress">
              <div className="progress"><i className={statusMeta[row.status]?.color || ''} style={{ width: `${Math.max(0, Math.min(100, row.progress))}%` }} /></div>
              <b>{row.progress}%</b>
            </div></td>
            <td data-label="Đánh giá"><span className={`status ${statusMeta[row.status]?.color || 'slate'}`}>{statusMeta[row.status]?.label || row.status}</span></td>
            <td data-label="Cập nhật gần nhất">{row.lastReportedAt
              ? <time dateTime={row.lastReportedAt}>{new Date(row.lastReportedAt).toLocaleString('vi-VN')}</time>
              : <span className="status neutral">Chưa báo cáo</span>}</td>
          </tr>)}</tbody>
        </table></div>
        <div className="table-summary"><span>Đang hiển thị <b>{rows.length}</b> chỉ tiêu</span><span>Phạm vi {scopeName} · Năm {appliedFilter.year}</span></div>
      </> : <Empty title="Chưa có dữ liệu báo cáo" description="Không có chỉ tiêu trong năm và phạm vi đã chọn." />}
    </section>}
  </>;
}
