import { useEffect, useRef, useState } from 'react';

/** Nền tảng chuyển động dùng chung.
 *
 *  Mọi hoạt hoạ đều phải đi qua đây để có cùng một cách xử lý ba việc: chỉ chạy
 *  một lần, tôn trọng thiết lập "giảm chuyển động" của hệ điều hành, và không
 *  bao giờ để nội dung kẹt ở trạng thái ẩn khi có sự cố.
 */

export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Bật lớp `.has-motion` trên thẻ <html>.
 *
 *  CSS chỉ ẩn phần tử chờ hiện dần khi lớp này có mặt. Nhờ vậy nếu kịch bản không
 *  chạy được, người dùng vẫn thấy toàn bộ nội dung thay vì một trang trắng.
 */
export function enableMotion() {
  document.documentElement.classList.add('has-motion');
}

/** Báo khi phần tử lọt vào tầm nhìn. Mặc định chỉ báo một lần.
 *
 *  Trả về `true` ngay lập tức nếu trình duyệt không có IntersectionObserver hoặc
 *  người dùng đã tắt hiệu ứng chuyển động.
 */
export function useInView<T extends HTMLElement>(options?: {
  /** Phần trăm phần tử phải lọt vào mới tính là đã thấy. */
  amount?: number;
  /** Nới vùng quan sát để hiệu ứng bắt đầu sớm hơn một chút. */
  margin?: string;
  /** Đặt false nếu muốn theo dõi liên tục thay vì một lần. */
  once?: boolean;
}) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (prefersReducedMotion() || typeof IntersectionObserver !== 'function') {
      setInView(true);
      return;
    }

    const once = options?.once ?? true;

    /* Lưới an toàn.
     *
     *  IntersectionObserver chỉ hoạt động khi trang thật sự được vẽ. Trong thẻ nền,
     *  trong khung nhúng, hay khi cửa sổ bị che, trình duyệt có thể không gọi lại lần
     *  nào — và nội dung sẽ kẹt mãi ở trạng thái ẩn, con số kẹt ở 0.
     *
     *  Cách phân biệt: một observer bình thường LUÔN gọi lại ngay sau khi bắt đầu quan
     *  sát, kể cả khi phần tử nằm ngoài màn hình (lúc đó `isIntersecting` là false).
     *  Vậy nên chỉ cần nhận được MỘT lần gọi bất kỳ là biết observer còn sống và huỷ
     *  lưới an toàn. Không nhận được lần nào trong hạn dưới đây nghĩa là môi trường
     *  không chạy được observer — khi đó hiện thẳng nội dung, vì nội dung quan trọng
     *  hơn hiệu ứng.
     */
    let alive = false;
    const safety = window.setTimeout(() => {
      if (!alive) setInView(true);
    }, 1200);

    const observer = new IntersectionObserver(
      entries => {
        alive = true;
        window.clearTimeout(safety);
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting) {
          setInView(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { threshold: options?.amount ?? 0.15, rootMargin: options?.margin ?? '0px 0px -8% 0px' },
    );

    observer.observe(element);

    return () => {
      window.clearTimeout(safety);
      observer.disconnect();
    };
  }, [options?.amount, options?.margin, options?.once]);

  return { ref, inView };
}

/** Đếm một con số lên tới giá trị đích khi phần tử lọt vào tầm nhìn.
 *
 *  Dùng `requestAnimationFrame` và hàm nới chậm dần (ease-out) nên con số chạy
 *  nhanh lúc đầu rồi dừng êm — giống cách một đồng hồ đo ổn định lại, chứ không
 *  chạy đều đều như máy đếm.
 */
export function useCountUp(value: number, options?: { duration?: number; enabled?: boolean }) {
  const { ref, inView } = useInView<HTMLSpanElement>();
  const animatable = (options?.enabled ?? true) && !prefersReducedMotion();
  const [display, setDisplay] = useState(() => (animatable ? 0 : value));
  /** Giá trị đã đếm xong lần trước; lần đếm đầu tiên luôn bắt đầu từ 0. */
  const settled = useRef(0);
  const duration = options?.duration ?? 900;

  useEffect(() => {
    // Tắt hiệu ứng, hoặc giá trị vừa do người dùng thay đổi: hiện thẳng, không đếm.
    if (!animatable) {
      settled.current = value;
      setDisplay(value);
      return;
    }

    // Chưa lọt vào tầm nhìn thì chờ. `useInView` có lưới an toàn nên trạng thái này
    // không thể kéo dài mãi.
    if (!inView) return;

    const from = settled.current;
    if (from === value) {
      setDisplay(value);
      return;
    }

    const start = performance.now();
    let frame = 0;
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      settled.current = value;
      setDisplay(value);
    };

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      // easeOutCubic: chạy nhanh lúc đầu rồi dừng êm, giống một đồng hồ đo ổn định lại.
      const eased = 1 - Math.pow(1 - progress, 3);
      if (progress >= 1) {
        finish();
        return;
      }
      setDisplay(from + (value - from) * eased);
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    /* Đường lui: `requestAnimationFrame` không chạy khi thẻ nằm nền hoặc cửa sổ bị
       che. Không có mốc này thì con số sẽ đứng im ở 0 — sai lệch nghiêm trọng hơn
       nhiều so với việc mất một hiệu ứng. */
    const guard = window.setTimeout(finish, duration + 400);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(guard);
    };
  }, [value, inView, animatable, duration]);

  return { ref, display };
}
