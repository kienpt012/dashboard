import {
  Calendar,
  ClipboardCheck,
  FileSpreadsheet,
  Plus,
  Search,
  Target as TargetIcon,
  X,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, auth } from '../api';
import { Empty, Modal, PageHead, Spinner } from '../components/UI';
import type { Department, Target } from '../types';
import { statusMeta } from '../types';

const currentYear = new Date().getFullYear();
const initialForm = {
  code: '',
  title: '',
  description: '',
  unit: '%',
  targetValue: 100,
  weight: 1,
  year: currentYear,
  frequency: 'YEARLY',
  direction: 'HIGHER_IS_BETTER',
  dueDate: `${currentYear}-12-31`,
  departmentId: '',
};

export default function Targets() {
  const user = auth.user;
  const canCreate = user?.role === 'ADMIN';
  const canReport = user?.role !== 'VIEWER';
  const canImport = user?.role !== 'VIEWER';
  const isAdmin = user?.role === 'ADMIN';
  const [targets, setTargets] = useState<Target[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [year, setYear] = useState(currentYear);
  const [form, setForm] = useState<any>(initialForm);
  const [modal, setModal] = useState<'create' | 'progress' | null>(null);
  const [selected, setSelected] = useState<Target | null>(null);
  const [progress, setProgress] = useState({ value: 0, note: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [publishingId, setPublishingId] = useState('');
  const [params, setParams] = useSearchParams();

  async function load() {
    setLoading(true);
    setLoadError('');
    try {
      const query = new URLSearchParams({ year: String(year) });
      if (isAdmin && departmentId) query.set('departmentId', departmentId);
      const [targetRows, departmentRows] = await Promise.all([
        api<Target[]>(`/targets?${query}`),
        api<Department[]>('/departments'),
      ]);
      setTargets(targetRows);
      setDepartments(departmentRows);
      setForm((previous: any) => ({
        ...previous,
        year,
        departmentId: previous.departmentId || user?.departmentId || departmentRows[0]?.id || '',
      }));
    } catch (reason: any) {
      setLoadError(reason.message || 'Không thể tải danh sách chỉ tiêu');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [year, departmentId]);
  useEffect(() => {
    if (params.get('new') === '1') {
      if (canCreate) setModal('create');
      setParams({}, { replace: true });
    }
  }, [params, canCreate, setParams]);

  const visible = useMemo(() => targets.filter(target => {
    const matchesSearch = !search || `${target.code} ${target.title}`.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = !status || target.status === status;
    return matchesSearch && matchesStatus;
  }), [targets, search, status]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await api('/targets', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          targetValue: Number(form.targetValue),
          weight: Number(form.weight),
          year: Number(form.year),
        }),
      });
      setModal(null);
      setForm({ ...initialForm, year, departmentId: user?.departmentId || departments[0]?.id || '' });
      setNotice('Đã tạo và giao chỉ tiêu thành công.');
      await load();
    } catch (reason: any) {
      setError(reason.message);
    }
  }

  async function submitProgress(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setError('');
    try {
      const result = await api<any>(`/targets/${selected.id}/progress`, {
        method: 'POST',
        body: JSON.stringify({
          value: Number(progress.value),
          note: progress.note,
          baseVersion: selected.version,
        }),
      });
      setModal(null);
      setNotice(result.reviewStatus === 'PENDING'
        ? 'Báo cáo đã được gửi và đang chờ lãnh đạo đơn vị duyệt.'
        : 'Số liệu đã được cập nhật và ghi vào lịch sử chỉ tiêu.');
      await load();
    } catch (reason: any) {
      setError(reason.message);
    }
  }

  function openProgress(target: Target) {
    setSelected(target);
    setProgress({ value: target.currentValue, note: '' });
    setError('');
    setModal('progress');
  }

  async function publishTarget(target: Target) {
    setPublishingId(target.id);
    setLoadError('');
    try {
      await api(`/targets/${target.id}/publish`, { method: 'POST' });
      setNotice(`Đã công bố số liệu chính thức của ${target.code} trên trang người dân.`);
      await load();
    } catch (reason: any) {
      setLoadError(reason.message || 'Không thể công bố chỉ tiêu');
    } finally {
      setPublishingId('');
    }
  }

  return <>
    <PageHead
      eyebrow={`CHỈ TIÊU · KẾ HOẠCH ${year}`}
      title="Danh mục chỉ tiêu"
      description={isAdmin
        ? 'Theo dõi toàn hệ thống; mỗi đơn vị chỉ nhìn thấy và báo cáo dữ liệu thuộc phạm vi được giao.'
        : `Phạm vi dữ liệu: ${user?.department?.name || 'đơn vị của bạn'}.`}
      actions={<>
        {canImport && <Link className="btn secondary" to="/admin/imports"><FileSpreadsheet />Cập nhật bằng Excel</Link>}
        {canCreate && <button className="btn primary" onClick={() => setModal('create')}><Plus />Đặt chỉ tiêu</button>}
      </>}
    />

    {notice && <div className="notice success"><ClipboardCheck />{notice}<button onClick={() => setNotice('')}><X /></button></div>}
    {loadError && <div className="notice error">{loadError}<button onClick={load}>Thử lại</button></div>}

    <div className="toolbar">
      <div className="search"><Search /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm theo mã hoặc tên chỉ tiêu..." />{search && <button onClick={() => setSearch('')} aria-label="Xóa tìm kiếm"><X /></button>}</div>
      <select value={year} onChange={event => setYear(Number(event.target.value))} aria-label="Năm kế hoạch">
        {[currentYear - 1, currentYear, currentYear + 1].map(value => <option key={value} value={value}>Năm {value}</option>)}
      </select>
      {isAdmin && <select value={departmentId} onChange={event => setDepartmentId(event.target.value)} aria-label="Phòng ban">
        <option value="">Tất cả phòng ban</option>
        {departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}
      </select>}
      <select value={status} onChange={event => setStatus(event.target.value)} aria-label="Trạng thái">
        <option value="">Tất cả trạng thái</option>
        {Object.entries(statusMeta).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
      </select>
    </div>

    <div className="table-card">
      <div className="table-summary"><span>Hiển thị <b>{visible.length}</b> chỉ tiêu trong phạm vi được phép</span></div>
      {loading ? <Spinner /> : visible.length ? <div className="table-wrap"><table>
        <thead><tr><th>Mã / Chỉ tiêu</th><th>Đơn vị phụ trách</th><th>Tiến độ</th><th>Hạn hoàn thành</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
        <tbody>{visible.map(target => {
          const percent = target.progress ?? Math.min(Math.round(target.currentValue / Math.max(target.targetValue, 0.001) * 100), 100);
          return <tr key={target.id}>
            <td><div className="target-cell"><div className="target-mini"><TargetIcon /></div><div><span>{target.code}</span><strong>{target.title}</strong><small className="direction-label">{target.direction === 'LOWER_IS_BETTER' ? 'Càng thấp càng tốt' : 'Càng cao càng tốt'}</small></div></div></td>
            <td><div className="department-cell"><i style={{ background: target.department.color }} />{target.department.name}</div></td>
            <td><div className="progress-cell"><div><span>{target.currentValue.toLocaleString('vi-VN')} / {target.targetValue.toLocaleString('vi-VN')} {target.unit}</span><b>{percent}%</b></div><div className="progress"><i className={percent >= 100 ? 'done' : ''} style={{ width: `${percent}%` }} /></div>{target.pendingUpdates ? <small>{target.pendingUpdates} báo cáo chờ duyệt</small> : null}</div></td>
            <td><div className="date-cell"><Calendar />{new Date(target.dueDate).toLocaleDateString('vi-VN')}</div></td>
            <td><span className={`status ${statusMeta[target.status]?.color}`}><i />{statusMeta[target.status]?.label}</span></td>
            <td><div className="approval-actions">{canReport ? <button className="btn secondary compact" onClick={() => openProgress(target)}>Báo cáo số liệu</button> : <span className="muted">Chỉ xem</span>}{isAdmin && <button className="btn primary compact" disabled={publishingId === target.id || !target.lastReportedAt} onClick={() => publishTarget(target)}>{publishingId === target.id ? 'Đang công bố...' : target.publishedAt && target.lastReportedAt && new Date(target.publishedAt) >= new Date(target.lastReportedAt) ? 'Công bố lại' : 'Công bố'}</button>}</div></td>
          </tr>;
        })}</tbody>
      </table></div> : <Empty title="Không tìm thấy chỉ tiêu" description="Hãy thay đổi bộ lọc hoặc năm kế hoạch." />}
    </div>

    {modal === 'create' && canCreate && <Modal title="Đặt chỉ tiêu mới" onClose={() => setModal(null)} wide>
      <form className="form-grid" onSubmit={create}>
        {error && <div className="form-error full">{error}</div>}
        <label>Mã chỉ tiêu<input required value={form.code} onChange={event => setForm({ ...form, code: event.target.value.toUpperCase() })} placeholder="VD: CT-2026-011" /></label>
        <label>Năm kế hoạch<input type="number" required min="2000" max="2100" value={form.year} onChange={event => setForm({ ...form, year: event.target.value })} /></label>
        <label className="full">Tên chỉ tiêu<input required value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></label>
        <label className="full">Mô tả<textarea value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label>
        <label>Phòng ban phụ trách<select required value={form.departmentId} disabled={!isAdmin} onChange={event => setForm({ ...form, departmentId: event.target.value })}>{departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
        <label>Chu kỳ<select value={form.frequency} onChange={event => setForm({ ...form, frequency: event.target.value })}><option value="YEARLY">Hàng năm</option><option value="QUARTERLY">Hàng quý</option><option value="MONTHLY">Hàng tháng</option></select></label>
        <label>Giá trị mục tiêu<input type="number" step="any" required value={form.targetValue} onChange={event => setForm({ ...form, targetValue: event.target.value })} /></label>
        <label>Đơn vị tính<input required value={form.unit} onChange={event => setForm({ ...form, unit: event.target.value })} /></label>
        <label>Chiều đánh giá<select value={form.direction} onChange={event => setForm({ ...form, direction: event.target.value })}><option value="HIGHER_IS_BETTER">Càng cao càng tốt</option><option value="LOWER_IS_BETTER">Càng thấp càng tốt</option></select></label>
        <label>Trọng số<input type="number" step="0.1" min="0.1" max="10" value={form.weight} onChange={event => setForm({ ...form, weight: event.target.value })} /></label>
        <label>Hạn hoàn thành<input type="date" required value={form.dueDate} onChange={event => setForm({ ...form, dueDate: event.target.value })} /></label>
        <div className="modal-actions full"><button type="button" className="btn secondary" onClick={() => setModal(null)}>Hủy</button><button className="btn primary">Tạo và giao chỉ tiêu</button></div>
      </form>
    </Modal>}

    {modal === 'progress' && selected && <Modal title="Báo cáo kết quả thực hiện" onClose={() => setModal(null)}>
      <form className="form-grid single" onSubmit={submitProgress}>
        <div className="target-preview"><span>{selected.code}</span><strong>{selected.title}</strong><p>Hiện tại: {selected.currentValue.toLocaleString('vi-VN')} · Mục tiêu: {selected.targetValue.toLocaleString('vi-VN')} {selected.unit} · Phiên bản {selected.version}</p></div>
        {user?.role !== 'ADMIN' && <div className="permission-note"><ClipboardCheck /><div><strong>Cần người có thẩm quyền duyệt</strong><p>Số liệu chỉ trở thành kết quả chính thức sau khi được phê duyệt; người gửi không thể tự duyệt.</p></div></div>}
        {error && <div className="form-error full">{error}</div>}
        <label className="full">Giá trị thực hiện mới<input type="number" step="any" min="0" required value={progress.value} onChange={event => setProgress({ ...progress, value: Number(event.target.value) })} /></label>
        <label className="full">Nguồn số liệu / ghi chú<textarea required value={progress.note} onChange={event => setProgress({ ...progress, note: event.target.value })} placeholder="Nêu kỳ báo cáo và nguồn đối chiếu..." /></label>
        <div className="modal-actions full"><button type="button" className="btn secondary" onClick={() => setModal(null)}>Hủy</button><button className="btn primary">{user?.role === 'ADMIN' ? 'Xác nhận cập nhật' : 'Gửi chờ duyệt'}</button></div>
      </form>
    </Modal>}
  </>;
}
