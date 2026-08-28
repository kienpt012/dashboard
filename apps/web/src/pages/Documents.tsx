import {
  Download,
  Eye,
  FileText,
  Search,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent, type FormEvent, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, auth, downloadApi } from '../api';
import { ADMIN_ROLES, DOCUMENT_ROLES, hasAnyRole } from '../authz';
import { Empty, Modal, PageHead, Spinner } from '../components/UI';
import type { Department, DocumentStatus, DocumentType, SourceDocument } from '../types';
import { documentTypeLabels } from '../types';
import '../documents.css';

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

function statusMeta(status: DocumentStatus) {
  if (status === 'UPLOADED') return { label: 'Chờ xử lý', tone: 'slate' };
  if (status === 'PROCESSING') return { label: 'Đang xử lý', tone: 'blue' };
  if (status === 'PROCESSED') return { label: 'Đã xử lý', tone: 'green' };
  return { label: 'Lỗi', tone: 'red' };
}

export default function Documents() {
  const user = auth.user;
  const canUpload = hasAnyRole(user, DOCUMENT_ROLES);
  const isAdmin = hasAnyRole(user, ADMIN_ROLES);
  const [documents, setDocuments] = useState<SourceDocument[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
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
      setNotice(`Đã tải lên văn bản ${created.code}. Hệ thống đang xử lý và sẽ đề xuất chỉ tiêu sau khi đọc xong tài liệu.`);
      await load();
    } catch (reason) {
      setError(messageOf(reason));
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
    } catch (reason) {
      setLoadError(messageOf(reason));
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
      setNotice(`Đã xóa văn bản ${deleteTarget.code} khỏi kho lưu trữ.`);
      setDeleteTarget(null);
      await load();
    } catch (reason) {
      setError(messageOf(reason));
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

    {notice && <div className="notice success" role="status">{notice}<button aria-label="Đóng thông báo" onClick={() => setNotice('')}><X /></button></div>}
    {loadError && <div className="notice error" role="alert">{loadError}<button onClick={() => void load()}>Thử lại</button></div>}

    <div className="toolbar">
      <div className="search"><Search /><input aria-label="Tìm văn bản theo mã, tiêu đề hoặc số hiệu" value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm theo mã, tiêu đề hoặc số văn bản..." />{search && <button onClick={() => setSearch('')} aria-label="Xóa tìm kiếm"><X /></button>}</div>
      <select value={status} onChange={event => setStatus(event.target.value)} aria-label="Trạng thái xử lý">
        <option value="">Tất cả trạng thái</option>
        <option value="UPLOADED">Chờ xử lý</option>
        <option value="PROCESSING">Đang xử lý</option>
        <option value="PROCESSED">Đã xử lý</option>
        <option value="FAILED">Lỗi</option>
      </select>
      <select value={departmentId} onChange={event => setDepartmentId(event.target.value)} aria-label="Phòng ban">
        <option value="">Tất cả phòng ban</option>
        {departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}
      </select>
    </div>

    <div className="table-card">
      <div className="table-summary">
        <span>Hiển thị <b>{documents.length}</b> văn bản trong kho</span>
        {hasActiveDocuments && <span className="muted">Đang tự động cập nhật trạng thái xử lý...</span>}
      </div>
      {loading ? <Spinner /> : documents.length ? <div className="table-wrap"><table className="action-table">
        <thead><tr><th>Mã</th><th>Tiêu đề</th><th>Loại</th><th>Trạng thái</th><th>Trang</th><th>AI đề xuất</th><th>Người tải</th><th>Thời điểm</th><th>Thao tác</th></tr></thead>
        <tbody>{documents.map(item => {
          const meta = statusMeta(item.status);
          return <tr key={item.id}>
            <td><span className="code">{item.code}</span></td>
            <td className="doc-title-cell">
              <strong>{item.title}</strong>
              {item.docNumber && <small className="doc-subline">Số {item.docNumber}{item.issuedBy ? ` · ${item.issuedBy}` : ''}</small>}
              {item.status === 'FAILED' && item.processingError && <small className="doc-error-line">{item.processingError}</small>}
            </td>
            <td>{documentTypeLabels[item.docType]}</td>
            <td><span className={`status ${meta.tone}`}><i />{meta.label}</span></td>
            <td className="number">{item.pageCount ?? '—'}</td>
            <td>{item.candidateCount > 0
              ? <Link className="doc-count-link" to={`/admin/documents/${item.id}`}><FileText />{item.candidateCount} đề xuất</Link>
              : <span className="doc-count-muted">Chưa có</span>}</td>
            <td>{item.uploadedBy.fullName}</td>
            <td>{new Date(item.createdAt).toLocaleString('vi-VN')}</td>
            <td><div className="doc-actions">
              <Link className="btn secondary compact" to={`/admin/documents/${item.id}`}><Eye />Xem</Link>
              <button type="button" className="btn secondary compact" disabled={actionId === `download:${item.id}`} onClick={() => void download(item)}><Download />{actionId === `download:${item.id}` ? 'Đang tải...' : 'Tải xuống'}</button>
              {isAdmin && <button type="button" className="btn secondary compact" disabled={Boolean(actionId)} onClick={() => openDelete(item)}><Trash2 />Xóa</button>}
            </div></td>
          </tr>;
        })}</tbody>
      </table></div> : <Empty title="Chưa có văn bản nào" description="Tải lên kế hoạch, quyết định hoặc báo cáo để hệ thống tự động đề xuất chỉ tiêu." />}
    </div>

    {modal === 'upload' && canUpload && <Modal title="Tải văn bản vào kho" onClose={closeModal} wide>
      <form className="form-grid" onSubmit={submitUpload}>
        {error && <div className="form-error full" role="alert">{error}</div>}
        <div className="full">
          <div
            className={`dropzone ${drag ? 'drag' : ''}`}
            role="button"
            tabIndex={0}
            aria-label={file ? `Đã chọn ${file.name}. Nhấn Enter để chọn tệp khác.` : 'Chọn tệp văn bản để tải lên'}
            onDragOver={(event: DragEvent) => { event.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(event: DragEvent) => { event.preventDefault(); setDrag(false); pick(event.dataTransfer.files); }}
            onClick={openFilePicker}
            onKeyDown={handleDropzoneKey}
          >
            <input ref={input} type="file" accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg,.webp" hidden onChange={event => pick(event.target.files)} />
            <div className="upload-icon"><UploadCloud /></div>
            {file
              ? <><strong>{file.name}</strong><span>{(file.size / 1024).toFixed(1)} KB · Nhấn để chọn tệp khác</span></>
              : <><strong>Kéo thả văn bản vào đây</strong><span>hoặc <b>chọn tệp từ máy tính</b> · PDF, DOCX, XLSX, PNG, JPG, WEBP · Tối đa 25MB</span></>}
          </div>
        </div>
        <label className="full">Tiêu đề<input maxLength={300} value={uploadForm.title} onChange={event => setUploadForm({ ...uploadForm, title: event.target.value })} placeholder="Để trống để hệ thống tự đặt theo tên tệp" /></label>
        <label>Loại văn bản<select value={uploadForm.docType} onChange={event => setUploadForm({ ...uploadForm, docType: event.target.value as UploadForm['docType'] })}>
          <option value="">— Tự nhận diện —</option>
          {(Object.keys(documentTypeLabels) as DocumentType[]).map(key => <option key={key} value={key}>{documentTypeLabels[key]}</option>)}
        </select></label>
        <label>Số văn bản<input maxLength={100} value={uploadForm.docNumber} onChange={event => setUploadForm({ ...uploadForm, docNumber: event.target.value })} placeholder="VD: 15/KH-UBND" /></label>
        <label>Cơ quan ban hành<input maxLength={200} value={uploadForm.issuedBy} onChange={event => setUploadForm({ ...uploadForm, issuedBy: event.target.value })} /></label>
        <label>Ngày ban hành<input type="date" value={uploadForm.issuedDate} onChange={event => setUploadForm({ ...uploadForm, issuedDate: event.target.value })} /></label>
        <label>Năm kế hoạch<input type="number" min="2000" max="2100" value={uploadForm.year} onChange={event => setUploadForm({ ...uploadForm, year: event.target.value })} /></label>
        <label>Phòng ban<select value={uploadForm.departmentId} onChange={event => setUploadForm({ ...uploadForm, departmentId: event.target.value })}>
          <option value="">— Không gắn phòng ban —</option>
          {departments.filter(department => department.isActive).map(department => <option key={department.id} value={department.id}>{department.name}</option>)}
        </select></label>
        <label className="full">Mô tả<textarea maxLength={2000} value={uploadForm.description} onChange={event => setUploadForm({ ...uploadForm, description: event.target.value })} placeholder="Bối cảnh hoặc phạm vi áp dụng của văn bản..." /></label>
        <div className="permission-note full"><FileText /><div><strong>Hệ thống chỉ đề xuất, con người quyết định</strong><p>Sau khi tải lên, hệ thống tự động đọc văn bản và trích xuất các chỉ tiêu ứng viên. Không có dữ liệu chính thức nào được tạo ra cho đến khi cán bộ có thẩm quyền xác minh và duyệt từng đề xuất.</p></div></div>
        <div className="modal-actions full">
          <button type="button" className="btn secondary" disabled={submitting} onClick={closeModal}>Hủy</button>
          <button className="btn primary" disabled={submitting || !file}>{submitting ? 'Đang tải lên...' : 'Tải lên và xử lý'}</button>
        </div>
      </form>
    </Modal>}

    {modal === 'delete' && deleteTarget && <Modal title={`Xóa văn bản ${deleteTarget.code}`} onClose={closeModal}>
      <div className="form-grid single">
        {error && <div className="form-error full" role="alert">{error}</div>}
        <div className="target-preview"><span>{deleteTarget.code}</span><strong>{deleteTarget.title}</strong><p>{documentTypeLabels[deleteTarget.docType]} · Tải lên {new Date(deleteTarget.createdAt).toLocaleString('vi-VN')} bởi {deleteTarget.uploadedBy.fullName}</p></div>
        <div className="permission-note warning"><Trash2 /><div><strong>Thao tác không thể hoàn tác</strong><p>Văn bản, nội dung đã số hóa và các đề xuất chưa duyệt sẽ bị xóa vĩnh viễn. Văn bản đã có đề xuất được duyệt không thể xóa để bảo toàn căn cứ của chỉ tiêu.</p></div></div>
        <div className="modal-actions full">
          <button type="button" className="btn secondary" disabled={submitting} onClick={closeModal}>Hủy</button>
          <button type="button" className="btn danger" disabled={submitting} onClick={() => void confirmDelete()}>{submitting ? 'Đang xóa...' : 'Xóa văn bản'}</button>
        </div>
      </div>
    </Modal>}
  </>;
}
