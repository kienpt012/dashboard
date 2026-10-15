import { ArrowUpOutlined, UpOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode, type Ref } from 'react';

type ScrollState = { up: boolean; down: boolean; progress: number; far: boolean };

const EMPTY: ScrollState = { up: false, down: false, progress: 0, far: false };

function smooth(): ScrollBehavior {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

function same(a: ScrollState, b: ScrollState) {
  return a.up === b.up && a.down === b.down && a.far === b.far && Math.abs(a.progress - b.progress) < 0.004;
}

/** Vòng tiến độ cuộn: viền xám là cả trang, cung màu chính là phần đã cuộn qua. */
function ProgressRing({ value, size }: { value: number; size: number }) {
  const stroke = size >= 40 ? 3 : 2.5;
  const radius = (size - stroke) / 2;
  const length = 2 * Math.PI * radius;
  return (
    <svg className="scroll-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle className="track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} />
      <circle
        className="bar"
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={stroke}
        strokeDasharray={length}
        strokeDashoffset={length * (1 - value)}
      />
    </svg>
  );
}

/** Nút lên đầu trang, hiện khi đã cuộn quá một màn hình; vòng ngoài cho biết đã đọc tới đâu. */
export function BackToTop() {
  const [state, setState] = useState<ScrollState>(EMPTY);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const root = document.documentElement;
      const max = root.scrollHeight - window.innerHeight;
      const y = window.scrollY;
      const next = { up: y > 4, down: y < max - 4, progress: max > 0 ? Math.min(1, y / max) : 0, far: y > Math.max(320, window.innerHeight * 0.6) };
      setState(prev => (same(prev, next) ? prev : next));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(document.body);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);

  return (
    <Tooltip title={`Lên đầu trang · ${Math.round(state.progress * 100)}%`} placement="left">
      <button
        type="button"
        className={`to-top${state.far ? ' show' : ''}`}
        aria-label="Lên đầu trang"
        tabIndex={state.far ? 0 : -1}
        onClick={() => window.scrollTo({ top: 0, behavior: smooth() })}
      >
        <ProgressRing value={state.progress} size={44} />
        <ArrowUpOutlined />
      </button>
    </Tooltip>
  );
}

/**
 * Khối cuộn có chỉ báo: mép trên/dưới mờ dần khi còn nội dung bị khuất,
 * nút tròn nhỏ (kèm vòng tiến độ) đưa về đầu khối khi đã cuộn xuống.
 */
export function ScrollBox({
  children,
  maxHeight,
  minHeight,
  className,
  bodyClassName,
  style,
  ref,
  label = 'Về đầu danh sách',
}: {
  children: ReactNode;
  maxHeight?: CSSProperties['maxHeight'];
  minHeight?: CSSProperties['minHeight'];
  className?: string;
  bodyClassName?: string;
  style?: CSSProperties;
  ref?: Ref<HTMLDivElement>;
  label?: string;
}) {
  const body = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<ScrollState>(EMPTY);

  const measure = useCallback(() => {
    const element = body.current;
    if (!element) return;
    const max = element.scrollHeight - element.clientHeight;
    const y = element.scrollTop;
    const next = { up: y > 2, down: y < max - 2, progress: max > 0 ? Math.min(1, y / max) : 0, far: y > Math.min(240, element.clientHeight * 0.75) };
    setState(prev => (same(prev, next) ? prev : next));
  }, []);

  useEffect(() => {
    const element = body.current;
    if (!element) return;
    let frame = 0;
    const schedule = () => {
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          measure();
        });
    };
    const resize = new ResizeObserver(schedule);
    resize.observe(element);
    const mutation = new MutationObserver(schedule);
    mutation.observe(element, { childList: true, subtree: true, characterData: true });
    measure();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
    };
  }, [measure]);

  const setRef = useCallback(
    (element: HTMLDivElement | null) => {
      body.current = element;
      if (typeof ref === 'function') ref(element);
      else if (ref) ref.current = element;
    },
    [ref],
  );

  const classes = ['scroll-box', state.up && 'fade-top', state.down && 'fade-bottom', className].filter(Boolean).join(' ');

  return (
    <div className={classes} style={style}>
      <div ref={setRef} className={['scroll-box-body', bodyClassName].filter(Boolean).join(' ')} style={{ maxHeight, minHeight }} onScroll={measure}>
        {children}
      </div>
      <button
        type="button"
        className={`scroll-box-top${state.far ? ' show' : ''}`}
        aria-label={label}
        title={label}
        tabIndex={state.far ? 0 : -1}
        onClick={() => body.current?.scrollTo({ top: 0, behavior: smooth() })}
      >
        <ProgressRing value={state.progress} size={30} />
        <UpOutlined />
      </button>
    </div>
  );
}
