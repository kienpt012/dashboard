import { useEffect, useRef } from 'react';

/** Thanh tiến độ cuộn trang.
 *
 *  Hiển thị một dải mảnh ở mép trên cho biết người dùng đã đọc tới đâu — hữu ích
 *  nhất ở các trang dài: kho văn bản, nhật ký hệ thống, trang thông tin công khai.
 *
 *  Tiến độ được ghi thẳng vào biến CSS `--scroll-progress` (0 → 1) trong một khung
 *  hình do `requestAnimationFrame` cấp phát, nên React không phải vẽ lại gì khi cuộn.
 *
 *  `target` là phần tử cuộn cần theo dõi. Bỏ trống thì theo dõi cả tài liệu — dùng
 *  cho các trang công khai. Khu quản trị truyền vào vùng nội dung của nó.
 */
export default function ScrollProgress({ target }: { target?: React.RefObject<HTMLElement | null> }) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    let frame = 0;

    const measure = () => {
      frame = 0;
      const element = target?.current;
      const scrolled = element ? element.scrollTop : window.scrollY;
      const height = element
        ? element.scrollHeight - element.clientHeight
        : document.documentElement.scrollHeight - window.innerHeight;
      const ratio = height > 4 ? Math.min(1, Math.max(0, scrolled / height)) : 0;
      bar.style.setProperty('--scroll-progress', ratio.toFixed(4));
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(measure);
    };

    const source: HTMLElement | Window = target?.current ?? window;
    source.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });

    // Nội dung có thể dài ra sau khi tải xong dữ liệu — đo lại khi kích thước đổi.
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    if (observer) observer.observe(target?.current ?? document.body);

    measure();
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      source.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      observer?.disconnect();
    };
  }, [target]);

  return (
    <div ref={barRef} className="scroll-progress" aria-hidden="true">
      <i />
    </div>
  );
}
