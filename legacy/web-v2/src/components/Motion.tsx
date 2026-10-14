import { cloneElement, isValidElement, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { useCountUp, useInView } from '../motion';

/** Hiện dần một khối khi nó cuộn vào tầm nhìn.
 *
 *  Mặc định bọc nội dung trong một <div>. Truyền `as="section"` để đổi thẻ, hoặc
 *  `asChild` để gắn thẳng lớp vào phần tử con — dùng khi khối đã nằm trong một
 *  lưới hoặc bảng và một lớp <div> lồng thêm sẽ phá vỡ bố cục.
 */
export function Reveal({
  children,
  index = 0,
  variant,
  className = '',
  as: Tag = 'div',
  asChild = false,
  style,
}: {
  children: ReactNode;
  /** Thứ tự trong nhóm, để các phần tử hiện nối tiếp nhau. */
  index?: number;
  variant?: 'fade' | 'zoom' | 'from-left' | 'from-right';
  className?: string;
  as?: 'div' | 'section' | 'article' | 'li' | 'tr';
  asChild?: boolean;
  style?: CSSProperties;
}) {
  const { ref, inView } = useInView<HTMLElement>();
  const classes = ['reveal', variant, inView ? 'in' : '', className].filter(Boolean).join(' ');
  const merged: CSSProperties = { ...style, ['--reveal-index' as string]: index };

  if (asChild && isValidElement(children)) {
    const child = children as ReactElement<{ className?: string; style?: CSSProperties; ref?: unknown }>;
    return cloneElement(child, {
      ref,
      className: [child.props.className, classes].filter(Boolean).join(' '),
      style: { ...child.props.style, ...merged },
    });
  }

  return (
    <Tag ref={ref as never} className={classes} style={merged}>
      {children}
    </Tag>
  );
}

/** Một con số chạy lên tới giá trị của nó khi lọt vào tầm nhìn.
 *
 *  Chỉ dùng cho con số tiêu điểm (tiến độ chung, thẻ số liệu, số liệu hero).
 *  KHÔNG dùng trong ô bảng — xem phần quy ước ở đầu styles/motion.css.
 */
export function CountUp({
  value,
  decimals = 0,
  suffix,
  prefix,
  duration,
  /** Đặt false sau khi người dùng vừa lưu thay đổi: giá trị mới cần hiện ngay. */
  animate = true,
  className = '',
}: {
  value: number;
  decimals?: number;
  suffix?: ReactNode;
  prefix?: ReactNode;
  duration?: number;
  animate?: boolean;
  className?: string;
}) {
  const { ref, display } = useCountUp(value, { duration, enabled: animate });
  const rounded = decimals > 0 ? Number(display.toFixed(decimals)) : Math.round(display);

  return (
    <span ref={ref} className={`count-up ${className}`.trim()}>
      {prefix}
      {rounded.toLocaleString('vi-VN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  );
}

/** Bọc một lưới để các ô con hiện nối tiếp nhau khi lăn tới.
 *
 *  Trình duyệt hỗ trợ `animation-timeline: view()` sẽ neo hoạt hoạ vào vị trí
 *  cuộn; nơi khác thì các ô hiện ngay. Chỉ dùng cho danh sách chỉ-để-đọc.
 */
export function ScrollGrid({
  children,
  className = '',
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'ul';
}) {
  return <Tag className={`scroll-grid ${className}`.trim()}>{children}</Tag>;
}
