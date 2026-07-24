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
import { DragEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { api, auth, downloadApi } from '../api';
import { Modal, PageHead, Spinner } from '../components/UI';
import { currentVietnamYear } from '../date';
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
  status: 'PREVIEWED' | 'SUBMITTED' | 'PARTIALLY_REVIEWED' | 'PARTIALLY_APPROVED' | 'APPROVED' | 'REJECTED' | 'APPLIED' | 'FAILED';
  submittedAt?: string | null;
  appliedAt?: string | null;
  createdAt: string;
  reviewCounts?: { pending: number; approved: number; rejected: number };
};
type ImportBatchDetail = ImportBatch & { updates: Array<{
  id:string;value:number;note?:string|null;reviewStatus:'PENDING'|'APPROVED'|'REJECTED';reviewNote?:string|null;createdAt:string;reviewedAt?:string|null;
  target:{id:string;code:string;title:string;unit:string};user:{id:string;username:string;fullName:string};reviewer?:{id:string;username:string;fullName:string}|null;
}> };
type PreviewResult = ImportBatch & {
  summary: { totalRows: number; changedRows: number; unchangedRows: number; errorRows: number };
  canApply: boolean;
};
type ApplyResult = ImportBatch & {
  reviewStatus?: 'PENDING' | 'APPROVED';
  idempotent: boolean;
};

