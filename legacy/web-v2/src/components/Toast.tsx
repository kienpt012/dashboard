import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

/** Thông báo nổi cho kết quả thao tác.
 *
 *  Trước đây mỗi trang tự hiện một khối chữ tĩnh rồi tự xoá sau vài giây; kết quả là
 *  mỗi nơi một kiểu và người dùng dễ bỏ lỡ. Ở đây dùng một hàng đợi dùng chung:
 *  gọi `toast.ok('Đã lưu chỉ tiêu')` từ bất kỳ đâu.
 *
 *  Không dùng thư viện ngoài và không dùng context để mọi hàm xử lý sự kiện
 *  (kể cả ngoài cây React) đều gọi được.
 */

export type ToastTone = 'ok' | 'bad' | 'warn' | 'info';

type ToastItem = {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
  /** Thời gian hiển thị (ms). 0 nghĩa là chỉ đóng khi người dùng bấm. */
  duration: number;
};

type Listener = (items: ToastItem[]) => void;

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit() {
  const snapshot = [...items];
  listeners.forEach(listener => listener(snapshot));
}

function dismiss(id: number) {
  items = items.filter(item => item.id !== id);
  emit();
}

function push(tone: ToastTone, title: string, description?: string, duration?: number) {
  const id = nextId++;
  // Giữ tối đa 4 thông báo để không che mất nội dung trang.
  items = [...items, { id, tone, title, description, duration: duration ?? (tone === 'bad' ? 7000 : 4500) }].slice(-4);
  emit();
  return id;
}

export const toast = {
  ok: (title: string, description?: string) => push('ok', title, description),
  error: (title: string, description?: string) => push('bad', title, description),
  warn: (title: string, description?: string) => push('warn', title, description),
  info: (title: string, description?: string) => push('info', title, description),
  dismiss,
};

const icons: Record<ToastTone, typeof CheckCircle2> = {
  ok: CheckCircle2,
  bad: XCircle,
  warn: AlertTriangle,
  info: Info,
};

function ToastRow({ item }: { item: ToastItem }) {
  const [leaving, setLeaving] = useState(false);
  const [paused, setPaused] = useState(false);
  const Icon = icons[item.tone];
  const timerRef = useRef<number>(0);

  useEffect(() => {
    if (!item.duration || paused) return;
    timerRef.current = window.setTimeout(() => setLeaving(true), item.duration);
    return () => window.clearTimeout(timerRef.current);
  }, [item.duration, paused]);

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => dismiss(item.id), 200);
    return () => window.clearTimeout(timer);
  }, [leaving, item.id]);

  return (
    <div
      className={`toast ${item.tone}${leaving ? ' leaving' : ''}`}
      role={item.tone === 'bad' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Icon aria-hidden="true" />
      <div>
        <strong>{item.title}</strong>
        {item.description && <p>{item.description}</p>}
      </div>
      <button type="button" onClick={() => setLeaving(true)} aria-label="Đóng thông báo">
        <X />
      </button>
    </div>
  );
}

/** Đặt một lần ở gốc ứng dụng. */
export function ToastHost({ shifted = false }: { shifted?: boolean }) {
  const [list, setList] = useState<ToastItem[]>(items);

  useEffect(() => {
    listeners.add(setList);
    return () => {
      listeners.delete(setList);
    };
  }, []);

  if (!list.length) return null;

  return (
    <div className="toast-stack" data-shifted={shifted || undefined} aria-live="polite" aria-atomic="false">
      {list.map(item => (
        <ToastRow key={item.id} item={item} />
      ))}
    </div>
  );
}
