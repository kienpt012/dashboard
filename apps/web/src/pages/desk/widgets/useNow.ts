import { useEffect, useState } from 'react';

// Một nhịp giây dùng chung cho mọi đồng hồ, đếm ngược trên bàn: canh đúng đầu giây nên các widget nhảy số cùng lúc,
// và chỉ một bộ hẹn giờ chạy dù có bao nhiêu widget.

const listeners = new Set<(now: Date) => void>();
let timer: number | undefined;

function tick() {
  const now = new Date();
  listeners.forEach(listener => listener(now));
  timer = window.setTimeout(tick, 1000 - (now.getTime() % 1000) + 5);
}

function subscribe(listener: (now: Date) => void) {
  listeners.add(listener);
  if (timer === undefined) timer = window.setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer !== undefined) {
      window.clearTimeout(timer);
      timer = undefined;
    }
  };
}

/** Thời điểm hiện tại, cập nhật mỗi giây (hoặc mỗi phút khi `everyMinute`). */
export function useNow(everyMinute = false, enabled = true) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!enabled) return;
    return subscribe(next => setNow(previous => (everyMinute && previous.getMinutes() === next.getMinutes() && previous.getHours() === next.getHours() ? previous : next)));
  }, [everyMinute, enabled]);
  return now;
}