const currentYear = currentVietnamYear();
const yearOptions = Array.from({ length: 101 }, (_, index) => 2100 - index);

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
  if (status === 'APPLIED') return { label: 'Đã áp dụng trực tiếp', tone: 'green' };
  if (status === 'SUBMITTED') return { label: 'Đã gửi chờ duyệt', tone: 'amber' };
  if (status === 'PARTIALLY_REVIEWED') return { label: 'Đang duyệt một phần', tone: 'blue' };
  if (status === 'PARTIALLY_APPROVED') return { label: 'Đã duyệt một phần', tone: 'amber' };
  if (status === 'APPROVED') return { label: 'Đã duyệt toàn bộ', tone: 'green' };
  if (status === 'REJECTED') return { label: 'Đã từ chối toàn bộ', tone: 'red' };
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
  const [detail, setDetail] = useState<ImportBatchDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const historyRequestId = useRef(0);
  const detailRequestId = useRef(0);
  const previewRequestId = useRef(0);
  const canOperateOnSelectedDepartment = !isAdmin || departments.some(item => item.id === departmentId && item.isActive);

  useEffect(() => {
    if (!isAdmin) return;
    api<Department[]>('/departments')
      .then(items => {
        setDepartments(items);
        setDepartmentId(current => current || items.find(item => item.isActive)?.id || '');
      })
      .catch(error => setError(messageOf(error)));
  }, [isAdmin]);

  async function loadHistory(scopeDepartmentId = departmentId) {
    const requestId = ++historyRequestId.current;
    if (isAdmin && !scopeDepartmentId) {
      setHistory([]);
      setHistoryLoading(false);
      return;
    }
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams();
      if (scopeDepartmentId) params.set('departmentId', scopeDepartmentId);
      const result = await api<ImportBatch[]>(`/imports${params.size ? `?${params}` : ''}`);
      if (requestId === historyRequestId.current) setHistory(result);
    } catch (error) {
      if (requestId === historyRequestId.current) setError(messageOf(error));
    } finally {
      if (requestId === historyRequestId.current) setHistoryLoading(false);
    }
  }

  useEffect(() => {
    previewRequestId.current += 1;
    detailRequestId.current += 1;
    setFile(null);
    setPreview(null);
    setApplied(null);
    setDetail(null);
    setPreviewing(false);
    setDetailLoading(false);
    setError('');
  }, [departmentId, year]);

  useEffect(() => {
    void loadHistory(departmentId);
  }, [departmentId]);

  function query(selectedYear = year, selectedDepartmentId = departmentId) {
    const params = new URLSearchParams({ year: String(selectedYear) });
    if (selectedDepartmentId) params.set('departmentId', selectedDepartmentId);
    return params.toString();
  }

  async function openBatch(id:string){
    const requestId=++detailRequestId.current;
    setDetail(null);
    setDetailLoading(true);setError('');
    try{
      const result=await api<ImportBatchDetail>(`/imports/batch/${id}`);
      if(requestId===detailRequestId.current)setDetail(result);
    }
    catch(reason){if(requestId===detailRequestId.current)setError(messageOf(reason))}
    finally{if(requestId===detailRequestId.current)setDetailLoading(false)}
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

  function openFilePicker(){
    if(!input.current||!canOperateOnSelectedDepartment)return;
    input.current.value='';
    input.current.click();
  }

  function handleDropzoneKey(event:KeyboardEvent<HTMLDivElement>){
    if(!canOperateOnSelectedDepartment)return;
    if(event.key!=='Enter'&&event.key!==' ')return;
    event.preventDefault();
    openFilePicker();
  }

  async function downloadTemplate() {
    if (isAdmin && !departmentId) {
      setError('Vui lòng chọn phòng ban trước khi tải biểu mẫu');
      return;
    }
    const department = departments.find(item => item.id === departmentId) || user?.department;
    if (isAdmin && !department?.isActive) {
      setError('Phòng ban đã ngừng hoạt động chỉ được xem lịch sử, không thể tạo phiếu báo cáo mới.');
      return;
    }
    setDownloading(true);
    setError('');
    try {
      const blob = await downloadApi(`/imports/template?${query()}`);
      saveBlob(blob, `Phieu_cap_nhat_${department?.code || 'phong-ban'}_${year}.xlsx`);
    } catch (error) {
      setError(messageOf(error));
    } finally {
      setDownloading(false);
    }
  }

  async function previewFile() {
    if (!file || !canOperateOnSelectedDepartment) return;
    const requestId=++previewRequestId.current;
    const scopeDepartmentId=departmentId;
    setPreviewing(true);
    setError('');
    setApplied(null);
    const body = new FormData();
    body.append('file', file);
    try {
      const result = await api<PreviewResult>('/imports/targets/preview', { method: 'POST', body });
      if(requestId!==previewRequestId.current)return;
      setPreview(result);
      await loadHistory(scopeDepartmentId);
    } catch (error) {
      if(requestId===previewRequestId.current){
        setPreview(null);
        setError(messageOf(error));
      }
    } finally {
      if(requestId===previewRequestId.current)setPreviewing(false);
    }
  }

  async function applyPreview() {
    const scopeMismatch = Boolean(isAdmin && preview?.departmentId !== departmentId);
    if (!preview?.canApply || preview.status !== 'PREVIEWED' || scopeMismatch) return;
    setApplying(true);
    setError('');
    try {
      const result = await api<ApplyResult>(`/imports/${preview.id}/apply`, { method: 'POST' });
      setApplied(result);
      setPreview(current => current ? { ...current, status: result.status, canApply: false, submittedAt: result.submittedAt, appliedAt: result.appliedAt } : current);
      await loadHistory();
    } catch (error) {
      setError(messageOf(error));
    } finally {
      setApplying(false);
    }
  }

  const selectedDepartment = departments.find(item => item.id === departmentId) || user?.department;
  const requiresApproval = user?.role !== 'ADMIN';
  const canChooseFile = canOperateOnSelectedDepartment;
  const previewScopeMismatch = Boolean(isAdmin && preview && preview.departmentId !== departmentId);

  return <>
    <PageHead
      eyebrow="NHẬP DỮ LIỆU BÁO CÁO"
      title="Cập nhật kết quả bằng Excel"
      description="Tải phiếu có dữ liệu hiện tại, chỉ điền giá trị mới và xem trước toàn bộ thay đổi trước khi ghi nhận."
      actions={<button className="btn secondary" onClick={downloadTemplate} disabled={downloading || (isAdmin && (!departmentId || !selectedDepartment?.isActive))}>
        <Download />{downloading ? 'Đang tạo biểu mẫu...' : 'Tải phiếu hiện trạng'}
      </button>}
    />

    <div className="report-filters">
      <div><label htmlFor="import-year">Năm báo cáo</label><select id="import-year" disabled={previewing||applying||downloading} value={year} onChange={event => setYear(Number(event.target.value))}>{yearOptions.map(item => <option key={item}>{item}</option>)}</select></div>
      <div><label htmlFor="import-department">Phạm vi phòng ban</label>{isAdmin
        ? <select id="import-department" disabled={previewing||applying||downloading} value={departmentId} onChange={event => setDepartmentId(event.target.value)}><option value="">Chọn phòng ban</option>{departments.map(item => <option key={item.id} value={item.id}>{item.name}{item.isActive?'':' (đã ngừng)'}</option>)}</select>
        : <select id="import-department" value={departmentId} disabled><option value={departmentId}>{user?.department?.name || 'Chưa được gắn phòng ban'}</option></select>}
      </div>
      <span className="report-date">Biểu mẫu chỉ dùng cho {selectedDepartment?.name || 'phòng ban đã chọn'}</span>
    </div>

    {error && <div className="form-error" role="alert">{error}</div>}

    <div className="import-layout">
      <section className="panel import-panel">
        <div className="step-title"><span>1</span><div><h3>Tải lên phiếu đã điền</h3><p>Chỉ nhận .xlsx · Tối đa 5MB · Bước này chưa ghi dữ liệu</p></div></div>
        <div
          className={`dropzone ${drag ? 'drag' : ''} ${canChooseFile ? '' : 'disabled'}`}
          role="button"
          tabIndex={canChooseFile?0:-1}
          aria-disabled={!canChooseFile}
          aria-label={!canChooseFile?'Chọn phòng ban trước khi tải file Excel':file?`Đã chọn ${file.name}. Nhấn Enter để chọn lại file Excel.`:'Chọn file Excel để tải lên'}
          onDragOver={(event: DragEvent) => { event.preventDefault(); if(canChooseFile)setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(event: DragEvent) => { event.preventDefault(); setDrag(false); if(canChooseFile)pick(event.dataTransfer.files); }}
          onClick={openFilePicker}
          onKeyDown={handleDropzoneKey}
        >
          <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={event => pick(event.target.files)} />
          <div className="upload-icon"><UploadCloud /></div>
          {file
            ? <><strong>{file.name}</strong><span>{(file.size / 1024).toFixed(1)} KB · Nhấn để chọn file khác</span></>
            : canChooseFile
              ? <><strong>Kéo thả phiếu Excel vào đây</strong><span>hoặc <b>chọn file .xlsx từ máy tính</b></span></>
              : <><strong>{selectedDepartment&&!selectedDepartment.isActive?'Phòng ban đã ngừng hoạt động':'Chọn phòng ban trước'}</strong><span>{selectedDepartment&&!selectedDepartment.isActive?'Bạn vẫn có thể xem lịch sử bên dưới nhưng không thể nộp báo cáo mới.':'Phạm vi này được dùng để đối soát file và ngăn ghi nhầm dữ liệu.'}</span></>}
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

      {previewScopeMismatch && <div className="permission-note warning"><ShieldCheck /><div><strong>File không thuộc phòng ban đang chọn</strong><p>File thuộc {preview.department?.name || 'một phạm vi khác'}, trong khi bộ lọc đang chọn {selectedDepartment?.name || 'chưa có phòng ban'}. Hãy chọn đúng phòng ban rồi tải lại file để tránh ghi nhầm dữ liệu.</p></div></div>}

      <div className="modal-actions">
        <button className="btn secondary" onClick={() => { setPreview(null); setApplied(null); }} disabled={applying}>Chọn file khác</button>
        <button className="btn primary" onClick={applyPreview} disabled={!preview.canApply || applying || preview.status !== 'PREVIEWED' || previewScopeMismatch}>
          <Save />{applying ? 'Đang kiểm tra và áp dụng...' : requiresApproval ? 'Gửi các thay đổi để duyệt' : 'Xác nhận áp dụng các thay đổi'}
        </button>
      </div>
      {!preview.canApply && preview.status === 'PREVIEWED' && <div className="info-box"><Info /><p>Chưa thể áp dụng: file phải có ít nhất một thay đổi và không còn dòng lỗi.</p></div>}
      {applied && <div className="import-result"><CheckCircle2 /><div><strong>{(applied.reviewStatus || (requiresApproval ? 'PENDING' : 'APPROVED')) === 'PENDING' ? 'Đã gửi báo cáo chờ duyệt' : 'Đã cập nhật dữ liệu chính thức'}</strong><p>{preview.summary.changedRows} dòng đã được ghi nhận{applied.idempotent ? ' · Yêu cầu đã xử lý trước đó, không tạo thêm dữ liệu' : ''}</p></div></div>}
    </section>}

    <section className="panel history-panel">
      <div className="panel-head"><div><h3><History /> Lịch sử xử lý Excel</h3><p>Theo dõi riêng trạng thái xem trước, chờ duyệt và đã trở thành dữ liệu chính thức</p></div></div>
      {historyLoading ? <Spinner /> : <div className="table-wrap"><table className="action-table"><thead><tr><th>Tên file</th><th>Người thực hiện</th><th>Phòng ban</th><th>Thời gian</th><th>Tổng dòng</th><th>Đối soát duyệt</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{history.length ? history.map(item => { const meta = statusMeta(item.status); const counts=item.reviewCounts; return <tr key={item.id}><td><div className="file-cell"><FileSpreadsheet /><strong>{item.fileName}</strong></div></td><td>{item.createdBy}</td><td>{item.department?.name || 'Toàn hệ thống'}</td><td>{new Date(item.createdAt).toLocaleString('vi-VN')}</td><td>{item.totalRows}</td><td>{counts&&counts.pending+counts.approved+counts.rejected>0?`${counts.approved} duyệt · ${counts.rejected} trả · ${counts.pending} chờ`:`${item.successRows} thay đổi${item.errorRows?` · ${item.errorRows} lỗi`:''}`}</td><td><span className={`status ${meta.tone}`}><i />{meta.label}</span></td><td><button type="button" className="btn secondary compact" disabled={detailLoading} onClick={()=>void openBatch(item.id)}><Eye/>Chi tiết</button></td></tr>; }) : <tr><td colSpan={8} className="center muted">Chưa có lịch sử xử lý Excel trong phạm vi này</td></tr>}</tbody></table></div>}
    </section>
    {detail&&<Modal title={`Đối soát ${detail.fileName}`} onClose={()=>setDetail(null)} wide>
      <div className="table-summary"><span><b>{detail.updates.length}</b> dòng báo cáo · Người tải: {detail.createdBy}</span><span className={`status ${statusMeta(detail.status).tone}`}><i/>{statusMeta(detail.status).label}</span></div>
      <div className="table-wrap"><table><thead><tr><th>Chỉ tiêu</th><th>Người nộp</th><th>Số liệu</th><th>Trạng thái</th><th>Phản hồi duyệt</th></tr></thead><tbody>{detail.updates.length?detail.updates.map(update=><tr key={update.id}><td><span className="code">{update.target.code}</span><strong className="block">{update.target.title}</strong></td><td>{update.user.fullName}</td><td><b>{update.value.toLocaleString('vi-VN')} {update.target.unit}</b>{update.note&&<small className="block muted">{update.note}</small>}</td><td><span className={`status ${update.reviewStatus==='APPROVED'?'green':update.reviewStatus==='REJECTED'?'red':'amber'}`}><i/>{update.reviewStatus==='APPROVED'?'Đã duyệt':update.reviewStatus==='REJECTED'?'Đã trả lại':'Chờ duyệt'}</span></td><td>{update.reviewNote||'—'}{update.reviewer&&<small className="block muted">{update.reviewer.fullName}</small>}</td></tr>):<tr><td colSpan={5} className="center muted">Batch này không tạo dòng báo cáo.</td></tr>}</tbody></table></div>
    </Modal>}
  </>;
}
