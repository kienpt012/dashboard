import { Bot, RotateCcw, Send } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { PageHead, Spinner } from '../components/UI';
import type { CopilotCandidateRow, CopilotDocumentRow, CopilotPendingAction, CopilotPreviewRow, CopilotResponse, CopilotResultRow, CopilotTargetRow } from '../types';
import '../copilot.css';

const suggestions = [
  'Tình hình thực hiện năm 2026',
  'Chỉ tiêu nào sắp trễ hạn?',
  'Chỉ tiêu nào dưới 70%?',
  'Chỉ tiêu nào chưa có số liệu?',
  'Có đề xuất nào chờ xác minh không?',
  'Tìm kế hoạch kinh tế xã hội',
  'Duyệt hết đề xuất trong phụ lục 1',
];

/** Trạng thái vòng đời của thanh xác nhận hành động ghi trong một bong bóng trả lời. */
type ActionStatus = 'pending' | 'confirming' | 'cancelling' | 'executed' | 'cancelled' | 'processed';

type ChatMessage =
  | { id: number; role: 'user'; text: string }
  | { id: number; role: 'assistant'; kind: 'pending' }
  | { id: number; role: 'assistant'; kind: 'error'; text: string }
  | { id: number; role: 'assistant'; kind: 'answer'; answer: CopilotResponse; actionStatus?: ActionStatus };

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function progressTone(value: number) {
  return value >= 70 ? 'green' : value >= 40 ? 'amber' : 'red';
}

function confidencePercent(value: number) {
  return `${Math.max(0, Math.min(100, Math.round(value * 100)))}%`;
}

function TargetTable({ rows }: { rows: CopilotTargetRow[] }) {
  return <div className="cop-table-wrap"><table className="cop-table">
    <thead><tr><th>Mã</th><th>Chỉ tiêu</th><th>Đơn vị phụ trách</th><th>Tiến độ</th><th>Trạng thái</th></tr></thead>
    <tbody>{rows.map((row, index) => <tr key={`${row.code}-${index}`}>
      <td><span className="code">{row.code}</span></td>
      <td className="cop-cell-title">{row.title}</td>
      <td>{row.department}</td>
      <td>{typeof row.progress === 'number'
        ? <div className="cop-progress"><div className="cop-progress-bar"><i className={progressTone(row.progress)} style={{ width: `${clampPercent(row.progress)}%` }} /></div><b>{clampPercent(row.progress)}%</b></div>
        : <span className="cop-muted">—</span>}</td>
      <td>{row.status
        ? row.status
        : row.lastReportedAt
          ? <span className="cop-muted">Cập nhật {new Date(row.lastReportedAt).toLocaleDateString('vi-VN')}</span>
          : <span className="cop-muted">Chưa có số liệu</span>}</td>
    </tr>)}</tbody>
  </table></div>;
}

function DocumentTable({ rows }: { rows: CopilotDocumentRow[] }) {
  return <div className="cop-table-wrap"><table className="cop-table">
    <thead><tr><th>Mã</th><th>Tiêu đề</th><th>Số VB</th><th>Đề xuất</th></tr></thead>
    <tbody>{rows.map(row => <tr key={row.id}>
      <td><span className="code">{row.code}</span></td>
      <td className="cop-cell-title">{row.title}</td>
      <td>{row.docNumber || <span className="cop-muted">—</span>}</td>
      <td><Link className="cop-link" to={`/admin/documents/${row.id}`}>{row.candidates} đề xuất</Link></td>
    </tr>)}</tbody>
  </table></div>;
}

function CandidateTable({ rows }: { rows: CopilotCandidateRow[] }) {
  return <div className="cop-table-wrap"><table className="cop-table">
    <thead><tr><th>Tên đề xuất</th><th>Giá trị</th><th>Độ tin cậy</th><th>Phương pháp</th><th>Văn bản</th></tr></thead>
    <tbody>{rows.map((row, index) => <tr key={`${row.documentId}-${index}`}>
      <td className="cop-cell-title">{row.name}</td>
      <td>{typeof row.value === 'number' ? `${row.value.toLocaleString('vi-VN')}${row.unit ? ` ${row.unit}` : ''}` : <span className="cop-muted">—</span>}</td>
      <td>{confidencePercent(row.confidence)}</td>
      <td><span className={`cop-method ${row.method === 'LLM' ? 'ai' : 'rule'}`}>{row.method === 'LLM' ? 'AI' : 'Luật'}</span></td>
      <td><Link className="cop-link" to={`/admin/documents/${row.documentId}`}>{row.documentCode}</Link></td>
    </tr>)}</tbody>
  </table></div>;
}

