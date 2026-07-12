import {
  CheckCircle2,
  Download,
  Eye,
  FileSpreadsheet,
  History,
  Info,
  Rows3,
  Save,
  ShieldCheck,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import { DragEvent, useEffect, useRef, useState } from 'react';
import { api, auth, downloadApi } from '../api';
import { PageHead, Spinner } from '../components/UI';
import type { Department } from '../types';

type RowError = { row: number; code: string; field?: string; message: string };
type PreviewChange = {
  row: number;
  targetId: string;
  code: string;
  departmentId: string;
  baseVersion: number;
  oldValue: number;
  newValue: number;
  note?: string | null;
};
type ImportBatch = {
  id: string;
  fileName: string;
  totalRows: number;
  successRows: number;
  errorRows: number;
  errors?: RowError[] | null;
  changes?: PreviewChange[] | null;
  createdBy: string;
  departmentId?: string | null;
  department?: Pick<Department, 'id' | 'code' | 'name'> | null;
  status: 'PREVIEWED' | 'APPLIED' | 'FAILED';
  appliedAt?: string | null;
  createdAt: string;
};
type PreviewResult = ImportBatch & {
  summary: { totalRows: number; changedRows: number; unchangedRows: number; errorRows: number };
  canApply: boolean;
};
type ApplyResult = ImportBatch & {
  reviewStatus?: 'PENDING' | 'APPROVED';
  idempotent: boolean;
};

const currentYear = new Date().getFullYear();
const yearOptions = [currentYear + 1, currentYear, currentYear - 1];

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

function statusMeta(status: ImportBatch['status']) {
  if (status === 'APPLIED') return { label: 'Đã áp dụng', tone: 'green' };
  if (status === 'FAILED') return { label: 'Không thành công', tone: 'red' };
  return { label: 'Đã xem trước', tone: 'amber' };
}

export default function Imports() {
  const user = auth.user;
  const isAdmin = user?.role === 'ADMIN';
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentId, setDepartmentId] = useState(isAdmin ? '' : user?.departmentId || '');
  const [year, setYear] = useState(currentYear);
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [applied, setApplied] = useState<ApplyResult | null>(null);
  const [history, setHistory] = useState<ImportBatch[]>([]);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isAdmin) return;
    api<Department[]>('/departments')
      .then(items => {
        const active = items.filter(item => item.isActive);
        setDepartments(active);
        setDepartmentId(current => current || active[0]?.id || '');
      })
      .catch(error => setError(messageOf(error)));
  }, [isAdmin]);

  async function loadHistory(scopeDepartmentId = departmentId) {
    if (isAdmin && !scopeDepartmentId) {
      setHistory([]);
      setHistoryLoading(false);
      return;
    }
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams();
      if (scopeDepartmentId) params.set('departmentId', scopeDepartmentId);
      setHistory(await api<ImportBatch[]>(`/imports${params.size ? `?${params}` : ''}`));
    } catch (error) {
      setError(messageOf(error));
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    setFile(null);
    setPreview(null);
    setApplied(null);
    setError('');
    void loadHistory(departmentId);
  }, [departmentId, year]);

  function query(selectedYear = year, selectedDepartmentId = departmentId) {
    const params = new URLSearchParams({ year: String(selectedYear) });
    if (selectedDepartmentId) params.set('departmentId', selectedDepartmentId);
    return params.toString();
  }

  function pick(files: FileList | null) {
    const selected = files?.[0];
    setPreview(null);
    setApplied(null);
    setError('');
    if (!selected) return;
    if (!selected.name.toLowerCase().endsWith('.xlsx')) {
      setFile(null);
      setError('Chỉ hỗ trợ file Excel định dạng .xlsx');
      return;
    }
    if (selected.size > 5 * 1024 * 1024) {
      setFile(null);
      setError('File Excel vượt quá dung lượng tối đa 5MB');
      return;
    }
    setFile(selected);
  }

  async function downloadTemplate() {
    if (isAdmin && !departmentId) {
      setError('Vui lòng chọn phòng ban trước khi tải biểu mẫu');
      return;
    }
    setDownloading(true);
    setError('');
    try {
      const blob = await downloadApi(`/imports/template?${query()}`);
      const department = departments.find(item => item.id === departmentId) || user?.department;
      saveBlob(blob, `Phieu_cap_nhat_${department?.code || 'phong-ban'}_${year}.xlsx`);
    } catch (error) {
      setError(messageOf(error));
    } finally {
      setDownloading(false);
    }
  }

  async function previewFile() {
    if (!file) return;
    setPreviewing(true);
    setError('');
    setApplied(null);
    const body = new FormData();
    body.append('file', file);
    try {
      const result = await api<PreviewResult>('/imports/targets/preview', { method: 'POST', body });
      setPreview(result);
      await loadHistory();
    } catch (error) {
      setPreview(null);
      setError(messageOf(error));
    } finally {
      setPreviewing(false);
    }
  }

  async function applyPreview() {
    if (!preview?.canApply || preview.status === 'APPLIED') return;
    setApplying(true);
    setError('');
    try {
      const result = await api<ApplyResult>(`/imports/${preview.id}/apply`, { method: 'POST' });
      setApplied(result);
      setPreview(current => current ? { ...current, status: 'APPLIED', canApply: false, appliedAt: result.appliedAt } : current);
      await loadHistory();
    } catch (error) {
      setError(messageOf(error));
    } finally {
      setApplying(false);
    }
  }

  const selectedDepartment = departments.find(item => item.id === departmentId) || user?.department;
  const requiresApproval = user?.role !== 'ADMIN';

  return <>
    <PageHead
      eyebrow="BÁO CÁO DỮ LIỆU · EXCEL AN TOÀN"
      title="Cập nhật kết quả bằng Excel"
      description="Tải phiếu có dữ liệu hiện tại, chỉ điền giá trị mới và xem trước toàn bộ thay đổi trước khi ghi nhận."
      actions={<button className="btn secondary" onClick={downloadTemplate} disabled={downloading || (isAdmin && !departmentId)}>
        <Download />{downloading ? 'Đang tạo biểu mẫu...' : 'Tải phiếu hiện trạng'}
      </button>}
    />

    <div className="report-filters">
      <div><label>Năm báo cáo</label><select value={year} onChange={event => setYear(Number(event.target.value))}>{yearOptions.map(item => <option key={item}>{item}</option>)}</select></div>
      <div><label>Phạm vi phòng ban</label>{isAdmin
        ? <select value={departmentId} onChange={event => setDepartmentId(event.target.value)}><option value="">Chọn phòng ban</option>{departments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        : <select value={departmentId} disabled><option value={departmentId}>{user?.department?.name || 'Chưa được gắn phòng ban'}</option></select>}
      </div>
      <span className="report-date">Biểu mẫu chỉ dùng cho {selectedDepartment?.name || 'phòng ban đã chọn'}</span>
    </div>

    {error && <div className="form-error">{error}</div>}

    <div className="import-layout">
      <section className="panel import-panel">
        <div className="step-title"><span>1</span><div><h3>Tải lên phiếu đã điền</h3><p>Chỉ nhận .xlsx · Tối đa 5MB · Bước này chưa ghi dữ liệu</p></div></div>
        <div
          className={`dropzone ${drag ? 'drag' : ''}`}
          onDragOver={(event: DragEvent) => { event.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(event: DragEvent) => { event.preventDefault(); setDrag(false); pick(event.dataTransfer.files); }}
          onClick={() => input.current?.click()}
        >
          <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={event => pick(event.target.files)} />
          <div className="upload-icon"><UploadCloud /></div>
          {file
            ? <><strong>{file.name}</strong><span>{(file.size / 1024).toFixed(1)} KB · Nhấn để chọn file khác</span></>
            : <><strong>Kéo thả phiếu Excel vào đây</strong><span>hoặc <b>chọn file .xlsx từ máy tính</b></span></>}
        </div>
        {file && <button className="btn primary import-button" onClick={previewFile} disabled={previewing}>
          <Eye />{previewing ? 'Đang kiểm tra toàn bộ file...' : 'Xem trước thay đổi (chưa ghi dữ liệu)'}
        </button>}
      </section>

      <aside className="panel guide-panel">
        <div className="step-title"><span>2</span><div><h3>Chỉ sửa hai cột màu vàng</h3><p>Các cột còn lại là dữ liệu khóa để chống ghi nhầm</p></div></div>
        <div className="guide-list">
          <div><b>Giá trị mới</b><span>Nhập số thực hiện mới; để trống nghĩa là không thay đổi</span></div>
          <div><b>Ghi chú</b><span>Nguồn số liệu, kết quả hoặc vấn đề cần lưu ý</span></div>
          <div><b>Mã và phiên bản</b><span>Không chỉnh sửa; hệ thống dùng để phát hiện xung đột</span></div>
          <div><b>Giá trị hiện tại</b><span>Được khóa và dùng làm mốc so sánh khi xem trước</span></div>
        </div>
        <div className="info-box"><Info /><p>{requiresApproval
          ? 'Cán bộ hoặc lãnh đạo đơn vị gửi file sẽ tạo báo cáo chờ duyệt; người gửi không thể tự duyệt số liệu của mình.'
          : 'Quản trị viên áp dụng file sẽ cập nhật số liệu chính thức ngay sau khi hệ thống kiểm tra lại phiên bản.'}</p></div>
      </aside>
    </div>

    {preview && <section className="panel history-panel">
      <div className="panel-head"><div><h3><ShieldCheck /> Kết quả xem trước</h3><p>Hệ thống chưa ghi dữ liệu ở bước này. Hãy kiểm tra kỹ các dòng bên dưới.</p></div></div>
      <div className="mini-stat-grid">
        <div><span><Rows3 /></span><p>Tổng dòng<strong>{preview.summary.totalRows}</strong></p></div>
        <div><span><CheckCircle2 /></span><p>Có thay đổi<strong>{preview.summary.changedRows}</strong></p></div>
        <div><span><FileSpreadsheet /></span><p>Không thay đổi<strong>{preview.summary.unchangedRows}</strong></p></div>
        <div><span><XCircle /></span><p>Dòng lỗi<strong>{preview.summary.errorRows}</strong></p></div>
      </div>

      {Boolean(preview.changes?.length) && <div className="table-wrap"><table><thead><tr><th>Dòng</th><th>Chỉ tiêu</th><th className="number">Hiện tại</th><th className="number">Đề xuất</th><th>Ghi chú</th></tr></thead><tbody>{preview.changes!.map(change => <tr key={`${change.targetId}-${change.row}`}><td>{change.row}</td><td><span className="code">{change.code}</span></td><td className="number">{change.oldValue.toLocaleString('vi-VN')}</td><td className="number"><b>{change.newValue.toLocaleString('vi-VN')}</b></td><td>{change.note || '—'}</td></tr>)}</tbody></table></div>}

      {Boolean(preview.errors?.length) && <><div className="panel-head"><div><h3><XCircle /> Các lỗi cần sửa</h3><p>Tải lại file sau khi sửa; hệ thống không áp dụng một phần file có lỗi.</p></div></div><div className="table-wrap"><table><thead><tr><th>Dòng</th><th>Cột</th><th>Mã lỗi</th><th>Nội dung</th></tr></thead><tbody>{preview.errors!.map((item, index) => <tr key={`${item.row}-${item.code}-${index}`}><td>{item.row}</td><td>{item.field || '—'}</td><td><span className="code">{item.code}</span></td><td>{item.message}</td></tr>)}</tbody></table></div></>}

      <div className="modal-actions">
        <button className="btn secondary" onClick={() => { setPreview(null); setApplied(null); }} disabled={applying}>Chọn file khác</button>
        <button className="btn primary" onClick={applyPreview} disabled={!preview.canApply || applying || preview.status === 'APPLIED'}>
          <Save />{applying ? 'Đang kiểm tra và áp dụng...' : requiresApproval ? 'Gửi các thay đổi để duyệt' : 'Xác nhận áp dụng các thay đổi'}
        </button>
      </div>
      {!preview.canApply && preview.status !== 'APPLIED' && <div className="info-box"><Info /><p>Chưa thể áp dụng: file phải có ít nhất một thay đổi và không còn dòng lỗi.</p></div>}
      {applied && <div className="import-result"><CheckCircle2 /><div><strong>{(applied.reviewStatus || (requiresApproval ? 'PENDING' : 'APPROVED')) === 'PENDING' ? 'Đã gửi báo cáo chờ duyệt' : 'Đã cập nhật dữ liệu chính thức'}</strong><p>{preview.summary.changedRows} dòng đã được ghi nhận{applied.idempotent ? ' · Yêu cầu trùng được xử lý an toàn' : ''}</p></div></div>}
    </section>}

    <section className="panel history-panel">
      <div className="panel-head"><div><h3><History /> Lịch sử xử lý Excel</h3><p>Các lần xem trước và áp dụng gần nhất trong phạm vi hiện tại</p></div></div>
      {historyLoading ? <Spinner /> : <div className="table-wrap"><table><thead><tr><th>Tên file</th><th>Người thực hiện</th><th>Phòng ban</th><th>Thời gian</th><th>Tổng dòng</th><th>Thay đổi / lỗi</th><th>Trạng thái</th></tr></thead><tbody>{history.length ? history.map(item => { const meta = statusMeta(item.status); return <tr key={item.id}><td><div className="file-cell"><FileSpreadsheet /><strong>{item.fileName}</strong></div></td><td>{item.createdBy}</td><td>{item.department?.name || 'Toàn hệ thống'}</td><td>{new Date(item.createdAt).toLocaleString('vi-VN')}</td><td>{item.totalRows}</td><td>{item.successRows} thay đổi{item.errorRows ? ` · ${item.errorRows} lỗi` : ''}</td><td><span className={`status ${meta.tone}`}><i />{meta.label}</span></td></tr>; }) : <tr><td colSpan={7} className="center muted">Chưa có lịch sử xử lý Excel trong phạm vi này</td></tr>}</tbody></table></div>}
    </section>
  </>;
}
