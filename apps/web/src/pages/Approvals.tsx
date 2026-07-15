import { AlertTriangle, Check, ClipboardCheck, RefreshCw, X } from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, auth } from '../api';
import { Empty, Modal, PageHead, Spinner } from '../components/UI';
import type { Department, Target } from '../types';

type PendingUpdate = {
  id: string;
  value: number;
  note?: string | null;
  baseVersion: number;
  createdAt: string;
  target: Target;
  user: { id: string; username: string; fullName: string };
  canReview?: boolean;
};

export default function Approvals() {
  const isAdmin = auth.user?.role === 'ADMIN';
  const [updates, setUpdates] = useState<PendingUpdate[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentId, setDepartmentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<PendingUpdate | null>(null);
  const [decision, setDecision] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const [reviewNote, setReviewNote] = useState('');
  const [saving, setSaving] = useState(false);
  const loadRequestId = useRef(0);

  async function load() {
    const requestId = ++loadRequestId.current;
    setLoading(true);
    setError('');
    try {
      const query = departmentId ? `?departmentId=${encodeURIComponent(departmentId)}` : '';
      const requests: Promise<any>[] = [api(`/targets/pending-updates${query}`)];
      if (isAdmin) requests.push(api('/departments'));
      const [rows, departmentRows] = await Promise.all(requests);
      if (requestId !== loadRequestId.current) return;
      setUpdates(rows);
      if (isAdmin && departmentRows) setDepartments(departmentRows);
    } catch (reason: unknown) {
      if (requestId === loadRequestId.current) setError(reason instanceof Error ? reason.message : 'Không thể tải danh sách chờ duyệt');
    } finally {
      if (requestId === loadRequestId.current) setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [departmentId]);

  function openReview(update: PendingUpdate, nextDecision: 'APPROVE' | 'REJECT') {
    setSelected(update);
    setDecision(nextDecision);
    setReviewNote('');
    setError('');
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    if (decision === 'REJECT' && !reviewNote.trim()) {
      setError('Vui lòng ghi rõ lý do từ chối để người báo cáo có thể sửa.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api(`/targets/updates/${selected.id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({ decision, reviewNote }),
      });
      setSelected(null);
      setNotice(decision === 'APPROVE' ? 'Đã duyệt và cập nhật số liệu chính thức.' : 'Đã trả lại báo cáo cho người gửi.');
      await load();
    } catch (reason: any) {
      setError(reason.message);
    } finally {
      setSaving(false);
    }
  }

  return <>
    <PageHead
      eyebrow="KIỂM SOÁT SỐ LIỆU"
      title="Báo cáo chờ duyệt"
      description={isAdmin
        ? 'Đối chiếu nguồn số liệu trước khi ghi nhận vào kết quả chính thức của hệ thống.'
        : `Chỉ hiển thị báo cáo thuộc ${auth.user?.department?.name || 'đơn vị của bạn'}.`}
      actions={<button className="btn secondary" disabled={loading} onClick={() => void load()}><RefreshCw />Làm mới</button>}
    />
    {notice && <div className="notice success"><ClipboardCheck />{notice}<button onClick={() => setNotice('')}><X /></button></div>}
    {isAdmin && <div className="toolbar scope-toolbar"><select aria-label="Lọc báo cáo chờ duyệt theo phòng ban" disabled={loading} value={departmentId} onChange={event => setDepartmentId(event.target.value)}><option value="">Tất cả phòng ban</option>{departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</select></div>}
    {error && !selected && <div className="notice error" role="alert">{error}<button onClick={() => void load()}>Thử lại</button></div>}
    <div className="table-card">
      <div className="table-summary"><span><b>{updates.length}</b> báo cáo đang chờ xử lý</span><span>Duyệt theo thứ tự gửi sớm nhất</span></div>
      {loading ? <Spinner /> : updates.length ? <div className="table-wrap"><table>
        <thead><tr><th>Chỉ tiêu</th><th>Người báo cáo</th><th>Số liệu đề xuất</th><th>Thời gian gửi</th><th>Kiểm tra phiên bản</th><th>Quyết định</th></tr></thead>
        <tbody>{updates.map(update => {
          const stale = update.baseVersion !== update.target.version;
          return <tr key={update.id}>
            <td><span className="code">{update.target.code}</span><strong className="block">{update.target.title}</strong><small>{update.target.department.name}</small></td>
            <td><strong className="block">{update.user.fullName}</strong><span className="muted">@{update.user.username}</span></td>
            <td><strong>{update.value.toLocaleString('vi-VN')} {update.target.unit}</strong><small className="block">Hiện tại: {update.target.currentValue.toLocaleString('vi-VN')} {update.target.unit}</small>{update.note && <small className="block review-note">{update.note}</small>}</td>
            <td>{new Date(update.createdAt).toLocaleString('vi-VN')}</td>
            <td>{stale ? <span className="status red"><i />Dữ liệu đã thay đổi</span> : <span className="status green"><i />Phiên bản {update.baseVersion}</span>}</td>
            <td>{update.canReview === false ? <span className="status amber"><i />Chờ quản trị viên</span> : <div className="approval-actions"><button className="btn secondary compact danger-text" onClick={() => openReview(update, 'REJECT')}><X />Từ chối</button><button className="btn primary compact" disabled={stale} onClick={() => openReview(update, 'APPROVE')}><Check />Duyệt</button></div>}</td>
          </tr>;
        })}</tbody>
      </table></div> : <Empty title="Không có báo cáo chờ duyệt" description="Tất cả số liệu gửi lên đã được xử lý." />}
    </div>

    {selected && <Modal title={decision === 'APPROVE' ? 'Xác nhận duyệt số liệu' : 'Trả lại báo cáo'} onClose={() => setSelected(null)}>
      <form className="form-grid single" onSubmit={submit}>
        <div className="target-preview"><span>{selected.target.code}</span><strong>{selected.target.title}</strong><p>{selected.user.fullName} đề xuất {selected.value.toLocaleString('vi-VN')} {selected.target.unit}</p></div>
        {decision === 'APPROVE' ? <div className="permission-note"><ClipboardCheck /><div><strong>Số liệu sẽ trở thành chính thức</strong><p>Hệ thống sẽ tăng phiên bản và ghi đầy đủ người duyệt, thời gian duyệt.</p></div></div> : <div className="permission-note warning"><AlertTriangle /><div><strong>Người gửi cần báo cáo lại</strong><p>Lý do từ chối sẽ được lưu trong lịch sử để đối chiếu.</p></div></div>}
        {error && <div className="form-error full">{error}</div>}
        <label className="full">{decision === 'REJECT' ? 'Lý do từ chối' : 'Ghi chú duyệt (không bắt buộc)'}<textarea required={decision === 'REJECT'} value={reviewNote} onChange={event => setReviewNote(event.target.value)} /></label>
        <div className="modal-actions full"><button type="button" className="btn secondary" onClick={() => setSelected(null)}>Hủy</button><button className={`btn ${decision === 'APPROVE' ? 'primary' : 'danger'}`} disabled={saving}>{saving ? 'Đang xử lý...' : decision === 'APPROVE' ? 'Duyệt số liệu' : 'Trả lại báo cáo'}</button></div>
      </form>
    </Modal>}
  </>;
}