function PreviewTable({ rows }: { rows: CopilotPreviewRow[] }) {
  return <div className="cop-table-wrap"><table className="cop-table">
    <thead><tr><th>Tên chỉ tiêu</th><th>Giá trị</th><th>Phòng ban</th><th>Độ tin cậy</th></tr></thead>
    <tbody>{rows.map((row, index) => <tr key={`${row.name}-${index}`}>
      <td className="cop-cell-title">{row.name}</td>
      <td>{typeof row.value === 'number' ? `${row.value.toLocaleString('vi-VN')}${row.unit ? ` ${row.unit}` : ''}` : <span className="cop-muted">—</span>}</td>
      <td>{row.department || <span className="cop-muted">—</span>}</td>
      <td>{confidencePercent(row.confidence)}</td>
    </tr>)}</tbody>
  </table></div>;
}

function ResultsTable({ rows }: { rows: CopilotResultRow[] }) {
  return <div className="cop-table-wrap"><table className="cop-table">
    <thead><tr><th>Tên</th><th>Kết quả</th></tr></thead>
    <tbody>{rows.map((row, index) => <tr key={`${row.name}-${index}`}>
      <td className="cop-cell-title">{row.name}</td>
      <td>{row.ok
        ? <span className="cop-result ok">✓ {row.code ?? 'Đã duyệt'}</span>
        : <span className="cop-result fail">✗ {row.error ?? 'Lỗi không xác định'}</span>}</td>
    </tr>)}</tbody>
  </table></div>;
}

const actionDoneLabels: Partial<Record<ActionStatus, string>> = {
  executed: 'Đã thực hiện',
  cancelled: 'Đã hủy',
  processed: 'Hết hạn / đã xử lý',
};

