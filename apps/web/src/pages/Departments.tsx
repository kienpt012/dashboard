import { AlertTriangle, Building2, CheckCircle2, MessageSquareText, Pencil, Plus, Target, Users } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, api, auth } from '../api';
import { Empty, Modal, PageHead, Spinner } from '../components/UI';
import type { Department } from '../types';

type DepartmentForm = {
  code: string;
  name: string;
  description: string;
  color: string;
  isActive: boolean;
};

const emptyForm: DepartmentForm = {
  code: '',
  name: '',
  description: '',
  color: '#0f766e',
  isActive: true,
};

function mutationMessage(reason: unknown, fallback: string) {
  if (reason instanceof ApiError && reason.status === 409) {
    return `Không thể lưu vì có xung đột dữ liệu: ${reason.message}. Dữ liệu hiện tại chưa bị thay đổi.`;
  }
  return reason instanceof Error ? reason.message : fallback;
}

export default function Departments() {
  const user = auth.user;
  const isAdmin = user?.role === 'ADMIN';
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pageError, setPageError] = useState('');
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState<DepartmentForm>(emptyForm);

  async function load() {
    setLoading(true);
    setPageError('');
    try {
      const result = await api<Department[]>('/departments');
      setDepartments(isAdmin ? result : result.filter(department => department.id === user?.departmentId));
    } catch (reason) {
      setPageError(reason instanceof Error ? reason.message : 'Không thể tải thông tin phòng ban');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function closeModal() {
    if (submitting) return;
    setModalOpen(false);
    setEditing(null);
    setFormError('');
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setFormError('');
    setModalOpen(true);
  }

  function openEdit(department: Department) {
    setEditing(department);
    setForm({
      code: department.code,
      name: department.name,
      description: department.description || '',
      color: department.color,
      isActive: department.isActive,
    });
    setFormError('');
    setModalOpen(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    setSuccess('');

    const deactivating = Boolean(editing?.isActive && !form.isActive);
    if (deactivating) {
      const users = editing?._count?.users ?? 0;
      const targets = editing?._count?.targets ?? 0;
      const feedbacks = editing?._count?.feedbacks ?? 0;
      const confirmed = window.confirm(
        `Kiểm tra điều kiện ngừng hoạt động ${editing?.name}? Đơn vị hiện có ${users} tài khoản, ${targets} chỉ tiêu và ${feedbacks} phản ánh. Hệ thống sẽ từ chối nếu chưa chuyển hết dữ liệu đang vận hành.`,
      );
      if (!confirmed) return;
    }

    setSubmitting(true);
    try {
      const payload = {
        ...(editing ? { expectedVersion: editing.version } : {}),
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        description: form.description.trim(),
        color: form.color,
        ...(editing ? { isActive: form.isActive } : {}),
      };
      if (editing) {
        await api<Department>(`/departments/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        setSuccess(`Đã cập nhật phòng ban ${form.code.trim().toUpperCase()}.`);
      } else {
        await api<Department>('/departments', { method: 'POST', body: JSON.stringify(payload) });
        setSuccess(`Đã tạo phòng ban ${form.code.trim().toUpperCase()}.`);
      }
      setModalOpen(false);
      setEditing(null);
      await load();
    } catch (reason) {
      setFormError(mutationMessage(reason, editing ? 'Không thể cập nhật phòng ban' : 'Không thể tạo phòng ban'));
    } finally {
      setSubmitting(false);
    }
  }

  return <>
    <PageHead
      eyebrow="CƠ CẤU TỔ CHỨC"
      title={isAdmin ? 'Phòng ban & đơn vị' : user?.department?.name || 'Thông tin phòng ban'}
      description={isAdmin
        ? 'Quản lý đầu mối thực hiện, trạng thái hoạt động và quy mô chỉ tiêu được giao.'
        : 'Thông tin dưới đây được giới hạn trong đơn vị của tài khoản đang đăng nhập.'}
      actions={isAdmin ? <button className="btn primary" onClick={openCreate}><Plus />Thêm phòng ban</button> : undefined}
    />

    {pageError && <div className="form-error" role="alert">{pageError} <button className="btn secondary" onClick={() => void load()}>Thử lại</button></div>}
    {success && <div className="import-result" role="status"><CheckCircle2 /><div><strong>Thao tác thành công</strong><p>{success}</p></div></div>}

    {loading ? <Spinner /> : departments.length ? <div className="department-grid">{departments.map(department => <article className="department-card" key={department.id}>
      <div className="dep-card-head">
        <div className="dep-large-icon" style={{ background: `${department.color}16`, color: department.color }}><Building2 /></div>
        <span className={`status ${department.isActive ? 'green' : 'slate'}`}><i />{department.isActive ? 'Đang hoạt động' : 'Ngừng hoạt động'}</span>
      </div>
      <span>{department.code}</span>
      <h3>{department.name}</h3>
      {department.description?.trim() ? <p>{department.description}</p> : null}
      <div className="dep-card-stats">
        <div><Users /><span>Nhân sự<b>{department._count?.users ?? 0}</b></span></div>
        <div><Target /><span>Chỉ tiêu<b>{department._count?.targets ?? 0}</b></span></div>
        <div><MessageSquareText /><span>Phản ánh<b>{department._count?.feedbacks ?? 0}</b></span></div>
      </div>
      {isAdmin && <div className="approval-actions"><button className="btn secondary compact" onClick={() => openEdit(department)}><Pencil />Chỉnh sửa</button></div>}
      <i className="dep-accent" style={{ background: department.color }} />
    </article>)}</div> : <Empty
      title="Chưa có thông tin phòng ban"
      description={isAdmin ? 'Hãy tạo phòng ban đầu tiên để bắt đầu giao chỉ tiêu.' : 'Liên hệ quản trị viên để kiểm tra đơn vị được gán cho tài khoản.'}
    />}

    {isAdmin && modalOpen && <Modal title={editing ? `Chỉnh sửa ${editing.code}` : 'Thêm phòng ban'} onClose={closeModal}>
      <form className="form-grid single" onSubmit={submit}>
        {formError && <div className="form-error full">{formError}</div>}
        <label className="full">Mã phòng ban<input required minLength={2} maxLength={30} pattern="[A-Za-z0-9_-]+" value={form.code} onChange={event => setForm({ ...form, code: event.target.value.toUpperCase() })} placeholder="VD: TCKH" /></label>
        <label className="full">Tên phòng ban<input required minLength={2} maxLength={160} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
        <label className="full">Mô tả<textarea maxLength={1000} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label>
        <label className="full">Màu nhận diện<div className="color-input"><input type="color" value={form.color} onChange={event => setForm({ ...form, color: event.target.value })} /><input required pattern="^#[0-9A-Fa-f]{6}$" value={form.color} onChange={event => setForm({ ...form, color: event.target.value })} /></div></label>
        {editing && <label className="check-field full"><input type="checkbox" checked={form.isActive} onChange={event => setForm({ ...form, isActive: event.target.checked })} /><span>{form.isActive ? 'Phòng ban đang hoạt động' : 'Ngừng hoạt động phòng ban'}</span></label>}
        {editing && !form.isActive && <div className="permission-note warning full"><AlertTriangle /><div><strong>Phải xử lý hết dữ liệu đang vận hành</strong><p>Đơn vị đang có {editing._count?.users ?? 0} tài khoản, {editing._count?.targets ?? 0} chỉ tiêu và {editing._count?.feedbacks ?? 0} phản ánh. Hãy khóa/chuyển tài khoản, chuyển chỉ tiêu và hoàn tất phản ánh trước; hệ thống sẽ kiểm tra lại khi lưu.</p></div></div>}
        {!editing && <div className="permission-note full"><Building2 /><div><strong>Trạng thái ban đầu</strong><p>Phòng ban mới được kích hoạt ngay để có thể nhận tài khoản và chỉ tiêu.</p></div></div>}
        <div className="modal-actions full"><button type="button" className="btn secondary" disabled={submitting} onClick={closeModal}>Hủy</button><button className="btn primary" disabled={submitting}>{submitting ? 'Đang lưu...' : editing ? 'Lưu thay đổi' : 'Thêm phòng ban'}</button></div>
      </form>
    </Modal>}
  </>;
}
