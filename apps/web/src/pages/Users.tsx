import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  UserCheck,
  Users as UsersIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ApiError, api, auth } from '../api';
import { getInitials } from '../authz';
import { Empty, Modal, PageHead, Spinner } from '../components/UI';
import type { Department, Role, User } from '../types';

const roleNames: Record<Role, string> = {
  ADMIN: 'Quản trị hệ thống',
  MANAGER: 'Lãnh đạo đơn vị',
  STAFF: 'Cán bộ cập nhật',
  VIEWER: 'Chỉ xem báo cáo',
};

type UserForm = {
  username: string;
  password: string;
  confirmPassword: string;
  resetPassword: boolean;
  fullName: string;
  email: string;
  role: Role;
  departmentId: string;
  isActive: boolean;
};

const emptyForm: UserForm = {
  username: '',
  password: '',
  confirmPassword: '',
  resetPassword: false,
  fullName: '',
  email: '',
  role: 'STAFF',
  departmentId: '',
  isActive: true,
};

const strongPasswordPattern = '(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,128}';
const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,128}$/;
const passwordHelp = 'Ít nhất 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt.';

function formatLastLogin(value?: string | null) {
  if (!value) return 'Chưa đăng nhập';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Chưa có dữ liệu' : date.toLocaleString('vi-VN');
}

function mutationMessage(reason: unknown, fallback: string) {
  if (reason instanceof ApiError && reason.status === 409) {
    return `Không thể lưu vì có xung đột dữ liệu: ${reason.message}. Dữ liệu hiện tại chưa bị thay đổi.`;
  }
  return reason instanceof Error ? reason.message : fallback;
}

