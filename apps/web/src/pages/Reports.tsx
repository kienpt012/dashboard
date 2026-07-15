import { Download, FileBarChart, Filter, Printer, TrendingUp } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api, auth, downloadApi } from '../api';
import { Empty, PageHead, Spinner } from '../components/UI';
import { currentVietnamYear } from '../date';
import type { Department } from '../types';
import { statusMeta } from '../types';

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
  const [year, setYear] = useState(currentYear);
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
        setYear(dashboard.year);
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

  const yearOptions = useMemo(() => Array.from({ length: 101 }, (_, index) => 2100 - index), []);

  const appliedDepartment = departments.find(item => item.id === appliedFilter.departmentId)
    || (!isAdmin ? user?.department : null);
  const scopeName = appliedDepartment?.name || (isAdmin ? 'Toàn hệ thống' : 'Phòng ban của bạn');

  async function exportExcel() {
    setExporting(true);
    setError('');
    try {
      const blob = await downloadApi(`/exports/targets.xlsx?${queryOf(appliedFilter)}`);
      saveBlob(blob, `Bao_cao_chi_tieu_${appliedDepartment?.code || 'toan-he-thong'}_${appliedFilter.year}.xlsx`);
    } catch (error) {
      setError(messageOf(error));
    } finally {
      setExporting(false);
    }
  }

  return <>
    <PageHead
      eyebrow="BÁO CÁO ĐIỀU HÀNH"
      title="Báo cáo thực hiện chỉ tiêu"
      description={`Dữ liệu đã được duyệt trong phạm vi ${scopeName}, kế hoạch năm ${appliedFilter.year}.`}
      actions={<>
        <button className="btn secondary" onClick={() => window.print()} disabled={loading}><Printer />In báo cáo</button>
        <button className="btn primary" onClick={exportExcel} disabled={loading || exporting}><Download />{exporting ? 'Đang tạo Excel...' : 'Xuất báo cáo Excel'}</button>
      </>}
    />

    <div className="report-filters">
      <div><label htmlFor="report-year">Năm báo cáo</label><select id="report-year" value={year} onChange={event => setYear(Number(event.target.value))}>{yearOptions.map(item => <option key={item}>{item}</option>)}</select></div>
      <div><label htmlFor="report-department">Phạm vi phòng ban</label>{isAdmin
        ? <select id="report-department" value={departmentId} onChange={event => setDepartmentId(event.target.value)}><option value="">Toàn hệ thống</option>{departments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        : <select id="report-department" value={ownDepartmentId} disabled><option value={ownDepartmentId}>{user?.department?.name || 'Chưa được gắn phòng ban'}</option></select>}
      </div>
      <button className="btn secondary" onClick={() => loadReport({ year, departmentId: isAdmin ? departmentId : ownDepartmentId })} disabled={loading}><Filter />{loading ? 'Đang tải...' : 'Áp dụng'}</button>
      <span className="report-date">{summary.lastReportedAt ? `Dữ liệu cập nhật gần nhất ${summary.lastReportedAt.toLocaleString('vi-VN')}` : 'Chưa có lần báo cáo chính thức'}</span>
    </div>

    {error && <div className="form-error" role="alert">{error}</div>}

    <div className="report-summary">
      <div><FileBarChart /><span>Tổng chỉ tiêu<strong>{rows.length}</strong></span></div>
      <div title="Tổng hợp theo trọng số đã cấu hình cho từng chỉ tiêu"><TrendingUp /><span>Tiến độ theo trọng số<strong>{overallProgress}%</strong></span></div>
      <div><i className="dot green" /><span>Hoàn thành<strong>{summary.completed}</strong></span></div>
      <div><i className="dot amber" /><span>Cần tập trung<strong>{summary.attention}</strong></span></div>
    </div>

    <div className="table-card report-table">
      {loading ? <Spinner /> : rows.length ? <div className="table-wrap"><table><thead><tr><th>STT</th><th>Chỉ tiêu</th><th>Đơn vị phụ trách</th><th className="number">Mục tiêu</th><th className="number">Thực hiện</th><th>Tiến độ</th><th>Đánh giá</th><th>Cập nhật gần nhất</th></tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.code}-${row.department}`}><td>{index + 1}</td><td><span className="code">{row.code}</span><strong className="block">{row.title}</strong></td><td>{row.department}</td><td className="number">{row.target.toLocaleString('vi-VN')} {row.unit}</td><td className="number"><b>{row.current.toLocaleString('vi-VN')}</b> {row.unit}</td><td><div className="report-progress"><div className="progress"><i style={{ width: `${Math.max(0, Math.min(100, row.progress))}%` }} /></div><b>{row.progress}%</b></div></td><td><span className={`status ${statusMeta[row.status]?.color || 'slate'}`}><i />{statusMeta[row.status]?.label || row.status}</span></td><td>{row.lastReportedAt ? new Date(row.lastReportedAt).toLocaleString('vi-VN') : <span className="muted">Chưa báo cáo</span>}</td></tr>)}</tbody></table></div> : <Empty title="Chưa có dữ liệu báo cáo" description="Không có chỉ tiêu trong năm và phạm vi đã chọn." />}
    </div>
  </>;
}
