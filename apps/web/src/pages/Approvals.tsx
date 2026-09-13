import { AlertTriangle, ArrowRight, Check, ClipboardCheck, Filter, RefreshCw, X } from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, auth } from '../api';
import { Empty, Modal, PageHead, SkeletonTable } from '../components/UI';
import { toast } from '../components/Toast';
import type { Department, Target } from '../types';
import '../styles/dashboard.css';

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
      toast.ok(decision === 'APPROVE' ? 'Đã duyệt và cập nhật số liệu chính thức.' : 'Đã trả lại báo cáo cho người gửi.');
      await load();
    } catch (reason: any) {
      setError(reason.message);
      toast.error(decision === 'APPROVE' ? 'Không duyệt được số liệu' : 'Không trả lại được báo cáo', reason.message);
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
      actions={<button className="btn secondary" disabled={loading} onClick={() => void load()}><RefreshCw className={loading ? 'spin' : undefined} />Làm mới</button>}
    />

    {error && !selected && <div className="form-error load-error" role="alert">
      <span>{error}</span>
      <button type="button" className="btn sm secondary" disabled={loading} onClick={() => void load()}>Thử lại</button>
    </div>}

    {/* Bộ lọc phạm vi: chỉ quản trị viên mới duyệt được nhiều phòng ban. */}
    {isAdmin && <div className="toolbar approval-toolbar">
      <span className="toolbar-caption"><Filter aria-hidden="true" />Phạm vi duyệt</span>
      <select aria-label="Lọc báo cáo chờ duyệt theo phòng ban" disabled={loading} value={departmentId} onChange={event => setDepartmentId(event.target.value)}>
        <option value="">Tất cả phòng ban</option>
        {departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}
      </select>
    </div>}

    {loading ? <SkeletonTable rows={5} /> : <section className="panel flush" aria-label="Hàng đợi báo cáo chờ duyệt">
      <div className="table-summary queue-summary">
        <span><b>{updates.length}</b> báo cáo đang chờ duyệt</span>
        <span>Duyệt theo thứ tự gửi sớm nhất</span>
      </div>
      {updates.length ? <div className="table-wrap tall"><table className="approval-table stack-table">
        <thead><tr><th>Chỉ tiêu</th><th>Người báo cáo</th><th>Số liệu đề xuất</th><th>Thời gian gửi</th><th>Kiểm tra phiên bản</th><th>Quyết định</th></tr></thead>
        <tbody>{updates.map(update => {
          const stale = update.baseVersion !== update.target.version;
          return <tr key={update.id}>
            <td data-label="Chỉ tiêu">
              <div className="cell-target">
                <span className="code">{update.target.code}</span>
                <strong>{update.target.title}</strong>
                <span>{update.target.department.name}</span>
              </div>
            </td>
            <td data-label="Người báo cáo">
              <div className="cell-person">
                <strong>{update.user.fullName}</strong>
                <span>@{update.user.username}</span>
              </div>
            </td>
            <td data-label="Số liệu đề xuất">
              <div className="value-delta">
                <div className="from"><span>Hiện tại</span><b>{update.target.currentValue.toLocaleString('vi-VN')} {update.target.unit}</b></div>
                <ArrowRight aria-hidden="true" />
                <div className="to"><span>Đề xuất</span><b>{update.value.toLocaleString('vi-VN')} {update.target.unit}</b></div>
              </div>
              {update.note && <small className="review-note">{update.note}</small>}
            </td>
            <td data-label="Thời gian gửi"><time dateTime={update.createdAt}>{new Date(update.createdAt).toLocaleString('vi-VN')}</time></td>
            <td data-label="Kiểm tra phiên bản">{stale
              ? <span className="status bad">Dữ liệu đã thay đổi</span>
              : <span className="status ok">Phiên bản {update.baseVersion}</span>}</td>
            <td data-label="Quyết định">{update.canReview === false
              ? <span className="status warn">Chờ quản trị viên</span>
              : <div className="approval-actions">
                  <button type="button" className="btn secondary sm danger-text" onClick={() => openReview(update, 'REJECT')}><X />Từ chối</button>
                  <button type="button" className="btn primary sm" disabled={stale} title={stale ? 'Dữ liệu đã thay đổi' : undefined} onClick={() => openReview(update, 'APPROVE')}><Check />Duyệt</button>
                </div>}</td>
          </tr>;
        })}</tbody>
      </table></div> : <Empty showIcon={false} title="Không có báo cáo chờ duyệt" description="Tất cả báo cáo chờ duyệt đã được xử lý." />}
    </section>}

    {selected && <Modal title={decision === 'APPROVE' ? 'Xác nhận duyệt số liệu' : 'Trả lại báo cáo'} onClose={() => setSelected(null)}>
      <form className="form-grid" onSubmit={submit}>
        <div className="target-preview">
          <span>{selected.target.code}</span>
          <strong>{selected.target.title}</strong>
          <p>{selected.user.fullName} đề xuất {selected.value.toLocaleString('vi-VN')} {selected.target.unit}</p>
        </div>
        {decision === 'APPROVE'
          ? <div className="permission-note"><ClipboardCheck aria-hidden="true" /><div><strong>Số liệu sẽ trở thành chính thức</strong><p>Hệ thống sẽ tăng phiên bản và ghi đầy đủ người duyệt, thời gian duyệt.</p></div></div>
          : <div className="permission-note warning"><AlertTriangle aria-hidden="true" /><div><strong>Người gửi cần báo cáo lại</strong><p>Lý do từ chối sẽ được lưu trong lịch sử để đối chiếu.</p></div></div>}
        {error && <div className="form-error full" role="alert">{error}</div>}
        <label className="full">{decision === 'REJECT' ? 'Lý do từ chối' : 'Ghi chú duyệt (không bắt buộc)'}<textarea required={decision === 'REJECT'} value={reviewNote} onChange={event => setReviewNote(event.target.value)} /></label>
        <div className="modal-actions full">
          <button type="button" className="btn secondary" onClick={() => setSelected(null)}>Hủy</button>
          <button className={`btn ${decision === 'APPROVE' ? 'primary' : 'danger'}`} disabled={saving}>{saving ? 'Đang xử lý...' : decision === 'APPROVE' ? 'Duyệt số liệu' : 'Trả lại báo cáo'}</button>
        </div>
      </form>
    </Modal>}
  </>;
}
