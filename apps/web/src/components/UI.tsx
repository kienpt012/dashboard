import { Check, Copy, Inbox, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { toast } from './Toast';

/** Chép một chuỗi vào bộ nhớ tạm.
 *
 *  `navigator.clipboard` chỉ tồn tại trong ngữ cảnh bảo mật. Hệ thống này hoàn toàn
 *  có thể được phục vụ qua http trên mạng nội bộ của phường, nên phải có đường lui
 *  bằng cách cũ, nếu không nút chép sẽ im lặng không làm gì.
 */
async function copyText(value: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* Rơi xuống cách dự phòng bên dưới. */
  }

  try {
    const field = document.createElement('textarea');
    field.value = value;
    field.setAttribute('readonly', '');
    field.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(field);
    field.select();
    const ok = document.execCommand('copy');
    field.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Nút chép một giá trị, đặt cạnh bất kỳ nội dung nào.
 *
 *  Mã chỉ tiêu, mã phản ánh và mã bảo mật liên tục được trích vào báo cáo, email và
 *  đọc qua điện thoại. Bắt người dùng bôi đen một chuỗi mười mấy ký tự là chỗ gây
 *  bực mình nhất mà lại dễ sửa nhất — với người dân tra cứu trên điện thoại thì
 *  bôi đen còn khó hơn nữa.
 */
export function CopyButton({ value, label, big = false }: { value: string; label?: string; big?: boolean }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      className={`copy-code-btn${big ? ' big' : ''}`}
      aria-label={`Chép ${label ?? 'mã'} ${value}`}
      data-tooltip={copied ? 'Đã chép' : 'Chép'}
      onClick={async event => {
        event.stopPropagation();
        event.preventDefault();
        const ok = await copyText(value);
        if (ok) {
          setCopied(true);
          toast.ok(`Đã chép ${label ?? 'mã'} ${value}`);
        } else {
          toast.error('Không chép được', 'Trình duyệt chặn thao tác chép. Vui lòng bôi đen và chép thủ công.');
        }
      }}
    >
      {copied ? <Check /> : <Copy />}
    </button>
  );
}

/** Mã ngắn hiển thị dạng chip, kèm nút chép. */
export function CopyCode({ value, label }: { value: string; label?: string }) {
  return (
    <span className="copy-code">
      <span className="code">{value}</span>
      <CopyButton value={value} label={label} />
    </span>
  );
}

/** Đầu trang chuẩn: nhãn nhóm, tiêu đề, mô tả và vùng hành động bên phải. */
export function PageHead({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

/** Hộp thoại có bẫy tiêu điểm, đóng bằng Esc và trả tiêu điểm về nơi xuất phát. */
export function Modal({
  title,
  children,
  onClose,
  wide = false,
  description,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  description?: string;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = window.requestAnimationFrame(() => {
      const preferred = dialogRef.current?.querySelector<HTMLElement>(
        'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [data-modal-initial-focus]',
      );
      (preferred || dialogRef.current)?.focus();
    });
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
    };
    document.addEventListener('keydown', handleEscape);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = previousOverflow;
      returnFocus?.focus();
    };
  }, []);

  function keepFocusInside(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab') return;
    const items = [
      ...(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ) || []),
    ];
    if (!items.length) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className={`modal ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onKeyDown={keepFocusInside}
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h3 id={titleId}>{title}</h3>
            {description && (
              <p id={descriptionId} className="field-hint">
                {description}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng hộp thoại">
            <X />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Trạng thái không có dữ liệu. */
export function Empty({
  title = 'Chưa có dữ liệu',
  description = 'Dữ liệu sẽ xuất hiện tại đây sau khi được tạo.',
  showIcon = true,
  action,
}: {
  title?: string;
  description?: string;
  showIcon?: boolean;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      {showIcon && (
        <div aria-hidden="true">
          <Inbox />
        </div>
      )}
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="spinner-wrap" role="status" aria-label="Đang tải dữ liệu">
      <div className="spinner" aria-hidden="true" />
    </div>
  );
}

/** Khung xương cho nội dung đang tải.
 *
 *  Dùng thay `<Spinner/>` ở những màn hình đã biết trước bố cục: người dùng thấy ngay
 *  hình hài của trang và không bị nhảy bố cục khi dữ liệu về.
 */
export function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`skeleton ${className}`} style={style} aria-hidden="true" />;
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <div key={index} className="skeleton skeleton-text" />
      ))}
    </div>
  );
}

/** Khung xương cho một lưới thẻ số liệu. */
export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <div className="skeleton-grid" role="status" aria-label="Đang tải dữ liệu">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="skeleton" style={{ height: 116 }} />
      ))}
    </div>
  );
}

/** Khung xương cho bảng dữ liệu. */
export function SkeletonTable({ rows = 6 }: { rows?: number }) {
  return (
    <div className="panel" role="status" aria-label="Đang tải dữ liệu">
      <div className="skeleton skeleton-title" />
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="skeleton" style={{ height: 44, marginBottom: 8 }} />
      ))}
    </div>
  );
}

/** Nhãn trạng thái thống nhất toàn hệ thống. */
export function Badge({
  tone = 'neutral',
  children,
  dot = false,
}: {
  tone?: 'ok' | 'warn' | 'bad' | 'info' | 'accent' | 'ai' | 'neutral' | 'brand';
  children: ReactNode;
  dot?: boolean;
}) {
  return <span className={`badge ${tone}${dot ? ' dot' : ''}`}>{children}</span>;
}

/** Khối thông báo toàn trang: không có quyền, tải hỏng, chưa cấu hình… */
export function StateCard({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="state-page">
      <div className="state-card">
        <div aria-hidden="true">{icon}</div>
        <h3>{title}</h3>
        <p>{description}</p>
        {action}
      </div>
    </div>
  );
}
