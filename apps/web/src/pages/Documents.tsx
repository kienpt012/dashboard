import {
  AlertTriangle,
  Download,
  Eye,
  FileText,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent, type FormEvent, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, auth, downloadApi } from '../api';
import { ADMIN_ROLES, DOCUMENT_ROLES, hasAnyRole } from '../authz';
import { Empty, Modal, PageHead, SkeletonTable } from '../components/UI';
import { toast } from '../components/Toast';
import type { Department, DocumentStatus, DocumentType, SourceDocument } from '../types';
import { documentTypeLabels } from '../types';
import '../styles/documents.css';

type UploadForm = {
  title: string;
  docType: '' | DocumentType;
  docNumber: string;
  issuedBy: string;
  issuedDate: string;
  year: string;
  departmentId: string;
  description: string;
};

const emptyUploadForm: UploadForm = {
  title: '',
  docType: '',
  docNumber: '',
  issuedBy: '',
  issuedDate: '',
  year: '',
  departmentId: '',
  description: '',
};

const acceptedExtensions = ['.pdf', '.docx', '.xlsx', '.png', '.jpg', '.jpeg', '.webp'];
const maxFileSize = 25 * 1024 * 1024;

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

/** Tông màu lấy từ hệ thống thiết kế: chờ xử lý = trung tính, đang chạy = thông tin,
 *  xong = tốt, lỗi = xấu. Không dùng màu thương hiệu để nói về trạng thái dữ liệu. */
function statusMeta(status: DocumentStatus) {
  if (status === 'UPLOADED') return { label: 'Chờ xử lý', tone: 'neutral' };
  if (status === 'PROCESSING') return { label: 'Đang xử lý', tone: 'info' };
  if (status === 'PROCESSED') return { label: 'Đã xử lý', tone: 'ok' };
  return { label: 'Lỗi', tone: 'bad' };
}