function ConfirmBar({ action, status, onConfirm, onCancel }: {
  action: CopilotPendingAction;
  status: ActionStatus;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const expiresAt = new Date(action.expiresAt);
  const doneLabel = actionDoneLabels[status];
  if (doneLabel) return <div className="cop-confirm-bar done"><span className="cop-confirm-done">{doneLabel}</span></div>;
  if (status === 'pending' && Date.now() > expiresAt.getTime()) {
    return <div className="cop-confirm-bar done"><span className="cop-confirm-done">Đã hết hạn</span></div>;
  }
  const busy = status === 'confirming' || status === 'cancelling';
  return <div className="cop-confirm-bar">
    <span className="cop-confirm-text">Hành động chờ xác nhận · hết hạn {expiresAt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
    <div className="cop-confirm-actions">
      <button type="button" className="btn primary cop-confirm-btn" disabled={busy} onClick={onConfirm}>Xác nhận duyệt {action.approveCount} chỉ tiêu</button>
      <button type="button" className="btn secondary cop-confirm-btn" disabled={busy} onClick={onCancel}>Hủy</button>
    </div>
    {busy && <span className="cop-confirm-busy"><Spinner />{status === 'confirming' ? 'Đang thực thi...' : 'Đang hủy...'}</span>}
  </div>;
}

function AnswerBubble({ answer, bubbleId, actionStatus, onConfirm, onCancel }: {
  answer: CopilotResponse;
  bubbleId: number;
  actionStatus?: ActionStatus;
  onConfirm: (bubbleId: number, actionId: string) => void;
  onCancel: (bubbleId: number, actionId: string) => void;
}) {
  const pending = answer.pendingAction;
  return <div className="cop-bubble assistant">
    <p className="cop-reply">{answer.reply}</p>
    {answer.rowType === 'targets' && answer.rows.length > 0 && <TargetTable rows={answer.rows} />}
    {answer.rowType === 'documents' && answer.rows.length > 0 && <DocumentTable rows={answer.rows} />}
    {answer.rowType === 'candidates' && answer.rows.length > 0 && <CandidateTable rows={answer.rows} />}
    {answer.rowType === 'preview' && answer.rows.length > 0 && <PreviewTable rows={answer.rows} />}
    {answer.rowType === 'results' && answer.rows.length > 0 && <ResultsTable rows={answer.rows} />}
    {pending && <ConfirmBar
      action={pending}
      status={actionStatus ?? 'pending'}
      onConfirm={() => onConfirm(bubbleId, pending.id)}
      onCancel={() => onCancel(bubbleId, pending.id)}
    />}
    <span className="cop-source">Nguồn: {answer.source.tool} · {answer.planner === 'llm' ? 'Hiểu lệnh bằng AI' : 'Hiểu lệnh bằng từ khóa'}</span>
  </div>;
}

export default function Copilot() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messageId = useRef(0);
  const conversationId = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wasSending = useRef(false);

  useEffect(() => {
    if (wasSending.current && !sending) textareaRef.current?.focus();
    wasSending.current = sending;
  }, [sending]);

  useEffect(() => {
    const list = listRef.current;
    if (!list || !messages.length) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    list.scrollTo({ top: list.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
  }, [messages]);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 100)}px`;
  }, [input]);

  async function send(raw: string) {
    const text = raw.trim();
    if (text.length < 2 || sending) return;
    const conversation = conversationId.current;
    const userId = ++messageId.current;
    const pendingId = ++messageId.current;
    setMessages(previous => [...previous, { id: userId, role: 'user', text }, { id: pendingId, role: 'assistant', kind: 'pending' }]);
    setInput('');
    setSending(true);
    try {
      const answer = await api<CopilotResponse>('/copilot/messages', { method: 'POST', body: JSON.stringify({ message: text }) });
      if (conversation !== conversationId.current) return;
      setMessages(previous => previous.map(message => message.id === pendingId ? { id: pendingId, role: 'assistant', kind: 'answer', answer } : message));
    } catch (reason) {
      if (conversation !== conversationId.current) return;
      const detail = reason instanceof Error ? reason.message : 'Có lỗi xảy ra khi xử lý câu hỏi';
      setMessages(previous => previous.map(message => message.id === pendingId ? { id: pendingId, role: 'assistant', kind: 'error', text: detail } : message));
    } finally {
      if (conversation === conversationId.current) setSending(false);
    }
  }

  function setActionStatus(targetId: number, actionStatus: ActionStatus) {
    setMessages(previous => previous.map(message =>
      message.id === targetId && message.role === 'assistant' && message.kind === 'answer'
        ? { ...message, actionStatus }
        : message));
  }

  async function confirmAction(targetId: number, actionId: string) {
    const conversation = conversationId.current;
    setActionStatus(targetId, 'confirming');
    try {
      const answer = await api<CopilotResponse>(`/copilot/actions/${actionId}/confirm`, { method: 'POST' });
      if (conversation !== conversationId.current) return;
      const resultId = ++messageId.current;
      setMessages(previous => [
        ...previous.map(message => message.id === targetId && message.role === 'assistant' && message.kind === 'answer'
          ? { ...message, actionStatus: 'executed' as const }
          : message),
        { id: resultId, role: 'assistant', kind: 'answer', answer },
      ]);
    } catch (reason) {
      if (conversation !== conversationId.current) return;
      const processed = reason instanceof ApiError && (reason.status === 403 || reason.status === 409);
      const detail = reason instanceof Error ? reason.message : 'Có lỗi xảy ra khi thực thi hành động';
      const errorId = ++messageId.current;
      setMessages(previous => [
        ...previous.map(message => message.id === targetId && message.role === 'assistant' && message.kind === 'answer'
          ? { ...message, actionStatus: (processed ? 'processed' : 'pending') as ActionStatus }
          : message),
        { id: errorId, role: 'assistant', kind: 'error', text: detail },
      ]);
    }
  }

  async function cancelAction(targetId: number, actionId: string) {
    const conversation = conversationId.current;
    setActionStatus(targetId, 'cancelling');
    try {
      await api<{ cancelled: boolean }>(`/copilot/actions/${actionId}/cancel`, { method: 'POST' });
      if (conversation !== conversationId.current) return;
      setActionStatus(targetId, 'cancelled');
    } catch (reason) {
      if (conversation !== conversationId.current) return;
      const processed = reason instanceof ApiError && (reason.status === 403 || reason.status === 409);
      const detail = reason instanceof Error ? reason.message : 'Có lỗi xảy ra khi hủy hành động';
      const errorId = ++messageId.current;
      setMessages(previous => [
        ...previous.map(message => message.id === targetId && message.role === 'assistant' && message.kind === 'answer'
          ? { ...message, actionStatus: (processed ? 'processed' : 'pending') as ActionStatus }
          : message),
        { id: errorId, role: 'assistant', kind: 'error', text: detail },
      ]);
    }
  }

  function resetConversation() {
    conversationId.current += 1;
    setMessages([]);
    setInput('');
    setSending(false);
    textareaRef.current?.focus();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void send(input);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void send(input);
  }

  return <>
    <PageHead
      eyebrow="TRỢ LÝ ĐIỀU HÀNH"
      title="IOC Copilot"
      description="Trợ lý tiếng Việt trả lời từ dữ liệu thật của hệ thống: mọi con số được truy vấn trực tiếp từ cơ sở dữ liệu và luôn kèm nguồn; các thao tác ghi dữ liệu vẫn thực hiện trên các màn hình nghiệp vụ."
      actions={<button type="button" className="btn secondary" onClick={resetConversation} disabled={!messages.length && !sending}><RotateCcw />Cuộc trò chuyện mới</button>}
    />

    <section className="panel cop-shell" aria-label="Hội thoại với IOC Copilot">
      <div ref={listRef} className="cop-messages" aria-live="polite">
        {!messages.length && <div className="cop-welcome">
          <div className="cop-welcome-icon" aria-hidden="true"><Bot /></div>
          <strong>Bắt đầu trò chuyện với IOC Copilot</strong>
          <p>Đặt câu hỏi bằng tiếng Việt về tiến độ chỉ tiêu, cảnh báo trễ hạn, văn bản trong kho hoặc đề xuất AI đang chờ xác minh. Bạn cũng có thể chọn nhanh một gợi ý bên dưới.</p>
        </div>}
        {messages.map(message => message.role === 'user'
          ? <div key={message.id} className="cop-row user"><div className="cop-bubble user">{message.text}</div></div>
          : <div key={message.id} className="cop-row assistant">
            <div className="cop-avatar" aria-hidden="true"><Bot /></div>
            {message.kind === 'pending' && <div className="cop-bubble assistant cop-pending"><Spinner /><span>Đang phân tích và truy vấn dữ liệu...</span></div>}
            {message.kind === 'error' && <div className="cop-bubble assistant cop-error" role="alert">
              <strong>Không thể xử lý câu hỏi</strong>
              <p>{message.text}</p>
              <p className="cop-error-hint">Vui lòng gửi lại hoặc diễn đạt câu hỏi theo cách khác.</p>
            </div>}
            {message.kind === 'answer' && <AnswerBubble
              answer={message.answer}
              bubbleId={message.id}
              actionStatus={message.actionStatus}
              onConfirm={(bubbleId, actionId) => { void confirmAction(bubbleId, actionId); }}
              onCancel={(bubbleId, actionId) => { void cancelAction(bubbleId, actionId); }}
            />}
          </div>)}
      </div>

      <div className="cop-composer">
        <div className="cop-chips" aria-label="Câu hỏi gợi ý">
          {suggestions.map(suggestion => <button key={suggestion} type="button" className="cop-chip" disabled={sending} onClick={() => { setInput(suggestion); void send(suggestion); }}>{suggestion}</button>)}
        </div>
        <form className="cop-input-row" onSubmit={submit}>
          <textarea
            ref={textareaRef}
            rows={1}
            maxLength={1000}
            value={input}
            disabled={sending}
            onChange={event => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Nhập câu hỏi về chỉ tiêu, văn bản hoặc đề xuất AI..."
            aria-label="Câu hỏi gửi IOC Copilot"
          />
          <button type="submit" className="btn primary cop-send" disabled={sending || input.trim().length < 2} aria-label="Gửi câu hỏi"><Send /><span>Gửi</span></button>
        </form>
        <p className="cop-hint">Enter để gửi · Shift+Enter để xuống dòng · Câu hỏi phức tạp có thể mất đến một phút để phân tích.</p>
      </div>
    </section>
  </>;
}
