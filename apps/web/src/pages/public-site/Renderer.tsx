import {
  ApartmentOutlined,
  ArrowRightOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  DownloadOutlined,
  FileTextOutlined,
  FundOutlined,
  MessageOutlined,
  RiseOutlined,
  AimOutlined,
} from '@ant-design/icons';
import DOMPurify from 'dompurify';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useThemeMode } from '@/app/theme';
import { apiBaseUrl } from '@/lib/api';
import { date, dateTime, num } from '@/lib/format';
import type { PublicTarget } from '@/types/core';
import { FEEDBACK_CATEGORY } from '../feedback/labels';
import { COLS, GAP, METRICS, ROW_HEIGHT } from './model';
import type { CustomHtmlBinding, PublicDashboardBreakpoint, PublicDashboardConfig, PublicDashboardData, PublicDashboardWidget } from './types';
import './renderer.css';

const STATUS: Record<string, { label: string; tone: string }> = {
  COMPLETED: { label: 'Hoàn thành', tone: 'ok' },
  ON_TRACK: { label: 'Đúng tiến độ', tone: 'info' },
  AT_RISK: { label: 'Cần theo dõi', tone: 'warn' },
  OVERDUE: { label: 'Chậm tiến độ', tone: 'bad' },
  NOT_STARTED: { label: 'Chưa có số liệu', tone: 'muted' },
};

const METRIC_ICON: Record<string, ReactNode> = {
  departments: <ApartmentOutlined />,
  total: <AimOutlined />,
  completed: <CheckCircleOutlined />,
  onTrack: <RiseOutlined />,
  overallProgress: <FundOutlined />,
  year: <CalendarOutlined />,
};

/** Đường dẫn API do máy chủ trả ("/api/…") thành địa chỉ tuyệt đối theo cấu hình môi trường. */
export function apiUrl(path: string) {
  return /^\/api\//.test(path) ? `${apiBaseUrl}${path.slice(4)}` : path;
}

