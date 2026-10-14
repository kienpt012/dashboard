import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// Hiển thị chi tiết theo nhu cầu: màn hình tổng quan gọn, chi tiết hiện khi rê chuột/chạm (Hint) hoặc khi người dùng
// bật chế độ "Chi tiết" (useDensity + DensityToggle). Không mất thông tin, không chất chữ lên màn hình.

export type DetailRow = { label: string; value: ReactNode };

/**
 * Thẻ chi tiết hiện khi rê chuột, đưa tiêu điểm bàn phím hoặc chạm vào phần tử. Thẻ được vẽ nổi ở cuối trang
 * (portal) để không bị khung cuộn của bảng cắt mất.
 */
export function Hint({ rows, children, title }: { rows: (DetailRow | null | false | undefined)[]; children: ReactNode; title?: ReactNode }) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number; above: boolean } | null>(null);
  const items = rows.filter((row): row is DetailRow => Boolean(row && row.value !== null && row.value !== undefined && row.value !== ''));

  const show = useCallback(() => {
    const rect = anchor.current?.getBoundingClientRect();
    if (!rect) return;
    const above = rect.bottom + 240 > window.innerHeight && rect.top > 260;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - 376));
    setPosition({ top: above ? rect.top - 6 : rect.bottom + 6, left, above });
  }, []);
  const hide = useCallback(() => setPosition(null), []);

  useEffect(() => {
    if (!position) return;
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [position, hide]);

  if (!items.length && !title) return <>{children}</>;
  return (
    <span
      ref={anchor}
      className="hint"
      tabIndex={0}
      aria-describedby={position ? id : undefined}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onTouchStart={show}
    >
      {children}
      {position && createPortal(
        <div className={`hint-card${position.above ? ' above' : ''}`} role="tooltip" id={id} style={{ top: position.top, left: position.left }}>
          {title && <strong className="hint-title">{title}</strong>}
          {items.length > 0 && (
            <dl>
              {items.map(item => (
                <div key={item.label}>
                  <dt>{item.label}</dt>
                  <dd>{item.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>,
        document.body,
      )}
    </span>
  );
}

export type Density = 'compact' | 'detailed';

/** Chế độ hiển thị của một màn hình, nhớ theo trình duyệt. */
export function useDensity(key: string): [Density, (value: Density) => void] {
  const storageKey = `ioc_density_${key}`;
  const [value, setValue] = useState<Density>(() => {
    try {
      return localStorage.getItem(storageKey) === 'detailed' ? 'detailed' : 'compact';
    } catch {
      return 'compact';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, value);
    } catch {
      /* bị chặn lưu trữ: chỉ nhớ trong phiên */
    }
  }, [storageKey, value]);
  return [value, setValue];
}

export function DensityToggle({ value, onChange }: { value: Density; onChange: (value: Density) => void }) {
  return (
    <div className="segmented density-toggle" role="group" aria-label="Chế độ hiển thị">
      <button type="button" className={value === 'compact' ? 'active' : ''} aria-pressed={value === 'compact'} onClick={() => onChange('compact')}>
        Gọn
      </button>
      <button type="button" className={value === 'detailed' ? 'active' : ''} aria-pressed={value === 'detailed'} onClick={() => onChange('detailed')}>
        Chi tiết
      </button>
    </div>
  );
}
