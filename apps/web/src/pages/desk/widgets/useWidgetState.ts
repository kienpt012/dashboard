import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api';
import { deskApi } from '../api';

// Dữ liệu riêng của một widget (ghi chú, việc riêng…) lưu ở máy chủ: tải một lần; sửa áp dụng ngay và tự lưu sau 1 giây
// ngừng sửa; mỗi lúc chỉ một lần lưu. Sửa cùng lúc ở hai nơi (409): tải bản mới, gộp theo cách của từng widget rồi lưu
// lại. Rời trang, ẩn thẻ hay gỡ widget khi còn thay đổi thì lưu ngay.

export type WidgetStateStatus = 'loading' | 'ready' | 'saving' | 'error';

const SAVE_DELAY = 1000;
const RETRY_DELAY = 5000;

export function useWidgetState<T>(widgetId: string, initial: T, merge: (local: T, remote: T) => T = local => local) {
  const [state, setLocal] = useState<T>(initial);
  const [status, setStatus] = useState<WidgetStateStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(state);
  const version = useRef(0);
  const dirty = useRef(false);
  const busy = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const mergeRef = useRef(merge);
  mergeRef.current = merge;

  const schedule = useCallback((delay: number, run: () => void) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(run, delay);
  }, []);

  const flush = useCallback(async (): Promise<void> => {
    window.clearTimeout(timer.current);
    if (!dirty.current || busy.current) return;
    busy.current = true;
    dirty.current = false;
    setStatus('saving');
    let retry = 0;
    try {
      const result = await deskApi.putState(widgetId, latest.current, version.current);
      version.current = result.version;
      setError(null);
      setStatus('ready');
    } catch (failure) {
      const code = failure instanceof ApiError ? failure.status : 0;
      if (code === 409) {
        const remote = await deskApi.getState<T>(widgetId).catch(() => null);
        if (remote) {
          version.current = remote.version;
          if (remote.state !== null) {
            latest.current = mergeRef.current(latest.current, remote.state);
            setLocal(latest.current);
          }
        }
        dirty.current = true;
        retry = 200;
      } else if (code === 400 || code === 413) {
        // Quá lớn hoặc không hợp lệ: thử lại cũng vô ích, chờ lần sửa sau.
        setError(failure instanceof Error ? failure.message : 'Không lưu được');
        setStatus('error');
      } else {
        dirty.current = true;
        retry = RETRY_DELAY;
        setError('Chưa lưu được, sẽ thử lại');
        setStatus('error');
      }
    } finally {
      busy.current = false;
    }
    if (dirty.current) schedule(retry || SAVE_DELAY, () => void flush());
  }, [widgetId, schedule]);

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    deskApi
      .getState<T>(widgetId)
      .then(result => {
        if (!alive) return;
        version.current = result.version;
        if (result.state !== null && !dirty.current) {
          latest.current = result.state;
          setLocal(result.state);
        }
        setStatus('ready');
      })
      .catch(() => {
        if (!alive) return;
        setError('Không tải được dữ liệu');
        setStatus('error');
      });
    return () => {
      alive = false;
    };
  }, [widgetId]);

  // Ẩn thẻ trình duyệt, rời trang hoặc gỡ widget: lưu ngay phần còn dở.
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => {
    const onHide = (event: Event) => {
      if (event.type === 'pagehide' || document.visibilityState === 'hidden') void flushRef.current();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      void flushRef.current();
    };
  }, []);

  const setState = useCallback(
    (next: T | ((prev: T) => T)) => {
      latest.current = typeof next === 'function' ? (next as (prev: T) => T)(latest.current) : next;
      setLocal(latest.current);
      dirty.current = true;
      schedule(SAVE_DELAY, () => void flush());
    },
    [flush, schedule],
  );

  return { state, setState, status, saving: status === 'saving', error, flush };
}