export default function Documents() {
  const user = auth.user;
  const canUpload = hasAnyRole(user, DOCUMENT_ROLES);
  const isAdmin = hasAnyRole(user, ADMIN_ROLES);
  const [documents, setDocuments] = useState<SourceDocument[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [modal, setModal] = useState<'upload' | 'delete' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SourceDocument | null>(null);
  const [uploadForm, setUploadForm] = useState<UploadForm>(emptyUploadForm);
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionId, setActionId] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const loadRequestId = useRef(0);
  const firstLoad = useRef(true);

  async function load(background = false) {
    const requestId = ++loadRequestId.current;
    if (!background) {
      setLoading(true);
      setLoadError('');
    }
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (status) params.set('status', status);
      if (departmentId) params.set('departmentId', departmentId);
      const result = await api<SourceDocument[]>(`/documents${params.size ? `?${params}` : ''}`);
      if (requestId === loadRequestId.current) setDocuments(result);
    } catch (reason) {
      if (requestId === loadRequestId.current && !background) setLoadError(reason instanceof Error ? reason.message : 'Không thể tải danh sách văn bản');
    } finally {
      if (requestId === loadRequestId.current && !background) setLoading(false);
    }
  }

  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false;
      void load();
      return;
    }
    const timer = window.setTimeout(() => void load(), 350);
    return () => window.clearTimeout(timer);
  }, [search, status, departmentId]);

  useEffect(() => {
    api<Department[]>('/departments').then(setDepartments).catch(() => undefined);
  }, []);

  const hasActiveDocuments = documents.some(item => item.status === 'UPLOADED' || item.status === 'PROCESSING');
  const hasFilters = Boolean(search.trim() || status || departmentId);

  useEffect(() => {
    if (!hasActiveDocuments) return;
    const timer = window.setInterval(() => void load(true), 4000);
    return () => window.clearInterval(timer);
  }, [hasActiveDocuments, search, status, departmentId]);

  function closeModal() {
    if (submitting) return;
    setModal(null);
    setDeleteTarget(null);
    setError('');
  }

  function openUpload() {
    setUploadForm(emptyUploadForm);
    setFile(null);
    setError('');
    setModal('upload');
  }

  function clearFilters() {
    setSearch('');
    setStatus('');
    setDepartmentId('');
  }

  function pick(files: FileList | null) {
    const selected = files?.[0];
    setError('');
    if (!selected) return;
    const name = selected.name.toLowerCase();
    if (!acceptedExtensions.some(extension => name.endsWith(extension))) {
      setFile(null);
      setError('Chỉ hỗ trợ tệp PDF, DOCX, XLSX hoặc ảnh scan (PNG, JPG, WEBP).');
      return;
    }
    if (selected.size > maxFileSize) {
      setFile(null);
      setError('Tệp vượt quá dung lượng tối đa 25MB.');
      return;
    }
    setFile(selected);
  }

  function openFilePicker() {
    if (submitting) return;
    if (!input.current) return;
    input.current.value = '';
    input.current.click();
  }

  function handleDropzoneKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openFilePicker();
  }

  async function submitUpload(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      setError('Vui lòng chọn tệp văn bản cần tải lên.');
      return;
    }
    setError('');
    setSubmitting(true);
    const body = new FormData();
    body.append('file', file);
    if (uploadForm.title.trim()) body.append('title', uploadForm.title.trim());
    if (uploadForm.docType) body.append('docType', uploadForm.docType);
    if (uploadForm.docNumber.trim()) body.append('docNumber', uploadForm.docNumber.trim());
    if (uploadForm.issuedBy.trim()) body.append('issuedBy', uploadForm.issuedBy.trim());
    if (uploadForm.issuedDate) body.append('issuedDate', uploadForm.issuedDate);
    if (uploadForm.year.trim()) body.append('year', uploadForm.year.trim());
    if (uploadForm.departmentId) body.append('departmentId', uploadForm.departmentId);
    if (uploadForm.description.trim()) body.append('description', uploadForm.description.trim());
    try {
      const created = await api<SourceDocument>('/documents', { method: 'POST', body });
      setModal(null);
      setFile(null);
      setUploadForm(emptyUploadForm);
      toast.ok(
        `Đã tải lên văn bản ${created.code}`,
        'Hệ thống đang xử lý và sẽ đề xuất chỉ tiêu sau khi đọc xong tài liệu.',
      );
      await load();
    } catch (reason) {
      setError(messageOf(reason));
      toast.error('Không thể tải văn bản lên', messageOf(reason));
    } finally {
      setSubmitting(false);
    }
  }

  async function download(item: SourceDocument) {
    setActionId(`download:${item.id}`);
    setLoadError('');
    try {
      const blob = await downloadApi(`/documents/${item.id}/download`);
      saveBlob(blob, item.originalName);
      toast.ok(`Đã tải xuống tệp gốc của văn bản ${item.code}`);
    } catch (reason) {
      setLoadError(messageOf(reason));
      toast.error('Không thể tải xuống tệp gốc', messageOf(reason));
    } finally {
      setActionId('');
    }
  }

  function openDelete(item: SourceDocument) {
    setDeleteTarget(item);
    setError('');
    setModal('delete');
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setError('');
    setSubmitting(true);
    try {
      await api(`/documents/${deleteTarget.id}`, { method: 'DELETE' });
      setModal(null);
      toast.ok(`Đã xóa văn bản ${deleteTarget.code} khỏi kho lưu trữ`);
      setDeleteTarget(null);
      await load();
    } catch (reason) {
      setError(messageOf(reason));
      toast.error('Không thể xóa văn bản', messageOf(reason));
    } finally {
      setSubmitting(false);
    }
  }

  return <>
    <PageHead
      eyebrow="TIẾP NHẬN DỮ LIỆU"
      title="Kho văn bản"
      description="Tải lên văn bản hành chính (PDF, DOCX, XLSX, ảnh scan) để hệ thống tự động đọc nội dung và đề xuất chỉ tiêu; mọi đề xuất đều phải được cán bộ xác minh trước khi trở thành dữ liệu chính thức."
      actions={canUpload && <button className="btn primary document-upload-action" onClick={openUpload}><UploadCloud />Tải văn bản</button>}
    />

    {loadError && <div className="alert bad doc-alert" role="alert">
      <AlertTriangle aria-hidden="true" />
      <p>{loadError}</p>
      <button type="button" className="doc-alert-action" onClick={() => void load()}><RotateCcw />Thử lại</button>
    </div>}

    <section className="panel doc-filters" aria-label="Bộ lọc kho văn bản">
      <div className="search">
        <Search aria-hidden="true" />
        <input
          aria-label="Tìm văn bản theo mã, tiêu đề hoặc số hiệu"
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Tìm theo mã, tiêu đề hoặc số văn bản..."
        />
        {search && <button type="button" onClick={() => setSearch('')} aria-label="Xóa tìm kiếm"><X /></button>}
      </div>
      <label className="doc-filter">
        <span>Trạng thái xử lý</span>
        <select value={status} onChange={event => setStatus(event.target.value)}>
          <option value="">Tất cả trạng thái</option>
          <option value="UPLOADED">Chờ xử lý</option>
          <option value="PROCESSING">Đang xử lý</option>
          <option value="PROCESSED">Đã xử lý</option>
          <option value="FAILED">Lỗi</option>
        </select>
      </label>
      <label className="doc-filter">
        <span>Phòng ban</span>
        <select value={departmentId} onChange={event => setDepartmentId(event.target.value)}>
          <option value="">Tất cả phòng ban</option>
          {departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}
        </select>
      </label>
      {hasFilters && <button type="button" className="btn ghost compact doc-filter-clear" onClick={clearFilters}><X />Bỏ lọc</button>}
    </section>

    {loading ? <SkeletonTable rows={6} /> : <div className="panel flush">
      {documents.length ? <>
        <div className="table-wrap">
          <table className="action-table doc-table">
            <thead><tr>
              <th>Văn bản</th>
              <th>Loại</th>
              <th>Trạng thái</th>
              <th>AI đề xuất</th>
              <th>Tải lên</th>
              <th>Thao tác</th>
            </tr></thead>
            <tbody>{documents.map(item => {
              const meta = statusMeta(item.status);
              return <tr key={item.id}>
                <td className="doc-cell-title" data-label="Văn bản">
                  <span className="code">{item.code}</span>
                  <strong>{item.title}</strong>
                  {item.docNumber && <small className="doc-subline">Số {item.docNumber}{item.issuedBy ? ` · ${item.issuedBy}` : ''}</small>}
                  {item.status === 'FAILED' && item.processingError && <small className="doc-error-line">{item.processingError}</small>}
                </td>
                <td data-label="Loại">{documentTypeLabels[item.docType]}</td>
                <td className="doc-cell-state" data-label="Trạng thái">
                  <span className={`status ${meta.tone}`}>{meta.label}</span>
                  <small className="doc-subline doc-num">{item.pageCount != null ? `${item.pageCount} trang` : '—'}</small>
                </td>
                <td data-label="AI đề xuất">{item.candidateCount > 0
                  ? <Link className="doc-count-link" to={`/admin/documents/${item.id}`}><FileText />{item.candidateCount} đề xuất</Link>
                  : <span className="doc-count-muted">Chưa có</span>}</td>
                <td className="doc-cell-upload" data-label="Tải lên">
                  <strong>{item.uploadedBy.fullName}</strong>
                  <small className="doc-subline">{new Date(item.createdAt).toLocaleString('vi-VN')}</small>
                </td>
                <td className="doc-cell-actions" data-label="Thao tác">
                  <div className="doc-actions">
                    <Link className="row-action" to={`/admin/documents/${item.id}`} aria-label={`Xem văn bản ${item.code}`} data-tooltip="Xem & xác minh"><Eye /></Link>
                    <button type="button" className="row-action" disabled={actionId === `download:${item.id}`} onClick={() => void download(item)} aria-label={`Tải xuống văn bản ${item.code}`} data-tooltip={actionId === `download:${item.id}` ? 'Đang tải…' : 'Tải xuống'}><Download /></button>
                    {isAdmin && <button type="button" className="row-action danger" disabled={Boolean(actionId)} onClick={() => openDelete(item)} aria-label={`Xóa văn bản ${item.code}`} data-tooltip="Xóa văn bản"><Trash2 /></button>}
                  </div>
                </td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        <div className="table-summary">
          <span>Hiển thị <b>{documents.length}</b> văn bản trong kho</span>
          {hasActiveDocuments && <span className="doc-live"><i aria-hidden="true" />Đang tự động cập nhật trạng thái xử lý...</span>}
        </div>
      </> : <Empty
        title={hasFilters ? 'Không có văn bản nào khớp bộ lọc' : 'Chưa có văn bản nào'}
        description={hasFilters
          ? 'Thử nới rộng từ khóa tìm kiếm, hoặc bỏ bớt điều kiện trạng thái và phòng ban.'
          : 'Tải lên kế hoạch, quyết định hoặc báo cáo để hệ thống tự động đề xuất chỉ tiêu.'}
        action={hasFilters
          ? <button type="button" className="btn secondary" onClick={clearFilters}><X />Bỏ lọc</button>
          : canUpload ? <button type="button" className="btn primary" onClick={openUpload}><UploadCloud />Tải văn bản</button> : undefined}
      />}
    </div>}

    {modal === 'upload' && canUpload && <Modal title="Tải văn bản vào kho" onClose={closeModal} wide>
      <form className="form-grid two" onSubmit={submitUpload}>
        {error && <div className="form-error full" role="alert">{error}</div>}
        <div className="full">
          <div
            className={`dropzone${drag ? ' drag' : ''}${submitting ? ' disabled' : ''}`}
            role="button"
            tabIndex={0}
            aria-disabled={submitting || undefined}
            aria-label={file ? `Đã chọn ${file.name}. Nhấn Enter để chọn tệp khác.` : 'Chọn tệp văn bản để tải lên'}
            onDragOver={(event: DragEvent) => { event.preventDefault(); if (!submitting) setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(event: DragEvent) => { event.preventDefault(); setDrag(false); if (!submitting) pick(event.dataTransfer.files); }}
            onClick={openFilePicker}
            onKeyDown={handleDropzoneKey}
          >
            <input ref={input} type="file" accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg,.webp" hidden onChange={event => pick(event.target.files)} />
            <div className="upload-icon" aria-hidden="true"><UploadCloud /></div>
            {file
              ? <><strong>{file.name}</strong><span>{(file.size / 1024).toFixed(1)} KB · Nhấn để chọn tệp khác</span></>
              : <><strong>Kéo thả văn bản vào đây</strong><span>hoặc <b>chọn tệp từ máy tính</b> · PDF, DOCX, XLSX, PNG, JPG, WEBP · Tối đa 25MB</span></>}
          </div>
        </div>

        <h4 className="full">Thông tin văn bản</h4>
        <label className="full">Tiêu đề<input maxLength={300} value={uploadForm.title} onChange={event => setUploadForm({ ...uploadForm, title: event.target.value })} placeholder="Để trống để hệ thống tự đặt theo tên tệp" /></label>
        <label>Loại văn bản<select value={uploadForm.docType} onChange={event => setUploadForm({ ...uploadForm, docType: event.target.value as UploadForm['docType'] })}>
          <option value="">— Tự nhận diện —</option>
          {(Object.keys(documentTypeLabels) as DocumentType[]).map(key => <option key={key} value={key}>{documentTypeLabels[key]}</option>)}
        </select></label>
        <label>Số văn bản<input maxLength={100} value={uploadForm.docNumber} onChange={event => setUploadForm({ ...uploadForm, docNumber: event.target.value })} placeholder="VD: 15/KH-UBND" /></label>
        <label>Cơ quan ban hành<input maxLength={200} value={uploadForm.issuedBy} onChange={event => setUploadForm({ ...uploadForm, issuedBy: event.target.value })} /></label>
        <label>Ngày ban hành<input type="date" value={uploadForm.issuedDate} onChange={event => setUploadForm({ ...uploadForm, issuedDate: event.target.value })} /></label>

        <h4 className="full">Phạm vi áp dụng</h4>
        <label>Năm kế hoạch<input type="number" min="2000" max="2100" value={uploadForm.year} onChange={event => setUploadForm({ ...uploadForm, year: event.target.value })} /></label>
        <label>Phòng ban<select value={uploadForm.departmentId} onChange={event => setUploadForm({ ...uploadForm, departmentId: event.target.value })}>
          <option value="">— Không gắn phòng ban —</option>
          {departments.filter(department => department.isActive).map(department => <option key={department.id} value={department.id}>{department.name}</option>)}
        </select></label>
        <label className="full">Mô tả<textarea maxLength={2000} value={uploadForm.description} onChange={event => setUploadForm({ ...uploadForm, description: event.target.value })} placeholder="Bối cảnh hoặc phạm vi áp dụng của văn bản..." /></label>

        <div className="info-box full"><ShieldCheck aria-hidden="true" /><div><strong>Hệ thống chỉ đề xuất, con người quyết định</strong><p>Sau khi tải lên, hệ thống tự động đọc văn bản và trích xuất các chỉ tiêu ứng viên. Không có dữ liệu chính thức nào được tạo ra cho đến khi cán bộ có thẩm quyền xác minh và duyệt từng đề xuất.</p></div></div>
        <div className="modal-actions full">
          <button type="button" className="btn secondary" disabled={submitting} onClick={closeModal}>Hủy</button>
          <button className="btn primary" disabled={submitting || !file}>{submitting ? 'Đang tải lên...' : 'Tải lên và xử lý'}</button>
        </div>
      </form>
    </Modal>}

    {modal === 'delete' && deleteTarget && <Modal title={`Xóa văn bản ${deleteTarget.code}`} onClose={closeModal}>
      <div className="form-grid">
        {error && <div className="form-error full" role="alert">{error}</div>}
        <div className="doc-preview">
          <span className="code">{deleteTarget.code}</span>
          <strong>{deleteTarget.title}</strong>
          <p>{documentTypeLabels[deleteTarget.docType]} · Tải lên {new Date(deleteTarget.createdAt).toLocaleString('vi-VN')} bởi {deleteTarget.uploadedBy.fullName}</p>
        </div>
        <div className="notice warn"><Trash2 aria-hidden="true" /><div><strong>Thao tác không thể hoàn tác</strong><p>Văn bản, nội dung đã số hóa và các đề xuất chưa duyệt sẽ bị xóa vĩnh viễn. Văn bản đã có đề xuất được duyệt không thể xóa để bảo toàn căn cứ của chỉ tiêu.</p></div></div>
        <div className="modal-actions full">
          <button type="button" className="btn secondary" disabled={submitting} onClick={closeModal}>Hủy</button>
          <button type="button" className="btn danger" disabled={submitting} onClick={() => void confirmDelete()}>{submitting ? 'Đang xóa...' : 'Xóa văn bản'}</button>
        </div>
      </div>
    </Modal>}
  </>;
}
