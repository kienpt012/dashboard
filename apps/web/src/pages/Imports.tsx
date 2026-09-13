import {
  Check,
  CheckCircle2,
  Download,
  Eye,
  FileSpreadsheet,
  History,
  Info,
  MinusCircle,
  Rows3,
  Save,
  ShieldCheck,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import { DragEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { api, auth, downloadApi } from '../api';
import { Empty, Modal, PageHead, SkeletonTable } from '../components/UI';
import { toast } from '../components/Toast';
import { currentVietnamYear } from '../date';
import type { Department } from '../types';
import '../styles/org.css';

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

/** Một dòng trong bảng đối soát: hoặc là thay đổi sẽ ghi, hoặc là dòng lỗi. */
type PreviewRow =
  | { kind: 'change'; key: string; row: number; change: PreviewChange }
  | { kind: 'error'; key: string; row: number; error: RowError };

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
      .catch(error => {
        setError(messageOf(error));
        toast.error('Không tải được danh sách phòng ban', messageOf(error));
      });
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
      if (requestId === historyRequestId.current) {
        setError(messageOf(error));
        toast.error('Không tải được lịch sử xử lý Excel', messageOf(error));
      }
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
    catch(reason){if(requestId===detailRequestId.current){setError(messageOf(reason));toast.error('Không mở được chi tiết phiếu',messageOf(reason))}}
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
      toast.error('Định dạng tệp không hợp lệ', 'Chỉ hỗ trợ file Excel định dạng .xlsx');
      return;
    }
    if (selected.size > 5 * 1024 * 1024) {
      setFile(null);
      setError('File Excel vượt quá dung lượng tối đa 5MB');
      toast.error('Tệp vượt quá dung lượng cho phép', 'File Excel vượt quá dung lượng tối đa 5MB');
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
      toast.error('Chưa chọn phòng ban', 'Vui lòng chọn phòng ban trước khi tải biểu mẫu');
      return;
    }
    const department = departments.find(item => item.id === departmentId) || user?.department;
    if (isAdmin && !department?.isActive) {
      setError('Phòng ban đã ngừng hoạt động chỉ được xem lịch sử, không thể tạo phiếu báo cáo mới.');
      toast.error('Phòng ban đã ngừng hoạt động', 'Đơn vị này chỉ được xem lịch sử, không thể tạo phiếu báo cáo mới.');
      return;
    }
    setDownloading(true);
    setError('');
    try {
      const blob = await downloadApi(`/imports/template?${query()}`);
      saveBlob(blob, `Phieu_cap_nhat_${department?.code || 'phong-ban'}_${year}.xlsx`);
      toast.ok('Đã tải phiếu hiện trạng', `Phiếu năm ${year} của ${department?.name || 'phòng ban đã chọn'}.`);
    } catch (error) {
      setError(messageOf(error));
      toast.error('Không tạo được phiếu hiện trạng', messageOf(error));
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
      toast.ok(
        'Đã đối soát xong tệp Excel',
        `${result.summary.changedRows} dòng có thay đổi · ${result.summary.errorRows} dòng lỗi. Hệ thống chưa ghi dữ liệu.`,
      );
      await loadHistory(scopeDepartmentId);
    } catch (error) {
      if(requestId===previewRequestId.current){
        setPreview(null);
        setError(messageOf(error));
        toast.error('Không đối soát được tệp Excel', messageOf(error));
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
      toast.ok(
        (result.reviewStatus || (requiresApproval ? 'PENDING' : 'APPROVED')) === 'PENDING'
          ? 'Đã gửi báo cáo chờ duyệt'
          : 'Đã cập nhật dữ liệu chính thức',
        `${preview.summary.changedRows} dòng đã được ghi nhận.`,
      );
      await loadHistory();
    } catch (error) {
      setError(messageOf(error));
      toast.error('Không áp dụng được các thay đổi', messageOf(error));
    } finally {
      setApplying(false);
    }
  }

  const selectedDepartment = departments.find(item => item.id === departmentId) || user?.department;
  const requiresApproval = user?.role !== 'ADMIN';
  const canChooseFile = canOperateOnSelectedDepartment;
  const previewScopeMismatch = Boolean(isAdmin && preview && preview.departmentId !== departmentId);
  const canDownloadTemplate = !(downloading || (isAdmin && (!departmentId || !selectedDepartment?.isActive)));

  /* Trạng thái từng bước của luồng: người dùng nhìn dãy số là biết đang ở đâu. */
  const stepOneClass = file || preview ? 'is-done' : 'is-active';
  const stepTwoClass = preview ? 'is-done' : file ? 'is-active' : '';
  const stepThreeClass = applied ? 'is-done' : preview ? 'is-active' : '';

  /* Gộp dòng thay đổi và dòng lỗi vào một bảng đối soát, sắp theo số dòng của file
     Excel để người dùng dò theo đúng thứ tự trên phiếu giấy. Dữ liệu không đổi. */
  const previewRows: PreviewRow[] = preview
    ? [
        ...(preview.changes || []).map<PreviewRow>(change => ({
          kind: 'change',
          key: `change-${change.targetId}-${change.row}`,
          row: change.row,
          change,
        })),
        ...(preview.errors || []).map<PreviewRow>((item, index) => ({
          kind: 'error',
          key: `error-${item.row}-${item.code}-${index}`,
          row: item.row,
          error: item,
        })),
      ].sort((a, b) => a.row - b.row)
    : [];

  return <>
    <PageHead
      eyebrow="NHẬP DỮ LIỆU BÁO CÁO"
      title="Cập nhật kết quả bằng Excel"
      description="Tải phiếu có dữ liệu hiện tại, chỉ điền giá trị mới và xem trước toàn bộ thay đổi trước khi ghi nhận."
    />

    <div className="org-stack">
      <div className="org-scope">
        <div className="org-scope-field">
          <label htmlFor="import-year">Năm báo cáo</label>
          <select id="import-year" disabled={previewing||applying||downloading} value={year} onChange={event => setYear(Number(event.target.value))}>
            {yearOptions.map(item => <option key={item}>{item}</option>)}
          </select>
        </div>
        <div className="org-scope-field">
          <label htmlFor="import-department">Phạm vi phòng ban</label>
          {isAdmin
            ? <select id="import-department" disabled={previewing||applying||downloading} value={departmentId} onChange={event => setDepartmentId(event.target.value)}><option value="">Chọn phòng ban</option>{departments.map(item => <option key={item.id} value={item.id}>{item.name}{item.isActive?'':' (đã ngừng)'}</option>)}</select>
            : <select id="import-department" value={departmentId} disabled><option value={departmentId}>{user?.department?.name || 'Chưa được gắn phòng ban'}</option></select>}
        </div>
        <span className="org-scope-hint"><Info aria-hidden="true" />Biểu mẫu chỉ dùng cho {selectedDepartment?.name || 'phòng ban đã chọn'}</span>
      </div>

      {error && <div className="form-error" role="alert">{error}</div>}

      <div className="org-flow">
        <section className={`panel org-step ${stepOneClass}`}>
          <div className="org-step-head">
            <span className="org-step-no" aria-hidden="true">{file || preview ? <Check /> : '1'}</span>
            <div>
              <h3>Tải phiếu hiện trạng về máy</h3>
              <p>Phiếu đã có sẵn dữ liệu hiện tại của đơn vị · Chỉ sửa hai cột được đánh dấu</p>
            </div>
          </div>
          <button className="btn secondary block" onClick={downloadTemplate} disabled={!canDownloadTemplate}>
            <Download />{downloading ? 'Đang tạo biểu mẫu...' : 'Tải phiếu hiện trạng'}
          </button>
          <ul className="org-guide">
            <li className="is-editable"><b>Giá trị mới</b><span>Nhập số thực hiện mới; để trống nghĩa là không thay đổi</span></li>
            <li className="is-editable"><b>Ghi chú</b><span>Nguồn số liệu, kết quả hoặc vấn đề cần lưu ý</span></li>
            <li><b>Mã và phiên bản</b><span>Không chỉnh sửa; hệ thống dùng để phát hiện xung đột</span></li>
            <li><b>Giá trị hiện tại</b><span>Được khóa và dùng làm mốc so sánh khi xem trước</span></li>
          </ul>
          <div className="notice org-note"><Info aria-hidden="true" /><div><strong>Quy trình ghi nhận</strong><p>{requiresApproval
            ? 'Cán bộ hoặc lãnh đạo đơn vị gửi file sẽ tạo báo cáo chờ duyệt; người gửi không thể tự duyệt số liệu của mình.'
            : 'Quản trị viên áp dụng file sẽ cập nhật số liệu chính thức ngay sau khi hệ thống kiểm tra lại phiên bản.'}</p></div></div>
        </section>

        <section className={`panel org-step ${stepTwoClass}`}>
          <div className="org-step-head">
            <span className="org-step-no" aria-hidden="true">{preview ? <Check /> : '2'}</span>
            <div>
              <h3>Tải lên phiếu đã điền</h3>
              <p>Chỉ nhận .xlsx · Tối đa 5MB · Bước này chưa ghi dữ liệu</p>
            </div>
          </div>
          <div
            className={`org-drop ${drag ? 'drag' : ''} ${canChooseFile ? '' : 'disabled'} ${file ? 'has-file' : ''}`}
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
            <div className="org-drop-icon" aria-hidden="true">{file ? <FileSpreadsheet /> : <UploadCloud />}</div>
            {file
              ? <><strong>{file.name}</strong><span>{(file.size / 1024).toFixed(1)} KB · Nhấn để chọn file khác</span></>
              : canChooseFile
                ? <><strong>Kéo thả phiếu Excel vào đây</strong><span>hoặc <b>chọn file .xlsx từ máy tính</b></span></>
                : <><strong>{selectedDepartment&&!selectedDepartment.isActive?'Phòng ban đã ngừng hoạt động':'Chọn phòng ban trước'}</strong><span>{selectedDepartment&&!selectedDepartment.isActive?'Bạn vẫn có thể xem lịch sử bên dưới nhưng không thể nộp báo cáo mới.':'Phạm vi này được dùng để đối soát file và ngăn ghi nhầm dữ liệu.'}</span></>}
          </div>
          {file && <button className={`btn primary block ${previewing ? 'loading' : ''}`} onClick={previewFile} disabled={previewing}>
            <Eye />{previewing ? 'Đang kiểm tra toàn bộ file...' : 'Xem trước thay đổi (chưa ghi dữ liệu)'}
          </button>}
        </section>
      </div>

      <section className={`panel org-step ${stepThreeClass}`}>
        <div className="org-step-head">
          <span className="org-step-no" aria-hidden="true">{applied ? <Check /> : '3'}</span>
          <div>
            <h3>Kiểm tra kết quả đối soát rồi xác nhận</h3>
            <p>Hệ thống chưa ghi dữ liệu cho đến khi bạn bấm xác nhận ở cuối bước này</p>
          </div>
        </div>

        {!preview ? <Empty
          title="Chưa có kết quả đối soát"
          description="Hoàn thành bước 1 và bước 2 để hệ thống kiểm tra từng dòng của phiếu Excel và hiển thị kết quả tại đây."
        /> : <>
          <div className="org-metrics">
            <div className="org-metric is-total"><span aria-hidden="true"><Rows3 /></span><div><b>{preview.summary.totalRows}</b><p>Tổng dòng trong phiếu</p></div></div>
            <div className="org-metric is-ok"><span aria-hidden="true"><CheckCircle2 /></span><div><b>{preview.summary.changedRows}</b><p>Dòng sẽ được ghi nhận</p></div></div>
            <div className="org-metric"><span aria-hidden="true"><MinusCircle /></span><div><b>{preview.summary.unchangedRows}</b><p>Dòng bỏ qua vì không đổi</p></div></div>
            <div className={`org-metric is-bad ${preview.summary.errorRows ? '' : 'is-empty'}`}><span aria-hidden="true"><XCircle /></span><div><b>{preview.summary.errorRows}</b><p>Dòng lỗi phải sửa lại</p></div></div>
          </div>

          {previewRows.length ? <div className="panel flush">
            <div className="panel-head"><div><h3>Chi tiết từng dòng</h3><p>Sắp theo số dòng trên file Excel để đối chiếu trực tiếp với phiếu giấy.</p></div></div>
            <div className="table-wrap"><table className="org-cardtable">
              <thead><tr><th>Dòng</th><th>Chỉ tiêu / Cột</th><th className="org-num">Hiện tại</th><th className="org-num">Đề xuất</th><th>Kết quả</th><th>Ghi chú · Lý do</th></tr></thead>
              <tbody>{previewRows.map(item => item.kind === 'change' ? <tr key={item.key} className="org-row is-ok">
                <td data-label="Dòng" className="org-num">{item.row}</td>
                <td data-label="Chỉ tiêu" className="org-cell-lead"><span className="code">{item.change.code}</span></td>
                <td data-label="Hiện tại" className="org-num">{item.change.oldValue.toLocaleString('vi-VN')}</td>
                <td data-label="Đề xuất" className="org-num"><b>{item.change.newValue.toLocaleString('vi-VN')}</b></td>
                <td data-label="Kết quả"><span className="badge ok dot">Sẽ ghi nhận</span></td>
                <td data-label="Ghi chú">{item.change.note || '—'}</td>
              </tr> : <tr key={item.key} className="org-row is-bad">
                <td data-label="Dòng" className="org-num">{item.row}</td>
                <td data-label="Cột" className="org-cell-lead"><span className="code">{item.error.field || item.error.code}</span>{item.error.field && <span className="org-sub">Mã lỗi {item.error.code}</span>}</td>
                <td data-label="Hiện tại" className="org-num">—</td>
                <td data-label="Đề xuất" className="org-num">—</td>
                <td data-label="Kết quả"><span className="badge bad dot">Dòng lỗi</span></td>
                <td data-label="Lý do">{item.error.message}</td>
              </tr>)}</tbody>
            </table></div>
            <div className="org-legend">
              <span><i className="is-ok" aria-hidden="true" />Dòng sẽ được ghi nhận</span>
              <span><i className="is-bad" aria-hidden="true" />Dòng lỗi — phải sửa trong file rồi tải lại</span>
              <span>{preview.summary.unchangedRows} dòng không thay đổi nên không liệt kê ở đây</span>
            </div>
          </div> : <div className="notice org-note"><Info aria-hidden="true" /><div><strong>Phiếu không có dòng nào cần ghi nhận</strong><p>Toàn bộ {preview.summary.totalRows} dòng đều giữ nguyên giá trị hiện tại. Hãy điền cột “Giá trị mới” rồi tải lại phiếu.</p></div></div>}

          {preview.errors?.length ? <div className="notice warn org-note" role="alert"><XCircle aria-hidden="true" /><div><strong>Hệ thống không áp dụng một phần file có lỗi</strong><p>Hãy sửa {preview.summary.errorRows} dòng lỗi ở trên ngay trong file Excel, sau đó tải lại toàn bộ phiếu.</p></div></div> : null}

          {previewScopeMismatch && <div className="notice warn org-note" role="alert"><ShieldCheck aria-hidden="true" /><div><strong>File không thuộc phòng ban đang chọn</strong><p>File thuộc {preview.department?.name || 'một phạm vi khác'}, trong khi bộ lọc đang chọn {selectedDepartment?.name || 'chưa có phòng ban'}. Hãy chọn đúng phòng ban rồi tải lại file để tránh ghi nhầm dữ liệu.</p></div></div>}

          {!preview.canApply && preview.status === 'PREVIEWED' && <div className="notice org-note"><Info aria-hidden="true" /><div><strong>Chưa thể áp dụng</strong><p>File phải có ít nhất một thay đổi và không còn dòng lỗi.</p></div></div>}

          {applied && <div className="form-success org-banner" role="status"><CheckCircle2 aria-hidden="true" /><div><strong>{(applied.reviewStatus || (requiresApproval ? 'PENDING' : 'APPROVED')) === 'PENDING' ? 'Đã gửi báo cáo chờ duyệt' : 'Đã cập nhật dữ liệu chính thức'}</strong><p>{preview.summary.changedRows} dòng đã được ghi nhận{applied.idempotent ? ' · Yêu cầu đã xử lý trước đó, không tạo thêm dữ liệu' : ''}</p></div></div>}

          <div className="modal-actions">
            <button className="btn secondary" onClick={() => { setPreview(null); setApplied(null); }} disabled={applying}>Chọn file khác</button>
            <button className={`btn primary ${applying ? 'loading' : ''}`} onClick={applyPreview} disabled={!preview.canApply || applying || preview.status !== 'PREVIEWED' || previewScopeMismatch}>
              <Save />{applying ? 'Đang kiểm tra và áp dụng...' : requiresApproval ? 'Gửi các thay đổi để duyệt' : 'Xác nhận áp dụng các thay đổi'}
            </button>
          </div>
        </>}
      </section>

      {historyLoading ? <SkeletonTable rows={5} /> : <section className="panel flush">
        <div className="panel-head"><div><h3><History aria-hidden="true" /> Lịch sử xử lý Excel</h3><p>Theo dõi riêng trạng thái xem trước, chờ duyệt và đã trở thành dữ liệu chính thức</p></div></div>
        <div className="table-wrap"><table className="action-table org-cardtable">
          <thead><tr><th>Tên file</th><th>Người thực hiện</th><th>Phòng ban</th><th>Thời gian</th><th className="org-num">Tổng dòng</th><th>Đối soát duyệt</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
          <tbody>{history.length ? history.map(item => { const meta = statusMeta(item.status); const counts=item.reviewCounts; return <tr key={item.id}>
            <td data-label="Tên file" className="org-cell-lead"><div className="org-file"><FileSpreadsheet aria-hidden="true" /><div><strong>{item.fileName}</strong><span>{item.department?.name || 'Toàn hệ thống'}</span></div></div></td>
            <td data-label="Người thực hiện">{item.createdBy}</td>
            <td data-label="Phòng ban">{item.department?.name || 'Toàn hệ thống'}</td>
            <td data-label="Thời gian">{new Date(item.createdAt).toLocaleString('vi-VN')}</td>
            <td data-label="Tổng dòng" className="org-num">{item.totalRows}</td>
            <td data-label="Đối soát duyệt">{counts&&counts.pending+counts.approved+counts.rejected>0?`${counts.approved} duyệt · ${counts.rejected} trả · ${counts.pending} chờ`:`${item.successRows} thay đổi${item.errorRows?` · ${item.errorRows} lỗi`:''}`}</td>
            <td data-label="Trạng thái"><span className={`status ${meta.tone}`}>{meta.label}</span></td>
            <td data-label="Thao tác"><div className="org-actions"><button type="button" className="btn secondary sm" disabled={detailLoading} onClick={()=>void openBatch(item.id)}><Eye/>Chi tiết</button></div></td>
          </tr>; }) : <tr><td colSpan={8} className="org-cell-empty"><Empty
            title="Chưa có lịch sử xử lý Excel"
            description="Phạm vi phòng ban và năm đang chọn chưa ghi nhận phiếu Excel nào. Hãy tải phiếu hiện trạng ở bước 1 để bắt đầu."
          /></td></tr>}</tbody>
        </table></div>
      </section>}
    </div>

    {detail&&<Modal title={`Đối soát ${detail.fileName}`} onClose={()=>setDetail(null)} wide>
      <div className="table-summary"><span><b>{detail.updates.length}</b> dòng báo cáo · Người tải: {detail.createdBy}</span><span className={`status ${statusMeta(detail.status).tone}`}>{statusMeta(detail.status).label}</span></div>
      <div className="table-wrap"><table className="org-cardtable">
        <thead><tr><th>Chỉ tiêu</th><th>Người nộp</th><th>Số liệu</th><th>Trạng thái</th><th>Phản hồi duyệt</th></tr></thead>
        <tbody>{detail.updates.length?detail.updates.map(update=><tr key={update.id}>
          <td data-label="Chỉ tiêu" className="org-cell-lead"><span className="code">{update.target.code}</span><strong className="org-cell-strong">{update.target.title}</strong></td>
          <td data-label="Người nộp">{update.user.fullName}</td>
          <td data-label="Số liệu"><b>{update.value.toLocaleString('vi-VN')} {update.target.unit}</b>{update.note&&<span className="org-sub">{update.note}</span>}</td>
          <td data-label="Trạng thái"><span className={`status ${update.reviewStatus==='APPROVED'?'green':update.reviewStatus==='REJECTED'?'red':'amber'}`}>{update.reviewStatus==='APPROVED'?'Đã duyệt':update.reviewStatus==='REJECTED'?'Đã trả lại':'Chờ duyệt'}</span></td>
          <td data-label="Phản hồi duyệt">{update.reviewNote||'—'}{update.reviewer&&<span className="org-sub">{update.reviewer.fullName}</span>}</td>
        </tr>):<tr><td colSpan={5} className="org-cell-empty"><Empty
          title="Phiếu này không tạo dòng báo cáo"
          description="Toàn bộ dòng trong file đều không tạo yêu cầu cập nhật nào cho chỉ tiêu."
        /></td></tr>}</tbody>
      </table></div>
    </Modal>}
  </>;
}