function safeHref(raw?: string) {
  const href = (raw ?? '').trim();
  if (/^#[\w-]+$/.test(href)) return href;
  if (href.startsWith('/') && !href.startsWith('//') && !href.includes('\\')) return href;
  if (/^https:\/\//i.test(href)) return href;
  return '/phan-anh';
}

function clampItems(value: unknown, fallback: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(max, Math.floor(parsed)) : fallback;
}

function Empty({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="pd-empty">
      {icon}
      <span>{text}</span>
    </div>
  );
}

function Head({ title, extra }: { title?: string; extra?: ReactNode }) {
  if (!title && !extra) return null;
  return (
    <header className="pd-head">
      {title && <h2>{title}</h2>}
      {extra}
    </header>
  );
}

function Overview({ widget, data }: { widget: PublicDashboardWidget; data: PublicDashboardData }) {
  const keys = (widget.settings.metricKeys ?? []).filter(key => key in METRICS);
  return (
    <>
      <Head title={widget.title} extra={data.overview.updatedAt && <span className="pd-meta">Cập nhật {date(data.overview.updatedAt)}</span>} />
      <div className="pd-metrics" style={{ '--count': Math.max(1, keys.length) } as CSSProperties}>
        {keys.map(key => {
          const metric = METRICS[key];
          const value = metric.value(data);
          return (
            <div className="pd-metric" key={key}>
              <span className="pd-metric-icon">{METRIC_ICON[key]}</span>
              <strong>
                {key === 'year' ? value : num(value)}
                {metric.suffix && value !== null ? <small>{metric.suffix}</small> : null}
              </strong>
              <span>{metric.label}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function TargetCard({ target }: { target: PublicTarget }) {
  const status = STATUS[target.status] ?? STATUS.NOT_STARTED;
  const progress = Math.max(0, Math.min(100, Math.round(target.progress)));
  return (
    <article className="pd-target">
      <div className="pd-target-top">
        <span className={`pd-status ${status.tone}`}>{status.label}</span>
      </div>
      <h3 title={target.title}>{target.title}</h3>
      <span className="pd-dept">
        <i style={{ background: target.departmentColor }} />
        {target.department}
      </span>
      <div className="pd-value">
        <span>Thực hiện</span>
        <strong>{num(target.currentValue)}</strong>
        <span>
          / {num(target.targetValue)} {target.unit}
        </span>
      </div>
      <div className="pd-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label={`Tiến độ ${progress}%`}>
        <i style={{ width: `${progress}%` }} />
      </div>
      <div className="pd-target-foot">
        <span>Tiến độ</span>
        <b>{progress}%</b>
      </div>
      <span className="pd-code">Mã chỉ tiêu: {target.code}</span>
    </article>
  );
}

function Targets({ widget, data }: { widget: PublicDashboardWidget; data: PublicDashboardData }) {
  const mode = widget.settings.mode ?? 'highlight';
  const keys = widget.settings.targetKeys ?? [];
  const max = clampItems(widget.settings.maxItems, 6, 100);
  const source = mode === 'highlight' ? data.overview.highlights : mode === 'selected' ? data.targets.filter(target => keys.includes(target.key)) : data.targets;
  const items = source.slice(0, max);
  const emptyText = mode === 'highlight' ? 'Chưa có chỉ tiêu nổi bật' : mode === 'selected' ? 'Chưa có chỉ tiêu được chọn trong năm này' : 'Chưa có chỉ tiêu được công bố';
  return (
    <>
      <Head title={widget.title} extra={items.length > 0 && <span className="pd-meta">{num(items.length)} chỉ tiêu</span>} />
      {items.length ? (
        <div className="pd-targets">
          {items.map(target => (
            <TargetCard key={target.key} target={target} />
          ))}
        </div>
      ) : (
        <Empty icon={<AimOutlined />} text={emptyText} />
      )}
    </>
  );
}

function Departments({ widget, data }: { widget: PublicDashboardWidget; data: PublicDashboardData }) {
  const items = data.overview.departments.slice(0, clampItems(widget.settings.maxItems, 8, 24));
  return (
    <>
      <Head title={widget.title} />
      {items.length ? (
        <ol className="pd-depts">
          {items.map(item => {
            const progress = Math.max(0, Math.min(100, Math.round(item.progress)));
            return (
              <li key={item.key}>
                <div className="pd-dept-row">
                  <span className="pd-dept-name">{item.name}</span>
                  <b>{progress}%</b>
                </div>
                <div className="pd-bar thin">
                  <i style={{ width: `${progress}%`, background: item.color }} />
                </div>
                <span className="pd-meta">
                  {num(item.completed)}/{num(item.total)} chỉ tiêu hoàn thành
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <Empty icon={<ApartmentOutlined />} text="Chưa có số liệu theo đơn vị" />
      )}
    </>
  );
}

function Feedbacks({ widget, data }: { widget: PublicDashboardWidget; data: PublicDashboardData }) {
  const items = data.feedbacks.slice(0, clampItems(widget.settings.maxItems, 4, 24));
  return (
    <>
      <Head
        title={widget.title}
        extra={
          <Link to="/phan-anh?tab=cong-khai" className="pd-link">
            Xem tất cả <ArrowRightOutlined />
          </Link>
        }
      />
      {items.length ? (
        <ul className="pd-list">
          {items.map(item => (
            <li key={item.code}>
              <Link to={`/phan-anh/cong-khai/${encodeURIComponent(item.code)}`} className="pd-list-item">
                <span className="pd-list-meta">
                  {[item.category ? FEEDBACK_CATEGORY[item.category] : null, item.department?.name, date(item.publicPublishedAt)].filter(Boolean).join(' · ')}
                </span>
                <strong>{item.publicTitle || 'Kết quả xử lý phản ánh'}</strong>
                {item.publicSummary && <span className="pd-clamp">{item.publicSummary}</span>}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty icon={<MessageOutlined />} text="Chưa có kết quả phản ánh được công khai" />
      )}
    </>
  );
}

function Documents({ widget, data }: { widget: PublicDashboardWidget; data: PublicDashboardData }) {
  const selected = widget.settings.publicationIds ?? [];
  const items = data.documents.filter(item => selected.includes(item.id)).slice(0, clampItems(widget.settings.maxItems, 6, 30));
  return (
    <>
      <Head title={widget.title} />
      {items.length ? (
        <ul className="pd-list">
          {items.map(item => {
            const href = item.downloadUrl && /^\/api\/public\//.test(item.downloadUrl) ? apiUrl(item.downloadUrl) : null;
            const body = (
              <>
                <FileTextOutlined className="pd-doc-icon" />
                <span className="pd-doc-body">
                  <span className="pd-list-meta">{[item.code, item.publishedAt ? `Công bố ${date(item.publishedAt)}` : null].filter(Boolean).join(' · ')}</span>
                  <strong>{item.title}</strong>
                  {item.summary && <span className="pd-clamp">{item.summary}</span>}
                </span>
                {href && <DownloadOutlined className="pd-doc-action" />}
              </>
            );
            return (
              <li key={item.id}>
                {href ? (
                  <a className="pd-list-item pd-doc" href={href} target="_blank" rel="noopener noreferrer" title="Tải văn bản">
                    {body}
                  </a>
                ) : (
                  <div className="pd-list-item pd-doc">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty icon={<FileTextOutlined />} text="Chưa có văn bản được công bố" />
      )}
    </>
  );
}

function RichText({ widget }: { widget: PublicDashboardWidget }) {
  return (
    <>
      <Head title={widget.title} />
      <div className="pd-text">{widget.settings.body}</div>
    </>
  );
}

function Cta({ widget }: { widget: PublicDashboardWidget }) {
  const href = safeHref(widget.settings.href);
  const content = (
    <>
      <span className="pd-cta-text">
        {widget.title && <strong>{widget.title}</strong>}
        {widget.settings.body && <span>{widget.settings.body}</span>}
      </span>
      <span className="pd-cta-button">
        {widget.settings.label || 'Xem chi tiết'} <ArrowRightOutlined />
      </span>
    </>
  );
  if (href.startsWith('#')) return (
    <a href={href} className="pd-cta" onClick={event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = document.getElementById(href.slice(1));
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      window.history.replaceState(window.history.state, '', href);
    }}>
      {content}
    </a>
  );
  return href.startsWith('/') ? (
    <Link to={href} className="pd-cta">
      {content}
    </Link>
  ) : (
    <a href={href} className="pd-cta" target="_blank" rel="noopener noreferrer">
      {content}
    </a>
  );
}

// ---------------------------------------------------------------- HTML tùy biến: làm sạch lại ở trình duyệt, chạy trong iframe không quyền.

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function customHtmlHref(value: string) {
  if (value.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value, window.location.href);
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function readField(source: unknown, field: string): unknown {
  return source && typeof source === 'object' ? (source as Record<string, unknown>)[field] : undefined;
}

export function bindingText(binding: CustomHtmlBinding, data: PublicDashboardData): string {
  const record =
    binding.source === 'overview'
      ? data.overview
      : binding.source === 'target'
        ? data.targets.find(target => target.key === binding.targetKey)
        : data.documents.find(document => document.id === binding.documentId);
  let value = readField(record, binding.field);
  if (binding.field === 'status' && typeof value === 'string') value = STATUS[value]?.label ?? value;
  if (value === null || value === undefined) return '—';
  if (binding.field === 'downloadUrl' && typeof value === 'string') return apiUrl(value);
  switch (binding.format) {
    case 'number':
      return typeof value === 'number' ? num(value) : String(value);
    case 'integer':
      return typeof value === 'number' ? num(Math.round(value)) : String(value);
    case 'percent':
      return typeof value === 'number' ? `${num(value)}%` : String(value);
    case 'date':
      return date(String(value));
    case 'datetime':
      return dateTime(String(value));
    default:
      return String(value);
  }
}

function customDocument(widget: PublicDashboardWidget, data: PublicDashboardData, colors: { text: string; accent: string }) {
  const bindings = widget.settings.bindings ?? [];
  let html = widget.settings.html ?? '';
  for (const binding of bindings) {
    const slot = binding.slot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const value = escapeHtml(bindingText(binding, data));
    html = html.replace(new RegExp(`{{\\s*${slot}\\s*}}`, 'g'), () => value);
  }
  const clean = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'meta', 'link', 'base', 'img', 'svg'],
    FORBID_ATTR: ['srcset', 'srcdoc', 'formaction'],
  });
  const template = document.createElement('template');
  template.innerHTML = clean;
  template.content.querySelectorAll<HTMLElement>('*').forEach(element => {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith('on')) element.removeAttribute(attribute.name);
      if (name === 'style' && /url\s*\(|expression\s*\(|@import/i.test(value)) element.removeAttribute(attribute.name);
      if (name === 'href') {
        const href = customHtmlHref(value);
        if (href === null) element.removeAttribute(attribute.name);
        else element.setAttribute(attribute.name, href);
      }
    }
    if (element.tagName === 'A') {
      element.setAttribute('target', '_blank');
      element.setAttribute('rel', 'noopener noreferrer');
    }
  });
  template.content.querySelectorAll<HTMLElement>('[data-ioc-slot]').forEach(element => {
    const binding = bindings.find(item => item.slot === element.getAttribute('data-ioc-slot'));
    if (binding) element.textContent = bindingText(binding, data);
  });
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"><style>html,body{margin:0;background:transparent}body{font:14px/1.6 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:${colors.text};overflow:auto;overflow-wrap:anywhere}*{box-sizing:border-box}a{color:${colors.accent}}h1,h2,h3,h4{margin:0 0 8px;line-height:1.3}p{margin:0 0 8px}table{border-collapse:collapse;width:100%}th,td{padding:6px 8px;border-bottom:1px solid rgba(127,127,127,.25);text-align:left}</style></head><body>${template.innerHTML}</body></html>`;
}

function CustomHtml({ widget, data, colors }: { widget: PublicDashboardWidget; data: PublicDashboardData; colors: { text: string; accent: string } }) {
  const srcDoc = useMemo(() => customDocument(widget, data, colors), [widget, data, colors]);
  return (
    <>
      <Head title={widget.title} />
      <iframe className="pd-frame" title={widget.title || 'Nội dung tùy biến'} sandbox="allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" srcDoc={srcDoc} />
    </>
  );
}

/** Nội dung một khối. Dùng chung cho trang công khai và khung chỉnh sửa. */
export function WidgetView({ widget, data, colors }: { widget: PublicDashboardWidget; data: PublicDashboardData; colors: { text: string; accent: string } }) {
  switch (widget.type) {
    case 'overviewMetrics':
      return <Overview widget={widget} data={data} />;
    case 'targetList':
      return <Targets widget={widget} data={data} />;
    case 'departmentProgress':
      return <Departments widget={widget} data={data} />;
    case 'feedbackList':
      return <Feedbacks widget={widget} data={data} />;
    case 'documentList':
      return <Documents widget={widget} data={data} />;
    case 'richText':
      return <RichText widget={widget} />;
    case 'customHtml':
      return <CustomHtml widget={widget} data={data} colors={colors} />;
    case 'cta':
      return <Cta widget={widget} />;
  }
}

/** Biến màu của trang công khai; ở giao diện tối dùng màu hệ thống, chỉ giữ màu nhấn. */
export function themeStyle(config: PublicDashboardConfig, dark: boolean): CSSProperties {
  const { theme } = config;
  return {
    '--pd-accent': dark ? `color-mix(in srgb, ${theme.accent} 62%, white)` : theme.accent,
    '--pd-accent-fill': theme.accent,
    '--pd-bg': dark ? 'var(--ioc-color-bg-layout)' : theme.background,
    '--pd-surface': dark ? 'var(--ioc-color-bg-container)' : theme.surface,
    '--pd-text': dark ? 'var(--ioc-color-text)' : theme.text,
    '--pd-radius': `${Math.min(theme.radius, 24)}px`,
    '--pd-width': `${theme.contentWidth}px`,
    '--pd-row': `${ROW_HEIGHT}px`,
    '--pd-gap': `${GAP}px`,
  } as CSSProperties;
}

export function useFrameColors(config: PublicDashboardConfig, dark: boolean) {
  return useMemo(() => ({ text: dark ? '#e6e8eb' : config.theme.text, accent: dark ? '#7cc4bc' : config.theme.accent }), [config.theme.text, config.theme.accent, dark]);
}

/** Cỡ màn hình theo bề rộng khung chứa (không theo cửa sổ) để xem trước đúng trong trình dựng. */
export function useBreakpoint(forced?: PublicDashboardBreakpoint, desktopMin = 1000) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [breakpoint, setBreakpoint] = useState<PublicDashboardBreakpoint>('desktop');
  useLayoutEffect(() => {
    if (forced || !ref.current) return;
    const element = ref.current;
    const apply = (width: number) => setBreakpoint(width < 640 ? 'mobile' : width < desktopMin ? 'tablet' : 'desktop');
    apply(element.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => apply(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [forced, desktopMin]);
  return { ref, breakpoint: forced ?? breakpoint };
}

/** Trang công khai theo cấu hình: lưới 12/8/4 cột, các khối đặt theo bố cục đã lưu, hàng tự giãn theo nội dung. */
export function PublicRenderer({ config, data, breakpoint: forced }: { config: PublicDashboardConfig; data: PublicDashboardData; breakpoint?: PublicDashboardBreakpoint }) {
  const { dark } = useThemeMode();
  const { hash } = useLocation();
  const { ref, breakpoint } = useBreakpoint(forced, Math.min(1000, config.theme.contentWidth - 48));
  const colors = useFrameColors(config, dark);
  const layout = config.layouts[breakpoint];
  useEffect(() => {
    if (forced || !hash) return;
    let id: string;
    try { id = decodeURIComponent(hash.slice(1)); } catch { return; }
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(id);
      if (target && ref.current?.contains(target)) target.scrollIntoView({ block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [forced, hash, layout, ref]);
  const byId = new Map(config.widgets.map(widget => [widget.id, widget]));
  const ordered = [...layout].sort((a, b) => a.y - b.y || a.x - b.x);
  return (
    <div ref={ref} className="pd" style={themeStyle(config, dark)}>
      <div className="pd-grid" style={{ '--cols': COLS[breakpoint] } as CSSProperties}>
        {ordered.map(item => {
          const widget = byId.get(item.i);
          if (!widget) return null;
          return (
            <section
              key={widget.id}
              id={`khoi-${widget.id}`}
              className={`pd-card pd-w-${widget.type}`}
              style={{ gridColumn: `${item.x + 1} / span ${Math.min(item.w, COLS[breakpoint])}`, gridRow: `${item.y + 1} / span ${item.h}` }}
            >
              <WidgetView widget={widget} data={data} colors={colors} />
            </section>
          );
        })}
      </div>
    </div>
  );
}
