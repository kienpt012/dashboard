import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  Calendar,
  ClipboardCheck,
  Eye,
  EyeOff,
  FileClock,
  FileSpreadsheet,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Star,
  Target as TargetIcon,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError, api, auth } from '../api';
import { Empty, Modal, PageHead, Spinner } from '../components/UI';
import { currentVietnamYear } from '../date';
import type { Department, Target } from '../types';
import { statusMeta } from '../types';

const currentYear = currentVietnamYear();

type TargetForm = {
  code: string;
  title: string;
  description: string;
  unit: string;
  targetValue: string;
  weight: string;
  year: string;
  frequency: 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
  direction: 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER';
  dueDate: string;
  departmentId: string;
  isHighlighted: boolean;
  publicOrder: string;
};

type MySubmission = {
  id: string;
  value: number;
  note?: string | null;
  reviewStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  baseVersion: number;
  reviewNote?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  target: Target;
  reviewer?: { id: string; fullName: string; username: string } | null;
  importBatch?: { id: string; fileName: string; status: string } | null;
};

function newTargetForm(year = currentYear, departmentId = ''): TargetForm {
  return {
    code: '',
    title: '',
    description: '',
    unit: '%',
    targetValue: '100',
    weight: '1',
    year: String(year),
    frequency: 'YEARLY',
    direction: 'HIGHER_IS_BETTER',
    dueDate: `${year}-12-31`,
    departmentId,
    isHighlighted: false,
    publicOrder: '0',
  };
}

function fallbackProgress(target: Target) {
  if (!target.lastReportedAt) return 0;
  if (target.direction === 'LOWER_IS_BETTER') {
    if (target.currentValue <= target.targetValue || target.currentValue <= 0) return 100;
    return Math.max(0, Math.min(100, Math.round(target.targetValue / target.currentValue * 100)));
  }
  if (target.targetValue <= 0) return target.currentValue >= target.targetValue ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round(target.currentValue / target.targetValue * 100)));
}

function sameDate(left?: string | null, right?: string | null) {
  if (!left || !right) return left === right;
  const leftTime = new Date(left).getTime();
  const rightTime = new Date(right).getTime();
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime === rightTime;
}

function isPublicationCurrent(target: Target) {
  if (!target.isPublic || !target.publishedAt) return false;

  return target.publishedValue === target.currentValue
    && target.publishedTargetValue === target.targetValue
    && target.publishedDirection === target.direction
    && target.publishedStatus === target.status
    && target.publishedCode === target.code
    && target.publishedTitle === target.title
    && (target.publishedDescription ?? '') === (target.description ?? '')
    && target.publishedUnit === target.unit
    && target.publishedWeight === target.weight
    && target.publishedYear === target.year
    && target.publishedFrequency === target.frequency
    && sameDate(target.publishedDueDate, target.dueDate)
    && target.publishedDepartmentName === target.department.name
    && target.publishedDepartmentColor === target.department.color
    && target.publishedHighlighted === target.isHighlighted
    && (target.publishedOrder ?? null) === (target.publicOrder ?? null);
}

function mutationMessage(reason: unknown, fallback: string) {
  if (reason instanceof ApiError && reason.status === 409) {
    return `${reason.message}. Dữ liệu mới nhất đã được tải lại; vui lòng mở lại biểu mẫu trước khi tiếp tục.`;
  }
  return reason instanceof Error ? reason.message : fallback;
}