export default function Users() {
  const actor = auth.user;
  const isAdmin = actor?.role === 'ADMIN';
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | ''>('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [formError, setFormError] = useState('');
  const [pageError, setPageError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [updatingId, setUpdatingId] = useState('');

  async function load() {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setPageError('');
    try {
      const [userRows, departmentRows] = await Promise.all([
        api<User[]>('/users'),
        api<Department[]>('/departments'),
      ]);
      setUsers(userRows);
      setDepartments(departmentRows);
    } catch (reason) {
      setPageError(reason instanceof Error ? reason.message : 'Không thể tải danh sách tài khoản');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const activeDepartments = departments.filter(department => department.isActive);
  const visible = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('vi-VN');
    return users.filter(user => {
      const matchesSearch = !keyword || `${user.fullName} ${user.username} ${user.email || ''} ${user.department?.name || ''}`
        .toLocaleLowerCase('vi-VN')
        .includes(keyword);
      return matchesSearch
        && (!roleFilter || user.role === roleFilter)
        && (!departmentFilter || user.departmentId === departmentFilter);
    });
  }, [users, search, roleFilter, departmentFilter]);

  function closeModal() {
    if (submitting) return;
    setModalOpen(false);
    setEditing(null);
    setFormError('');
  }

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm, departmentId: activeDepartments[0]?.id || '' });
    setFormError('');
    setModalOpen(true);
  }

  function openEdit(user: User) {
    setEditing(user);
    setForm({
      username: user.username,
      password: '',
      confirmPassword: '',
      resetPassword: false,
      fullName: user.fullName,
      email: user.email || '',
      role: user.role,
      departmentId: user.departmentId || '',
      isActive: user.isActive,
    });
    setFormError('');
    setModalOpen(true);
  }

  function changeRole(role: Role) {
    setForm(current => ({
      ...current,
      role,
      departmentId: role === 'ADMIN' ? '' : current.departmentId || activeDepartments[0]?.id || '',
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    setSuccess('');

    if (form.role !== 'ADMIN' && !form.departmentId) {
      setFormError('Vui lòng chọn phòng ban cho tài khoản này.');
      return;
    }
    if ((!editing || form.resetPassword) && !strongPasswordRegex.test(form.password)) {
      setFormError(`Mật khẩu chưa đủ an toàn. ${passwordHelp}`);
      return;
    }
    if ((!editing || form.resetPassword) && form.password !== form.confirmPassword) {
      setFormError('Mật khẩu xác nhận không khớp.');
      return;
    }
    if (editing?.id === actor?.id && (!form.isActive || form.role !== 'ADMIN')) {
      setFormError('Bạn không thể tự khóa hoặc hạ quyền tài khoản đang đăng nhập.');
      return;
    }
    if (editing && form.resetPassword && !window.confirm(`Đặt lại mật khẩu cho tài khoản @${editing.username}? Mật khẩu cũ sẽ hết hiệu lực ngay.`)) {
      return;
    }

    setSubmitting(true);
    try {
      if (editing) {
        const updated = await api<User>(`/users/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            expectedVersion: editing.version,
            fullName: form.fullName.trim(),
            email: form.email.trim() || null,
            role: form.role,
            departmentId: form.role === 'ADMIN' ? null : form.departmentId,
            isActive: form.isActive,
            ...(form.resetPassword ? { password: form.password } : {}),
          }),
        });
        if (updated.id === actor?.id) auth.setUser(updated);
        setSuccess(`Đã cập nhật tài khoản @${editing.username}${form.resetPassword ? ' và đặt lại mật khẩu' : ''}.`);
      } else {
        await api<User>('/users', {
          method: 'POST',
          body: JSON.stringify({
            username: form.username.trim(),
            password: form.password,
            fullName: form.fullName.trim(),
            email: form.email.trim() || undefined,
            role: form.role,
            departmentId: form.role === 'ADMIN' ? undefined : form.departmentId,
          }),
        });
        setSuccess(`Đã tạo tài khoản @${form.username.trim().toLowerCase()}.`);
      }
      setModalOpen(false);
      setEditing(null);
      await load();
    } catch (reason) {
      setFormError(mutationMessage(reason, editing ? 'Không thể cập nhật tài khoản' : 'Không thể tạo tài khoản'));
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(user: User) {
    if (user.id === actor?.id && user.isActive) return;
    const action = user.isActive ? 'khóa' : 'mở khóa';
    if (!window.confirm(`Bạn có chắc muốn ${action} tài khoản @${user.username}?`)) return;
    setUpdatingId(user.id);
    setPageError('');
    setSuccess('');
    try {
      await api<User>(`/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ expectedVersion: user.version, isActive: !user.isActive }),
      });
      setSuccess(`Đã ${action} tài khoản @${user.username}.`);
      await load();
    } catch (reason) {
      setPageError(mutationMessage(reason, `Không thể ${action} tài khoản`));
    } finally {
      setUpdatingId('');
    }
  }

  if (!isAdmin) {
    return <>
      <PageHead eyebrow="QUẢN TRỊ TRUY CẬP" title="Không có quyền truy cập" description="Chỉ quản trị viên hệ thống được quản lý tài khoản." />
      <Empty title="Quyền truy cập bị giới hạn" description="Vui lòng quay lại trang tổng quan." />
    </>;
  }

  return <>
    <PageHead
      eyebrow="QUẢN TRỊ TRUY CẬP"
      title="Tài khoản người dùng"
      description="Cấp đúng vai trò, đúng đơn vị và kiểm soát các thay đổi nhạy cảm của tài khoản."
      actions={<button className="btn primary" onClick={openCreate}><Plus />Tạo tài khoản</button>}
    />

    {pageError && <div className="notice error" role="alert">{pageError}<button type="button" onClick={() => void load()}>Thử lại</button></div>}
    {success && <div className="import-result" role="status"><CheckCircle2 /><div><strong>Thao tác thành công</strong><p>{success}</p></div></div>}

    <div className="mini-stat-grid">
      <div><span><UsersIcon /></span><p>Tổng tài khoản<strong>{users.length}</strong></p></div>
      <div><span><UserCheck /></span><p>Đang hoạt động<strong>{users.filter(user => user.isActive).length}</strong></p></div>
      <div><span><ShieldCheck /></span><p>Quản trị viên<strong>{users.filter(user => user.role === 'ADMIN' && user.isActive).length}</strong></p></div>
      <div><span><KeyRound /></span><p>Chưa từng đăng nhập<strong>{users.filter(user => !user.lastLoginAt).length}</strong></p></div>
    </div>

    <div className="table-card">
      <div className="toolbar inside">
        <div className="search"><Search /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm tên, tài khoản, email, phòng ban..." /></div>
        <select aria-label="Lọc theo vai trò" value={roleFilter} onChange={event => setRoleFilter(event.target.value as Role | '')}>
          <option value="">Tất cả vai trò</option>
          {Object.entries(roleNames).map(([role, label]) => <option key={role} value={role}>{label}</option>)}
        </select>
        <select aria-label="Lọc theo phòng ban" value={departmentFilter} onChange={event => setDepartmentFilter(event.target.value)}>
          <option value="">Tất cả phòng ban</option>
          {departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}
        </select>
      </div>
      {loading ? <Spinner /> : <div className="table-wrap"><table>
        <thead><tr><th>Người dùng</th><th>Phòng ban</th><th>Vai trò</th><th>Trạng thái</th><th>Đăng nhập gần nhất</th><th>Thao tác</th></tr></thead>
        <tbody>{visible.length ? visible.map(user => <tr key={user.id}>
          <td><div className="user-cell"><div className="avatar color">{getInitials(user.fullName)}</div><div><strong>{user.fullName}</strong><span>@{user.username}{user.email && <> · {user.email}</>}</span></div></div></td>
          <td>{user.department?.name || 'Không gắn cố định'}</td>
          <td><span className={`role role-${user.role.toLowerCase()}`}>{roleNames[user.role]}</span></td>
          <td><span className={`status ${user.isActive ? 'green' : 'slate'}`}><i />{user.isActive ? 'Hoạt động' : 'Đã khóa'}</span></td>
          <td><span className="muted">{formatLastLogin(user.lastLoginAt)}</span></td>
          <td><div className="approval-actions">
            <button className="btn secondary compact" onClick={() => openEdit(user)}><Pencil />Chỉnh sửa</button>
            <button
              className="btn secondary compact"
              disabled={updatingId === user.id || (user.id === actor?.id && user.isActive)}
              title={user.id === actor?.id && user.isActive ? 'Không thể tự khóa tài khoản đang đăng nhập' : ''}
              onClick={() => void toggleActive(user)}
            >{updatingId === user.id ? 'Đang lưu...' : user.isActive ? 'Khóa' : 'Mở khóa'}</button>
          </div></td>
        </tr>) : <tr><td colSpan={6}><Empty title="Không tìm thấy tài khoản" description="Hãy thay đổi từ khóa hoặc bộ lọc." /></td></tr>}</tbody>
      </table></div>}
    </div>

    {modalOpen && <Modal title={editing ? `Chỉnh sửa @${editing.username}` : 'Tạo tài khoản mới'} onClose={closeModal} wide>
      <form className="form-grid" onSubmit={submit}>
        {formError && <div className="form-error full">{formError}</div>}
        <label>Họ và tên<input required minLength={2} maxLength={160} value={form.fullName} onChange={event => setForm({ ...form, fullName: event.target.value })} placeholder="Nguyễn Văn A" /></label>
        <label>Email<input type="email" maxLength={180} value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} placeholder="email@laithieu.gov.vn" /></label>
        <label>Tên đăng nhập<input required minLength={3} maxLength={50} pattern="[A-Za-z0-9._-]+" value={form.username} disabled={Boolean(editing)} onChange={event => setForm({ ...form, username: event.target.value })} placeholder="nguyen.van.a" autoComplete="off" /></label>
        <label>Vai trò<select value={form.role} disabled={editing?.id === actor?.id} onChange={event => changeRole(event.target.value as Role)}>{Object.entries(roleNames).map(([role, label]) => <option key={role} value={role}>{label}</option>)}</select></label>
        <label>Phòng ban<select required={form.role !== 'ADMIN'} disabled={form.role === 'ADMIN'} value={form.departmentId} onChange={event => setForm({ ...form, departmentId: event.target.value })}>
          <option value="">{form.role === 'ADMIN' ? 'Quản trị toàn hệ thống' : 'Chọn phòng ban'}</option>
          {departments.filter(department => department.isActive || department.id === editing?.departmentId).map(department => <option key={department.id} value={department.id}>{department.name}{department.isActive ? '' : ' (đã ngừng)'}</option>)}
        </select></label>
        {editing ? <label className="check-field">Trạng thái tài khoản<input type="checkbox" checked={form.isActive} disabled={editing.id === actor?.id} onChange={event => setForm({ ...form, isActive: event.target.checked })} /><span>{form.isActive ? 'Đang hoạt động' : 'Khóa tài khoản'}</span></label> : <>
          <label>Mật khẩu ban đầu<input required minLength={8} maxLength={128} pattern={strongPasswordPattern} title={passwordHelp} type="password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} autoComplete="new-password" aria-describedby="user-password-requirements" /></label>
          <label>Xác nhận mật khẩu<input required minLength={8} maxLength={128} pattern={strongPasswordPattern} title={passwordHelp} type="password" value={form.confirmPassword} onChange={event => setForm({ ...form, confirmPassword: event.target.value })} autoComplete="new-password" aria-describedby="user-password-requirements" /></label>
          <small id="user-password-requirements" className="password-help full">{passwordHelp}</small>
        </>}

        {editing && editing.id !== actor?.id && <>
          <label className="check-field full"><input type="checkbox" checked={form.resetPassword} onChange={event => setForm({ ...form, resetPassword: event.target.checked, password: '', confirmPassword: '' })} /><span>Đặt lại mật khẩu trong lần cập nhật này</span></label>
          {form.resetPassword && <>
            <label>Mật khẩu mới<input required minLength={8} maxLength={128} pattern={strongPasswordPattern} title={passwordHelp} type="password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} autoComplete="new-password" aria-describedby="user-password-requirements" /></label>
            <label>Xác nhận mật khẩu mới<input required minLength={8} maxLength={128} pattern={strongPasswordPattern} title={passwordHelp} type="password" value={form.confirmPassword} onChange={event => setForm({ ...form, confirmPassword: event.target.value })} autoComplete="new-password" aria-describedby="user-password-requirements" /></label>
            <small id="user-password-requirements" className="password-help full">{passwordHelp}</small>
          </>}
        </>}

        {editing?.id === actor?.id && <div className="permission-note warning full"><AlertTriangle /><div><strong>Đây là tài khoản đang đăng nhập</strong><p>Bạn có thể sửa họ tên và email, nhưng không thể tự khóa hoặc hạ quyền. Để đổi mật khẩu mà vẫn được cấp lại phiên an toàn, hãy dùng trang “Hồ sơ & bảo mật”.</p></div></div>}
        <div className="permission-note full"><ShieldCheck /><div><strong>Phân quyền theo đơn vị</strong><p>Tài khoản ngoài vai trò quản trị chỉ xem và xử lý dữ liệu thuộc phòng ban được gán.</p></div></div>
        <div className="modal-actions full"><button type="button" className="btn secondary" disabled={submitting} onClick={closeModal}>Hủy</button><button className="btn primary" disabled={submitting || (form.role !== 'ADMIN' && !form.departmentId)}>{submitting ? 'Đang lưu...' : editing ? 'Lưu thay đổi' : 'Tạo tài khoản'}</button></div>
      </form>
    </Modal>}
  </>;
}
