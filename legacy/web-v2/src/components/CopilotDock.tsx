import {
  Bot,
  Maximize2,
  Minimize2,
  RotateCcw,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import type {
  CopilotCandidateRow,
  CopilotDocumentRow,
  CopilotPendingAction,
  CopilotPreviewRow,
  CopilotResponse,
  CopilotResultRow,
  CopilotTargetRow,
} from '../types';

/* ============================================================================
   IOC Copilot — trợ lý điều hành dạng bảng nổi.

   Trước đây Copilot là một mục riêng trên thanh bên: muốn hỏi một câu thì phải rời
   màn hình đang làm dở, hỏi xong lại quay về và mất ngữ cảnh. Nay trợ lý nằm trong
   một bảng trượt gắn ở mọi màn hình quản trị: mở bằng nút nổi hoặc Ctrl + J, hội
   thoại được giữ nguyên khi chuyển trang vì thành phần này sống ở cấp vỏ ứng dụng.

   Toàn bộ logic hội thoại (xem trước hành động, xác nhận, huỷ, bảng kết quả, dòng
   nguồn dữ liệu) giữ nguyên như bản cũ — chỉ đổi nơi hiển thị.
   ========================================================================== */

const suggestions = [
  'Tình hình thực hiện năm 2026',
  'Chỉ tiêu nào sắp trễ hạn?',
  'Chỉ tiêu nào dưới 70%?',
  'Chỉ tiêu nào chưa có số liệu?',
  'Có đề xuất nào chờ xác minh không?',
  'Tìm kế hoạch kinh tế xã hội',
];

const WIDTH_KEY = 'ioc_copilot_width';
const MIN_WIDTH = 360;
const MAX_WIDTH = 760;

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
  return (
    <div className="cop-table-wrap">
      <table className="cop-table">
        <thead>
          <tr>
            <th>Mã</th>
            <th>Chỉ tiêu</th>
            <th>Đơn vị phụ trách</th>
            <th>Tiến độ</th>
            <th>Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.code}-${index}`}>
              <td>
                <span className="code">{row.code}</span>
              </td>
              <td className="cop-cell-title">{row.title}</td>
              <td>{row.department}</td>
              <td>
                {typeof row.progress === 'number' ? (
                  <div className="cop-progress">
                    <div className="cop-progress-bar">
                      <i className={progressTone(row.progress)} style={{ width: `${clampPercent(row.progress)}%` }} />
                    </div>
                    <b>{clampPercent(row.progress)}%</b>
                  </div>
                ) : (
                  <span className="cop-muted">—</span>
                )}
              </td>
              <td>
                {row.status ? (
                  row.status
                ) : row.lastReportedAt ? (
                  <span className="cop-muted">Cập nhật {new Date(row.lastReportedAt).toLocaleDateString('vi-VN')}</span>
                ) : (
                  <span className="cop-muted">Chưa có số liệu</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DocumentTable({ rows }: { rows: CopilotDocumentRow[] }) {
  return (
    <div className="cop-table-wrap">
      <table className="cop-table">
        <thead>
          <tr>
            <th>Mã</th>
            <th>Tiêu đề</th>
            <th>Số VB</th>
            <th>Đề xuất</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.id}>
              <td>
                <span className="code">{row.code}</span>
              </td>
              <td className="cop-cell-title">{row.title}</td>
              <td>{row.docNumber || <span className="cop-muted">—</span>}</td>
              <td>
                <Link className="cop-link" to={`/admin/documents/${row.id}`}>
                  {row.candidates} đề xuất
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CandidateTable({ rows }: { rows: CopilotCandidateRow[] }) {
  return (
    <div className="cop-table-wrap">
      <table className="cop-table">
        <thead>
          <tr>
            <th>Tên đề xuất</th>
            <th>Giá trị</th>
            <th>Độ tin cậy</th>
            <th>Phương pháp</th>
            <th>Văn bản</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.documentId}-${index}`}>
              <td className="cop-cell-title">{row.name}</td>
              <td>
                {typeof row.value === 'number' ? (
                  `${row.value.toLocaleString('vi-VN')}${row.unit ? ` ${row.unit}` : ''}`
                ) : (
                  <span className="cop-muted">—</span>
                )}
              </td>
              <td>{confidencePercent(row.confidence)}</td>
              <td>
                <span className={`cop-method ${row.method === 'LLM' ? 'ai' : 'rule'}`}>
                  {row.method === 'LLM' ? 'AI' : 'Luật'}
                </span>
              </td>
              <td>
                <Link className="cop-link" to={`/admin/documents/${row.documentId}`}>
                  {row.documentCode}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PreviewTable({ rows }: { rows: CopilotPreviewRow[] }) {
  return (
    <div className="cop-table-wrap">
      <table className="cop-table">
        <thead>
          <tr>
            <th>Tên chỉ tiêu</th>
            <th>Giá trị</th>
            <th>Phòng ban</th>
            <th>Độ tin cậy</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.name}-${index}`}>
              <td className="cop-cell-title">{row.name}</td>
              <td>
                {typeof row.value === 'number' ? (
                  `${row.value.toLocaleString('vi-VN')}${row.unit ? ` ${row.unit}` : ''}`
                ) : (
                  <span className="cop-muted">—</span>
                )}
              </td>
              <td>{row.department || <span className="cop-muted">—</span>}</td>
              <td>{confidencePercent(row.confidence)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResultsTable({ rows }: { rows: CopilotResultRow[] }) {
  return (
    <div className="cop-table-wrap">
      <table className="cop-table">
        <thead>
          <tr>
            <th>Tên</th>
            <th>Kết quả</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.name}-${index}`}>
              <td className="cop-cell-title">{row.name}</td>
              <td>
                {row.ok ? (
                  <span className="cop-result ok">✓ {row.code ?? 'Đã duyệt'}</span>
                ) : (
                  <span className="cop-result fail">✗ {row.error ?? 'Lỗi không xác định'}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const actionDoneLabels: Partial<Record<ActionStatus, string>> = {
  executed: 'Đã thực hiện',
  cancelled: 'Đã hủy',
  processed: 'Hết hạn / đã xử lý',
};

function ConfirmBar({
  action,
  status,
  onConfirm,
  onCancel,
}: {
  action: CopilotPendingAction;
  status: ActionStatus;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const expiresAt = new Date(action.expiresAt);
  const doneLabel = actionDoneLabels[status];
  if (doneLabel) {
    return (
      <div className="cop-confirm-bar done">
        <span className="cop-confirm-done">{doneLabel}</span>
      </div>
    );
  }
  if (status === 'pending' && Date.now() > expiresAt.getTime()) {
    return (
      <div className="cop-confirm-bar done">
        <span className="cop-confirm-done">Đã hết hạn</span>
      </div>
    );
  }
  const busy = status === 'confirming' || status === 'cancelling';
  return (
    <div className="cop-confirm-bar">
      <span className="cop-confirm-text">
        Hành động chờ xác nhận · hết hạn{' '}
        {expiresAt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
      </span>
      <div className="cop-confirm-actions">
        <button type="button" className="btn primary sm cop-confirm-btn" disabled={busy} onClick={onConfirm}>
          Xác nhận duyệt {action.approveCount} chỉ tiêu
        </button>
        <button type="button" className="btn secondary sm cop-confirm-btn" disabled={busy} onClick={onCancel}>
          Hủy
        </button>
      </div>
      {busy && (
        <span className="cop-confirm-busy">
          <i className="spinner" aria-hidden="true" />
          {status === 'confirming' ? 'Đang thực thi...' : 'Đang hủy...'}
        </span>
      )}
    </div>
  );
}

function AnswerBubble({
  answer,
  bubbleId,
  actionStatus,
  onConfirm,
  onCancel,
}: {
  answer: CopilotResponse;
  bubbleId: number;
  actionStatus?: ActionStatus;
  onConfirm: (bubbleId: number, actionId: string) => void;
  onCancel: (bubbleId: number, actionId: string) => void;
}) {
  const pending = answer.pendingAction;
  return (
    <div className="cop-bubble assistant">
      <p className="cop-reply">{answer.reply}</p>
      {answer.rowType === 'targets' && answer.rows.length > 0 && <TargetTable rows={answer.rows} />}
      {answer.rowType === 'documents' && answer.rows.length > 0 && <DocumentTable rows={answer.rows} />}
      {answer.rowType === 'candidates' && answer.rows.length > 0 && <CandidateTable rows={answer.rows} />}
      {answer.rowType === 'preview' && answer.rows.length > 0 && <PreviewTable rows={answer.rows} />}
      {answer.rowType === 'results' && answer.rows.length > 0 && <ResultsTable rows={answer.rows} />}
      {pending && (
        <ConfirmBar
          action={pending}
          status={actionStatus ?? 'pending'}
          onConfirm={() => onConfirm(bubbleId, pending.id)}
          onCancel={() => onCancel(bubbleId, pending.id)}
        />
      )}
      <span className="cop-source">
        Nguồn: {answer.source.tool} · {answer.planner === 'llm' ? 'Hiểu lệnh bằng AI' : 'Hiểu lệnh bằng từ khóa'}
      </span>
    </div>
  );
}

export default function CopilotDock({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [width, setWidth] = useState(() => {
    const stored = Number(localStorage.getItem(WIDTH_KEY));
    return Number.isFinite(stored) && stored >= MIN_WIDTH && stored <= MAX_WIDTH ? stored : 420;
  });

  const messageId = useRef(0);
  const conversationId = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const wasSending = useRef(false);
  const openRef = useRef(open);
  openRef.current = open;

  /* ---- Mở / đóng -------------------------------------------------------- */
  const close = useCallback(() => {
    onOpenChange(false);
    window.setTimeout(() => fabRef.current?.focus(), 0);
  }, [onOpenChange]);

  useEffect(() => {
    if (open) setUnread(false);
  }, [open, messages]);

  /* Công bố chiều rộng thật của bảng ra biến toàn cục, để vỏ ứng dụng biết cần chừa
     bao nhiêu chỗ bên phải khi màn hình đủ rộng. */
  useEffect(() => {
    document.documentElement.style.setProperty('--dock-live-width', expanded ? '980px' : `${width}px`);
  }, [width, expanded]);

  // Phím tắt: Ctrl/⌘ + J bật tắt, Ctrl/⌘ + Shift + J bắt đầu cuộc trò chuyện mới.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'j') return;
      event.preventDefault();
      if (event.shiftKey) {
        resetConversation();
        onOpenChange(true);
        return;
      }
      onOpenChange(!openRef.current);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // resetConversation giữ nguyên tham chiếu trong suốt vòng đời thành phần.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onOpenChange]);

  // Esc đóng bảng khi tiêu điểm đang ở trong bảng.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (!panelRef.current?.contains(document.activeElement)) return;
      event.preventDefault();
      close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  useEffect(() => {
    if (open) window.setTimeout(() => textareaRef.current?.focus(), 220);
  }, [open]);

  /* ---- Kéo giãn chiều rộng ---------------------------------------------- */
  const startResize = (event: React.PointerEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const move = (moveEvent: PointerEvent) => {
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + (startX - moveEvent.clientX)));
      setWidth(next);
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      setWidth(current => {
        localStorage.setItem(WIDTH_KEY, String(current));
        return current;
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };

  /* ---- Hội thoại --------------------------------------------------------- */
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
    element.style.height = `${Math.min(element.scrollHeight, 120)}px`;
  }, [input]);

  async function send(raw: string) {
    const text = raw.trim();
    if (text.length < 2 || sending) return;
    const conversation = conversationId.current;
    const userId = ++messageId.current;
    const pendingId = ++messageId.current;
    setMessages(previous => [
      ...previous,
      { id: userId, role: 'user', text },
      { id: pendingId, role: 'assistant', kind: 'pending' },
    ]);
    setInput('');
    setSending(true);
    try {
      const answer = await api<CopilotResponse>('/copilot/messages', {
        method: 'POST',
        body: JSON.stringify({ message: text }),
      });
      if (conversation !== conversationId.current) return;
      setMessages(previous =>
        previous.map(message =>
          message.id === pendingId ? { id: pendingId, role: 'assistant', kind: 'answer', answer } : message,
        ),
      );
      if (!openRef.current) setUnread(true);
    } catch (reason) {
      if (conversation !== conversationId.current) return;
      const detail = reason instanceof Error ? reason.message : 'Có lỗi xảy ra khi xử lý câu hỏi';
      setMessages(previous =>
        previous.map(message =>
          message.id === pendingId ? { id: pendingId, role: 'assistant', kind: 'error', text: detail } : message,
        ),
      );
      if (!openRef.current) setUnread(true);
    } finally {
      if (conversation === conversationId.current) setSending(false);
    }
  }

  function setActionStatus(targetId: number, actionStatus: ActionStatus) {
    setMessages(previous =>
      previous.map(message =>
        message.id === targetId && message.role === 'assistant' && message.kind === 'answer'
          ? { ...message, actionStatus }
          : message,
      ),
    );
  }

  async function confirmAction(targetId: number, actionId: string) {
    const conversation = conversationId.current;
    setActionStatus(targetId, 'confirming');
    try {
      const answer = await api<CopilotResponse>(`/copilot/actions/${actionId}/confirm`, { method: 'POST' });
      if (conversation !== conversationId.current) return;
      const resultId = ++messageId.current;
      setMessages(previous => [
        ...previous.map(message =>
          message.id === targetId && message.role === 'assistant' && message.kind === 'answer'
            ? { ...message, actionStatus: 'executed' as const }
            : message,
        ),
        { id: resultId, role: 'assistant', kind: 'answer', answer },
      ]);
    } catch (reason) {
      if (conversation !== conversationId.current) return;
      const processed = reason instanceof ApiError && (reason.status === 403 || reason.status === 409);
      const detail = reason instanceof Error ? reason.message : 'Có lỗi xảy ra khi thực thi hành động';
      const errorId = ++messageId.current;
      setMessages(previous => [
        ...previous.map(message =>
          message.id === targetId && message.role === 'assistant' && message.kind === 'answer'
            ? { ...message, actionStatus: (processed ? 'processed' : 'pending') as ActionStatus }
            : message,
        ),
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
        ...previous.map(message =>
          message.id === targetId && message.role === 'assistant' && message.kind === 'answer'
            ? { ...message, actionStatus: (processed ? 'processed' : 'pending') as ActionStatus }
            : message,
        ),
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

  return (
    <>
      <button
        ref={fabRef}
        type="button"
        className={`cop-fab${open ? ' open' : ''}${unread ? ' unread' : ''}`}
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-controls="ioc-copilot-dock"
        aria-label={open ? 'Đóng IOC Copilot' : 'Mở IOC Copilot (Ctrl + J)'}
      >
        <span className="cop-fab-icon" aria-hidden="true">
          {open ? <X /> : <Sparkles />}
        </span>
        <span className="cop-fab-label">Hỏi Copilot</span>
        {unread && !open && <i className="cop-fab-dot" aria-hidden="true" />}
      </button>

      <aside
        ref={panelRef}
        id="ioc-copilot-dock"
        className={`cop-dock${open ? ' open' : ''}${expanded ? ' expanded' : ''}`}
        style={expanded ? undefined : { ['--dock-width' as string]: `${width}px` }}
        aria-label="IOC Copilot"
        aria-hidden={!open}
        inert={!open ? true : undefined}
      >
        <div className="cop-dock-resize" onPointerDown={startResize} role="presentation" aria-hidden="true" />

        <header className="cop-dock-head">
          <div className="cop-dock-mark" aria-hidden="true">
            <Bot />
          </div>
          <div className="cop-dock-title">
            <strong>IOC Copilot</strong>
            <span>Trả lời từ dữ liệu thật của hệ thống</span>
          </div>
          <div className="cop-dock-tools">
            <button
              type="button"
              onClick={resetConversation}
              disabled={!messages.length && !sending}
              aria-label="Cuộc trò chuyện mới"
              data-tooltip="Trò chuyện mới"
            >
              <RotateCcw />
            </button>
            <button
              type="button"
              className="cop-dock-expand"
              onClick={() => setExpanded(value => !value)}
              aria-label={expanded ? 'Thu nhỏ bảng' : 'Mở rộng bảng'}
              data-tooltip={expanded ? 'Thu nhỏ' : 'Mở rộng'}
            >
              {expanded ? <Minimize2 /> : <Maximize2 />}
            </button>
            <button type="button" onClick={close} aria-label="Đóng bảng Copilot" data-tooltip="Đóng">
              <X />
            </button>
          </div>
        </header>

        <div ref={listRef} className="cop-messages" aria-live="polite">
          {!messages.length && (
            <div className="cop-welcome">
              <div className="cop-welcome-icon" aria-hidden="true">
                <Sparkles />
              </div>
              <strong>Hỏi bằng tiếng Việt, trả lời bằng số liệu thật</strong>
              <p>
                Mọi con số được truy vấn trực tiếp từ cơ sở dữ liệu và luôn kèm nguồn. Các thao tác ghi dữ liệu đều
                phải được bạn xác nhận trước khi thực hiện.
              </p>
            </div>
          )}

          {messages.map(message =>
            message.role === 'user' ? (
              <div key={message.id} className="cop-row user">
                <div className="cop-bubble user">{message.text}</div>
              </div>
            ) : (
              <div key={message.id} className="cop-row assistant">
                <div className="cop-avatar" aria-hidden="true">
                  <Bot />
                </div>
                {message.kind === 'pending' && (
                  <div className="cop-bubble assistant cop-pending">
                    <span className="cop-typing" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                    <span>Đang phân tích và truy vấn dữ liệu…</span>
                  </div>
                )}
                {message.kind === 'error' && (
                  <div className="cop-bubble assistant cop-error" role="alert">
                    <strong>Không thể xử lý câu hỏi</strong>
                    <p>{message.text}</p>
                    <p className="cop-error-hint">Vui lòng gửi lại hoặc diễn đạt câu hỏi theo cách khác.</p>
                  </div>
                )}
                {message.kind === 'answer' && (
                  <AnswerBubble
                    answer={message.answer}
                    bubbleId={message.id}
                    actionStatus={message.actionStatus}
                    onConfirm={(bubbleId, actionId) => {
                      void confirmAction(bubbleId, actionId);
                    }}
                    onCancel={(bubbleId, actionId) => {
                      void cancelAction(bubbleId, actionId);
                    }}
                  />
                )}
              </div>
            ),
          )}
        </div>

        <div className="cop-composer">
          {!messages.length && (
            <div className="cop-chips" aria-label="Câu hỏi gợi ý">
              {suggestions.map(suggestion => (
                <button
                  key={suggestion}
                  type="button"
                  className="cop-chip"
                  disabled={sending}
                  onClick={() => {
                    setInput(suggestion);
                    void send(suggestion);
                  }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
          <form className="cop-input-row" onSubmit={submit}>
            <textarea
              ref={textareaRef}
              rows={1}
              maxLength={1000}
              value={input}
              disabled={sending}
              onChange={event => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Hỏi về chỉ tiêu, văn bản hoặc đề xuất AI…"
              aria-label="Câu hỏi gửi IOC Copilot"
            />
            <button
              type="submit"
              className="btn ai cop-send"
              disabled={sending || input.trim().length < 2}
              aria-label="Gửi câu hỏi"
            >
              <Send />
            </button>
          </form>
          <p className="cop-hint">
            <kbd className="kbd">Enter</kbd> gửi · <kbd className="kbd">Shift</kbd>+<kbd className="kbd">Enter</kbd>{' '}
            xuống dòng · <kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">J</kbd> đóng
          </p>
        </div>
      </aside>
    </>
  );
}