export default function Targets() {
  const user = auth.user;
  const canCreate = user?.role === 'ADMIN';
  const canReport = user?.role !== 'VIEWER';
  const canImport = user?.role !== 'VIEWER';
  const isAdmin = user?.role === 'ADMIN';
  const canTrackOwnSubmissions = user?.role === 'MANAGER' || user?.role === 'STAFF';
  const [params, setParams] = useSearchParams();
  const requestedYear = Number(params.get('year'));
  const [targets, setTargets] = useState<Target[]>([]);
  const [mySubmissions, setMySubmissions] = useState<MySubmission[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(canTrackOwnSubmissions);
  const [submissionsError, setSubmissionsError] = useState('');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState(() => params.get('search') || '');
  const [status, setStatus] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [year, setYear] = useState(() => Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 2100 ? requestedYear : currentYear);
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState<TargetForm>(() => newTargetForm());
  const [modal, setModal] = useState<'create' | 'edit' | 'progress' | null>(null);
  const [selected, setSelected] = useState<Target | null>(null);
  const [progress, setProgress] = useState({ value: '', note: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionId, setActionId] = useState('');
  const loadRequestId = useRef(0);
  const submissionsRequestId = useRef(0);

  async function load() {
    const requestId = ++loadRequestId.current;
    setLoading(true);
    setLoadError('');
    try {
      const query = new URLSearchParams({ year: String(year) });
      query.set('archived', String(showArchived));
      if (isAdmin && departmentId) query.set('departmentId', departmentId);
      const [targetRows, departmentRows] = await Promise.all([
        api<Target[]>(`/targets?${query}`),
        api<Department[]>('/departments'),
      ]);
      if (requestId !== loadRequestId.current) return;
      setTargets(targetRows);
      setDepartments(departmentRows);
      setForm(previous => ({
        ...previous,
        departmentId: previous.departmentId
          || (!isAdmin ? user?.departmentId || '' : '')
          || (departmentId && departmentRows.some(row => row.id === departmentId && row.isActive) ? departmentId : ''),
      }));
    } catch (reason) {
      if (requestId === loadRequestId.current) setLoadError(reason instanceof Error ? reason.message : 'Không thể tải danh sách chỉ tiêu');
    } finally {
      if (requestId === loadRequestId.current) setLoading(false);
    }
  }

  async function loadMySubmissions(selectedYear = year) {
    const requestId = ++submissionsRequestId.current;
    if (!canTrackOwnSubmissions) {
      setMySubmissions([]);
      setSubmissionsLoading(false);
      return;
    }
    setSubmissionsLoading(true);
    setSubmissionsError('');
    try {
      const result = await api<MySubmission[]>(`/targets/my-submissions?year=${selectedYear}`);
      if (requestId === submissionsRequestId.current) setMySubmissions(result);
    } catch (reason) {
      if (requestId === submissionsRequestId.current) setSubmissionsError(reason instanceof Error ? reason.message : 'Không thể tải lịch sử báo cáo của bạn');
    } finally {
      if (requestId === submissionsRequestId.current) setSubmissionsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [year, departmentId, showArchived]);

  useEffect(() => {
    void loadMySubmissions(year);
  }, [year, canTrackOwnSubmissions]);

  useEffect(() => {
    if (params.get('new') !== '1') return;
    if (canCreate) openCreate();
    setParams({}, { replace: true });
  }, [params, canCreate, setParams]);

  const visible = useMemo(() => targets.filter(target => {
    const matchesSearch = !search || `${target.code} ${target.title}`.toLocaleLowerCase('vi-VN').includes(search.toLocaleLowerCase('vi-VN'));
    return matchesSearch && (!status || target.status === status);
  }), [targets, search, status]);

  const pendingSubmissionTargetIds = useMemo(() => new Set(
    mySubmissions
      .filter(submission => submission.reviewStatus === 'PENDING')
      .map(submission => submission.target.id),
  ), [mySubmissions]);

  const activeDepartments = departments.filter(department => department.isActive);
  const departmentChangeBlocked = Boolean(
    selected
    && (selected.pendingUpdates ?? 0) > 0
    && form.departmentId !== selected.department.id,
  );

  function closeModal() {
    if (submitting) return;
    setModal(null);
    setSelected(null);
    setError('');
  }

  function openCreate() {
    const initialDepartment = !isAdmin
      ? user?.departmentId || ''
      : (departmentId && activeDepartments.some(row => row.id === departmentId) ? departmentId : '');
    setSelected(null);
    setForm(newTargetForm(year, initialDepartment));
    setError('');
    setModal('create');
  }

  function openEdit(target: Target) {
    setSelected(target);
    setForm({
      code: target.code,
      title: target.title,
      description: target.description || '',
      unit: target.unit,
      targetValue: String(target.targetValue),
      weight: String(target.weight),
      year: String(target.year),
      frequency: target.frequency,
      direction: target.direction,
      dueDate: target.dueDate.slice(0, 10),
      departmentId: target.department.id,
      isHighlighted: target.isHighlighted,
      publicOrder: String(target.publicOrder ?? 0),
    });
    setError('');
    setModal('edit');
  }

  function openProgress(target: Target, draft?: { value: number; note?: string | null }) {
    if (canTrackOwnSubmissions && pendingSubmissionTargetIds.has(target.id)) {
      setLoadError(`Chỉ tiêu ${target.code} đã có báo cáo chờ duyệt. Hãy theo dõi kết quả trong mục “Báo cáo của tôi” trước khi gửi lại.`);
      return;
    }
    setSelected(target);
    setProgress({ value: String(draft?.value ?? target.currentValue), note: draft?.note ?? '' });
    setError('');
    setModal('progress');
  }

  async function submitTarget(event: FormEvent) {
    event.preventDefault();
    const editing = modal === 'edit';
    if (editing && !selected) return;
    setError('');
    setNotice('');
    const planningYear = Number(form.year);
    if (!Number.isInteger(planningYear) || planningYear < 2000 || planningYear > 2100) {
      setError('Năm kế hoạch phải nằm trong khoảng từ 2000 đến 2100.');
      return;
    }
    const minimumDueDate = `${planningYear}-01-01`;
    const maximumDueDate = `${planningYear}-12-31`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.dueDate) || form.dueDate < minimumDueDate || form.dueDate > maximumDueDate) {
      setError(`Hạn hoàn thành phải nằm trong năm kế hoạch ${planningYear}.`);
      return;
    }
    setSubmitting(true);
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      unit: form.unit.trim(),
      targetValue: Number(form.targetValue),
      weight: Number(form.weight),
      year: Number(form.year),
      frequency: form.frequency,
      direction: form.direction,
      dueDate: form.dueDate,
      departmentId: form.departmentId,
      isHighlighted: form.isHighlighted,
      publicOrder: Number(form.publicOrder),
    };
    try {
      if (editing && selected) {
        await api(`/targets/${selected.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            ...payload,
            expectedVersion: selected.version,
            expectedPublicationVersion: selected.publicationVersion,
          }),
        });
        setNotice(`Đã cập nhật chỉ tiêu ${selected.code}.${selected.isPublic ? ' Hãy công bố lại để áp dụng cấu hình mới trên trang người dân.' : ''}`);
      } else {
        await api('/targets', {
          method: 'POST',
          body: JSON.stringify({ ...payload, code: form.code.trim().toUpperCase(), isPublic: false }),
        });
        setNotice('Đã tạo và giao chỉ tiêu thành công. Chỉ tiêu chỉ được công khai sau khi có số liệu chính thức.');
      }
      setModal(null);
      setSelected(null);
      if (Number(form.year) !== year) setYear(Number(form.year));
      else await load();
    } catch (reason) {
      const message = mutationMessage(reason, editing ? 'Không thể cập nhật chỉ tiêu' : 'Không thể tạo chỉ tiêu');
      if (reason instanceof ApiError && reason.status === 409) {
        setModal(null);
        setSelected(null);
        await load();
        setLoadError(message);
      } else {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function submitProgress(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setError('');
    const progressValue = Number(progress.value);
    if (!progress.value.trim() || !Number.isFinite(progressValue) || progressValue < 0 || progressValue > 100) {
      setError('Giá trị thực hiện phải là số từ 0 đến 100.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await api<{ reviewStatus: string }>(`/targets/${selected.id}/progress`, {
        method: 'POST',
        body: JSON.stringify({
          value: progressValue,
          note: progress.note.trim(),
          baseVersion: selected.version,
        }),
      });
      setModal(null);
      setSelected(null);
      setNotice(result.reviewStatus === 'PENDING'
        ? 'Báo cáo đã được gửi và đang chờ lãnh đạo đơn vị duyệt.'
        : 'Số liệu đã được cập nhật và ghi vào lịch sử chỉ tiêu.');
      await Promise.all([load(), loadMySubmissions()]);
    } catch (reason) {
      const message = mutationMessage(reason, 'Không thể gửi báo cáo số liệu');
      if (reason instanceof ApiError && reason.status === 409) {
        setModal(null);
        setSelected(null);
        await load();
        setLoadError(message);
      } else {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function publishTarget(target: Target) {
    const action = target.isPublic ? 'cập nhật bản công bố' : 'công bố chỉ tiêu';
    if (!window.confirm(`Xác nhận ${action} ${target.code} bằng số liệu chính thức hiện tại?`)) return;
    setActionId(`publish:${target.id}`);
    setLoadError('');
    setNotice('');
    try {
      await api(`/targets/${target.id}/publish`, { method: 'POST' });
      setNotice(`Đã công bố số liệu chính thức của ${target.code} trên trang người dân.`);
      await load();
    } catch (reason) {
      const message = mutationMessage(reason, 'Không thể công bố chỉ tiêu');
      if (reason instanceof ApiError && reason.status === 409) await load();
      setLoadError(message);
    } finally {
      setActionId('');
    }
  }

  async function unpublishTarget(target: Target) {
    if (!window.confirm(`Hủy công khai ${target.code}? Chỉ tiêu sẽ biến mất khỏi trang người dân nhưng lịch sử công bố vẫn được giữ.`)) return;
    setActionId(`unpublish:${target.id}`);
    setLoadError('');
    setNotice('');
    try {
      await api(`/targets/${target.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          isPublic: false,
          expectedVersion: target.version,
          expectedPublicationVersion: target.publicationVersion,
        }),
      });
      setNotice(`Đã hủy công khai chỉ tiêu ${target.code}.`);
      await load();
    } catch (reason) {
      const message = mutationMessage(reason, 'Không thể hủy công khai chỉ tiêu');
      if (reason instanceof ApiError && reason.status === 409) await load();
      setLoadError(message);
    } finally {
      setActionId('');
    }
  }

  async function changeArchiveState(target: Target, restore = false) {
    const reason = window.prompt(
      restore
        ? `Nêu lý do khôi phục chỉ tiêu ${target.code}:`
        : `Nêu lý do lưu trữ chỉ tiêu ${target.code}. Chỉ tiêu sẽ ngừng nhận báo cáo và bị gỡ công khai:`,
      restore ? 'Khôi phục để tiếp tục kỳ kế hoạch' : 'Kết thúc kỳ kế hoạch',
    )?.trim();
    if (!reason) return;
    if (reason.length < 5) { setLoadError('Lý do phải có ít nhất 5 ký tự.'); return; }
    setActionId(`${restore ? 'unarchive' : 'archive'}:${target.id}`);
    setLoadError('');setNotice('');
    try {
      await api(`/targets/${target.id}/${restore ? 'unarchive' : 'archive'}`, {
        method: 'POST',
        body: JSON.stringify({ reason, expectedVersion: target.version, expectedPublicationVersion: target.publicationVersion }),
      });
      setNotice(restore
        ? `Đã khôi phục ${target.code} về chế độ nội bộ. Hãy kiểm tra trước khi công bố lại.`
        : `Đã lưu trữ ${target.code}; lịch sử báo cáo vẫn được giữ nguyên.`);
      await load();
    } catch (reasonValue) {
      if (reasonValue instanceof ApiError && reasonValue.status === 409) await load();
      setLoadError(mutationMessage(reasonValue, restore ? 'Không thể khôi phục chỉ tiêu' : 'Không thể lưu trữ chỉ tiêu'));
    } finally { setActionId(''); }
  }

  return <>
    <PageHead
      eyebrow={`CHỈ TIÊU · KẾ HOẠCH ${year}`}
      title="Danh mục chỉ tiêu"
      description={isAdmin
        ? 'Theo dõi toàn hệ thống, chỉnh sửa cấu hình và chỉ công bố phiên số liệu đã được xác nhận.'
        : `Phạm vi dữ liệu: ${user?.department?.name || 'đơn vị của bạn'}.`}
      actions={<>
        {canImport && <Link className="btn secondary" to="/admin/imports"><FileSpreadsheet />Cập nhật bằng Excel</Link>}
        {canCreate && <button className="btn primary" onClick={openCreate}><Plus />Đặt chỉ tiêu</button>}
      </>}
    />

    {notice && <div className="notice success" role="status"><ClipboardCheck />{notice}<button aria-label="Đóng thông báo" onClick={() => setNotice('')}><X /></button></div>}
    {loadError && <div className="notice error" role="alert">{loadError}<button onClick={() => void load()}>Thử lại</button></div>}

    {canTrackOwnSubmissions && <section className="table-card own-submissions">
      <div className="table-summary">
        <span><FileClock /> <b>Báo cáo của tôi</b> · Theo dõi kết quả duyệt và lý do trả lại trong năm {year}</span>
        <button type="button" onClick={() => void loadMySubmissions()} disabled={submissionsLoading}>Làm mới</button>
      </div>
      {submissionsLoading ? <Spinner /> : submissionsError
        ? <div className="notice error" role="alert">{submissionsError}<button onClick={() => void loadMySubmissions()}>Thử lại</button></div>
        : mySubmissions.length ? <div className="table-wrap"><table>
          <thead><tr><th>Thời gian gửi</th><th>Chỉ tiêu</th><th>Số liệu đã nộp</th><th>Trạng thái</th><th>Phản hồi duyệt</th></tr></thead>
          <tbody>{mySubmissions.map(submission => {
            const newerSubmissionExists = mySubmissions.some(item =>
              item.target.id === submission.target.id
              && new Date(item.createdAt).getTime() > new Date(submission.createdAt).getTime(),
            );
            const meta = submission.reviewStatus === 'APPROVED'
              ? { label: 'Đã duyệt', tone: 'green' }
              : submission.reviewStatus === 'REJECTED'
                ? { label: 'Đã trả lại', tone: 'red' }
                : { label: 'Chờ duyệt', tone: 'amber' };
            return <tr key={submission.id}>
              <td>{new Date(submission.createdAt).toLocaleString('vi-VN')}</td>
              <td><span className="code">{submission.target.code}</span><strong className="block">{submission.target.title}</strong><small className="muted">{submission.target.department.name}</small></td>
              <td><strong>{submission.value.toLocaleString('vi-VN')} {submission.target.unit}</strong>{submission.note && <small className="block review-note">{submission.note}</small>}{submission.importBatch && <small className="block muted">Excel: {submission.importBatch.fileName}</small>}</td>
              <td><span className={`status ${meta.tone}`}><i />{meta.label}</span></td>
              <td>{submission.reviewStatus === 'REJECTED' ? <div>
                <strong className="block danger-text">{submission.reviewNote || 'Báo cáo cần được điều chỉnh trước khi nộp lại.'}</strong>
                {submission.reviewer && <small className="block muted">Người duyệt: {submission.reviewer.fullName}</small>}
                {!newerSubmissionExists
                  ? <button className="btn secondary compact" type="button" onClick={() => openProgress(submission.target, { value: submission.value, note: submission.note })}><RotateCcw />Sửa và nộp lại</button>
                  : <small className="block muted">Đã có lần nộp mới hơn cho chỉ tiêu này.</small>}
              </div> : submission.reviewStatus === 'APPROVED'
                ? <span>{submission.reviewer ? `Duyệt bởi ${submission.reviewer.fullName}` : 'Đã ghi nhận vào số liệu chính thức'}</span>
                : <span className="muted">Đang chờ lãnh đạo đơn vị xem xét</span>}</td>
            </tr>;
          })}</tbody>
        </table></div>
        : <div className="spinner-wrap muted">Bạn chưa gửi báo cáo nào trong năm {year}.</div>}
    </section>}

    <div className="toolbar">
      <div className="search"><Search /><input aria-label="Tìm chỉ tiêu theo mã hoặc tên" value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm theo mã hoặc tên chỉ tiêu..." />{search && <button onClick={() => setSearch('')} aria-label="Xóa tìm kiếm"><X /></button>}</div>
      <select value={year} onChange={event => setYear(Number(event.target.value))} aria-label="Năm kế hoạch">
        {Array.from({ length: 101 }, (_, index) => 2100 - index).map(value => <option key={value} value={value}>Năm {value}</option>)}
      </select>
      {isAdmin && <select value={departmentId} onChange={event => setDepartmentId(event.target.value)} aria-label="Phòng ban">
        <option value="">Tất cả phòng ban</option>
        {departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}
      </select>}
      {isAdmin && <button type="button" className={`btn secondary ${showArchived ? 'active' : ''}`} onClick={() => setShowArchived(value => !value)}>{showArchived ? <TargetIcon /> : <Archive />}{showArchived ? 'Xem chỉ tiêu đang hoạt động' : 'Kho lưu trữ'}</button>}
      <select value={status} onChange={event => setStatus(event.target.value)} aria-label="Trạng thái">
        <option value="">Tất cả trạng thái</option>
        {Object.entries(statusMeta).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
      </select>
    </div>

    <div className="table-card">
      <div className="table-summary"><span>Hiển thị <b>{visible.length}</b> {showArchived ? 'chỉ tiêu đã lưu trữ' : 'chỉ tiêu đang hoạt động'} trong phạm vi được phép</span></div>
      {loading ? <Spinner /> : visible.length ? <div className="table-wrap"><table className="action-table">
        <thead><tr><th>Mã / Chỉ tiêu</th><th>Đơn vị phụ trách</th><th>Tiến độ</th><th>Hạn hoàn thành</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
        <tbody>{visible.map(target => {
          const percent = target.progress ?? fallbackProgress(target);
          const publicationCurrent = isPublicationCurrent(target);
          const publishing = actionId === `publish:${target.id}`;
          const unpublishing = actionId === `unpublish:${target.id}`;
          const ownSubmissionPending = canTrackOwnSubmissions && pendingSubmissionTargetIds.has(target.id);
          const checkingOwnSubmissions = canTrackOwnSubmissions && submissionsLoading;
          return <tr key={target.id}>
            <td><div className="target-cell"><div className="target-mini"><TargetIcon /></div><div><span>{target.code}</span><strong>{target.title}</strong><small className="direction-label">{target.direction === 'LOWER_IS_BETTER' ? 'Càng thấp càng tốt' : 'Càng cao càng tốt'} · {target.isPublic ? 'Đang công khai' : 'Nội bộ'}</small></div></div></td>
            <td><div className="department-cell"><i style={{ background: target.department.color }} />{target.department.name}</div></td>
            <td><div className="progress-cell"><div><span>{target.currentValue.toLocaleString('vi-VN')} / {target.targetValue.toLocaleString('vi-VN')} {target.unit}</span><b>{percent}%</b></div><div className="progress"><i className={percent >= 100 ? 'done' : ''} style={{ width: `${percent}%` }} /></div>{target.pendingUpdates ? <small>{target.pendingUpdates} báo cáo chờ duyệt</small> : null}</div></td>
            <td><div className="date-cell"><Calendar />{new Date(target.dueDate).toLocaleDateString('vi-VN')}</div></td>
            <td><span className={`status ${statusMeta[target.status]?.color}`}><i />{statusMeta[target.status]?.label}</span></td>
            <td><div className="approval-actions target-actions">
              {canReport && !target.isArchived ? <button
                className="btn secondary compact"
                disabled={Boolean(actionId) || ownSubmissionPending || checkingOwnSubmissions}
                title={ownSubmissionPending ? 'Báo cáo gần nhất đang chờ người có thẩm quyền duyệt' : checkingOwnSubmissions ? 'Đang kiểm tra trạng thái báo cáo' : ''}
                onClick={() => openProgress(target)}
              >{ownSubmissionPending ? 'Đang chờ duyệt' : checkingOwnSubmissions ? 'Đang kiểm tra...' : 'Báo cáo số liệu'}</button> : <span className="muted">{target.isArchived ? 'Đã lưu trữ' : 'Chỉ xem'}</span>}
              {isAdmin && !target.isArchived && <button className="btn secondary compact" disabled={Boolean(actionId)} onClick={() => openEdit(target)}><Pencil />Sửa</button>}
              {isAdmin && !target.isArchived && target.isPublic && <button className="btn secondary compact" disabled={Boolean(actionId)} onClick={() => void unpublishTarget(target)}><EyeOff />{unpublishing ? 'Đang ẩn...' : 'Hủy công khai'}</button>}
              {isAdmin && !target.isArchived && <button
                className="btn primary compact"
                disabled={Boolean(actionId) || !target.lastReportedAt || publicationCurrent}
                title={!target.lastReportedAt ? 'Cần có số liệu chính thức trước khi công bố' : publicationCurrent ? 'Bản công khai đã là phiên mới nhất' : ''}
                onClick={() => void publishTarget(target)}
              ><Eye />{publishing ? 'Đang công bố...' : !target.lastReportedAt ? 'Chưa có số liệu' : publicationCurrent ? 'Đã mới nhất' : target.isPublic ? 'Cập nhật công bố' : 'Công bố'}</button>}
              {isAdmin && <button className="btn secondary compact" disabled={Boolean(actionId)} onClick={() => void changeArchiveState(target, target.isArchived)}>{target.isArchived ? <ArchiveRestore /> : <Archive />}{target.isArchived ? 'Khôi phục' : 'Lưu trữ'}</button>}
            </div></td>
          </tr>;
        })}</tbody>
      </table></div> : <Empty title="Không tìm thấy chỉ tiêu" description="Hãy thay đổi bộ lọc hoặc năm kế hoạch." />}
    </div>

    {(modal === 'create' || modal === 'edit') && canCreate && <Modal title={modal === 'edit' ? `Chỉnh sửa ${selected?.code}` : 'Đặt chỉ tiêu mới'} onClose={closeModal} wide>
      <form className="form-grid" onSubmit={submitTarget}>
        {error && <div className="form-error full" role="alert">{error}</div>}
        <label>Mã chỉ tiêu<input required minLength={3} maxLength={50} pattern="[A-Za-z0-9._-]+" value={form.code} disabled={modal === 'edit'} onChange={event => setForm({ ...form, code: event.target.value.toUpperCase() })} placeholder="VD: CT-2026-011" /></label>
        <label>Năm kế hoạch<input type="number" required min="2000" max="2100" value={form.year} onChange={event => {
          const nextYear = event.target.value;
          const dueDate = /^\d{4}$/.test(nextYear) && /^\d{4}-\d{2}-\d{2}$/.test(form.dueDate)
            ? `${nextYear}${form.dueDate.slice(4)}`
            : form.dueDate;
          setForm({ ...form, year: nextYear, dueDate });
        }} /></label>
        <label className="full">Tên chỉ tiêu<input required minLength={3} maxLength={300} value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></label>
        <label className="full">Mô tả<textarea maxLength={2000} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label>
        <label>Phòng ban phụ trách<select required value={form.departmentId} onChange={event => setForm({ ...form, departmentId: event.target.value })}>
          <option value="">Chọn phòng ban</option>
          {departments.filter(department => department.isActive || department.id === selected?.department.id).map(department => <option key={department.id} value={department.id}>{department.name}{department.isActive ? '' : ' (đã ngừng)'}</option>)}
        </select></label>
        <label>Tần suất báo cáo dự kiến<select value={form.frequency} onChange={event => setForm({ ...form, frequency: event.target.value as TargetForm['frequency'] })}><option value="YEARLY">Hàng năm</option><option value="QUARTERLY">Hàng quý</option><option value="MONTHLY">Hàng tháng</option></select><small className="muted">Dùng để định hướng nhịp báo cáo; hệ thống luôn lưu giá trị thực hiện hiện hành mới nhất.</small></label>
        <label>Giá trị mục tiêu<input type="number" step="any" min="0" required value={form.targetValue} onChange={event => setForm({ ...form, targetValue: event.target.value })} /></label>
        <label>Đơn vị tính<input required minLength={1} maxLength={50} value={form.unit} onChange={event => setForm({ ...form, unit: event.target.value })} /></label>
        <label>Chiều đánh giá<select value={form.direction} onChange={event => setForm({ ...form, direction: event.target.value as TargetForm['direction'] })}><option value="HIGHER_IS_BETTER">Càng cao càng tốt</option><option value="LOWER_IS_BETTER">Càng thấp càng tốt</option></select></label>
        <label>Trọng số<input type="number" step="0.1" min="0.1" max="10" required value={form.weight} onChange={event => setForm({ ...form, weight: event.target.value })} /></label>
        <label>Hạn hoàn thành<input type="date" required min={`${form.year}-01-01`} max={`${form.year}-12-31`} value={form.dueDate} onChange={event => setForm({ ...form, dueDate: event.target.value })} /><small className="muted">Hạn phải nằm trong năm kế hoạch {form.year || 'đã chọn'}.</small></label>
        <label>Thứ tự trên trang công khai<input type="number" min="0" step="1" required value={form.publicOrder} onChange={event => setForm({ ...form, publicOrder: event.target.value })} /></label>
        <label className="check-field full"><input type="checkbox" checked={form.isHighlighted} onChange={event => setForm({ ...form, isHighlighted: event.target.checked })} /><span><Star /> Đánh dấu là chỉ tiêu nổi bật khi công bố</span></label>
        <div className="permission-note full"><Eye /><div><strong>{selected?.isPublic ? 'Chỉ tiêu đang được công khai' : 'Dữ liệu chưa tự động công khai'}</strong><p>Cấu hình nổi bật và thứ tự được lưu trước. Nút “Công bố” tạo một bản chụp số liệu chính thức cho người dân; sau khi sửa, hãy công bố lại để áp dụng thay đổi.</p></div></div>
        {departmentChangeBlocked && <div className="permission-note warning full"><AlertTriangle /><div><strong>Không thể chuyển đơn vị lúc này</strong><p>Chỉ tiêu còn {selected?.pendingUpdates} báo cáo chờ duyệt. Hãy chọn lại đơn vị hiện tại hoặc xử lý hết báo cáo trước khi chuyển.</p></div></div>}
        <div className="modal-actions full"><button type="button" className="btn secondary" disabled={submitting} onClick={closeModal}>Hủy</button><button className="btn primary" disabled={submitting || !form.departmentId || departmentChangeBlocked}>{submitting ? 'Đang lưu...' : modal === 'edit' ? 'Lưu thay đổi' : 'Tạo và giao chỉ tiêu'}</button></div>
      </form>
    </Modal>}

    {modal === 'progress' && selected && <Modal title="Báo cáo kết quả thực hiện" onClose={closeModal}>
      <form className="form-grid single" onSubmit={submitProgress}>
        <div className="target-preview"><span>{selected.code}</span><strong>{selected.title}</strong><p>Hiện tại: {selected.currentValue.toLocaleString('vi-VN')} · Mục tiêu: {selected.targetValue.toLocaleString('vi-VN')} {selected.unit} · Phiên bản {selected.version}</p></div>
        {user?.role !== 'ADMIN' && <div className="permission-note"><ClipboardCheck /><div><strong>Cần người có thẩm quyền duyệt</strong><p>Số liệu chỉ trở thành kết quả chính thức sau khi được phê duyệt; người gửi không thể tự duyệt.</p></div></div>}
        {error && <div className="form-error full" role="alert">{error}</div>}
        <label className="full">Giá trị thực hiện mới<input type="number" inputMode="decimal" step="any" min="0" max="100" required value={progress.value} onChange={event => setProgress({ ...progress, value: event.target.value })} /><small className="muted">Nhập giá trị từ 0 đến 100. Bạn có thể xóa toàn bộ để nhập lại.</small></label>
        <label className="full">Nguồn số liệu / ghi chú<textarea required value={progress.note} onChange={event => setProgress({ ...progress, note: event.target.value })} placeholder="Nêu kỳ báo cáo và nguồn đối chiếu..." /></label>
        <div className="modal-actions full"><button type="button" className="btn secondary" disabled={submitting} onClick={closeModal}>Hủy</button><button className="btn primary" disabled={submitting}>{submitting ? 'Đang gửi...' : user?.role === 'ADMIN' ? 'Xác nhận cập nhật' : 'Gửi chờ duyệt'}</button></div>
      </form>
    </Modal>}
  </>;
}
