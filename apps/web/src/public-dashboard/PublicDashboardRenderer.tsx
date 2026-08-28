import DOMPurify from 'dompurify';
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Building2,
  CheckCircle2,
  Download,
  FileText,
  Landmark,
  MessageCircleMore,
  Target,
} from 'lucide-react';
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { downloadApiResponse, resolveApiUrl } from '../api';
import type { PublishedFeedback, PublicTarget } from '../types';
import { PUBLIC_DASHBOARD_COLS, normalizePublicDashboardConfig } from './defaults';
import './studio.css';
import type {
  CustomHtmlBinding,
  PublicDashboardBreakpoint,
  PublicDashboardConfig,
  PublicDashboardData,
  PublicDashboardDocument,
  PublicDashboardWidget,
} from './types';

type RendererProps = {
  config: PublicDashboardConfig;
  data: PublicDashboardData;
  className?: string;
  studioPreview?: boolean;
  forcedBreakpoint?: PublicDashboardBreakpoint;
  selectedWidgetId?: string | null;
  onSelectWidget?: (id: string) => void;
};

const metricDefinitions = {
  departments: { label: 'Đơn vị có chỉ tiêu', icon: Landmark, value: (data: PublicDashboardData) => data.overview.departments.length },
  total: { label: 'Tổng chỉ tiêu', icon: Target, value: (data: PublicDashboardData) => data.overview.total },
  completed: { label: 'Đã hoàn thành', icon: CheckCircle2, value: (data: PublicDashboardData) => data.overview.completed },
  overallProgress: { label: 'Tiến độ chung', icon: BarChart3, value: (data: PublicDashboardData) => `${data.overview.overallProgress}%` },
} as const;

function useBreakpoint(forced?: PublicDashboardBreakpoint) {
  const [breakpoint, setBreakpoint] = useState<PublicDashboardBreakpoint>(forced ?? 'desktop');
  useEffect(() => {
    if (forced) {
      setBreakpoint(forced);
      return;
    }
    const update = () => setBreakpoint(window.innerWidth <= 640 ? 'mobile' : window.innerWidth <= 980 ? 'tablet' : 'desktop');
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [forced]);
  return forced ?? breakpoint;
}

function formatNumber(value: number) {
  return value.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
}

function formatTargetValue(value: number, unit: string) {
  return `${formatNumber(value)} ${unit}`;
}

function statusLabel(status: string) {
  if (status === 'COMPLETED') return 'Hoàn thành';
  if (status === 'ON_TRACK') return 'Đúng tiến độ';
  if (status === 'OVERDUE') return 'Quá hạn';
  if (status === 'NOT_STARTED') return 'Chưa bắt đầu';
  return 'Cần theo dõi';
}

function WidgetShell({ widget, children, studioPreview, selected, onSelect }: {
  widget: PublicDashboardWidget;
  children: ReactNode;
  studioPreview?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}) {
  return <section
    id={`widget-${widget.id}`}
    className={`public-widget public-widget-${widget.type}${studioPreview ? ' studio-rendered-widget' : ''}${selected ? ' selected' : ''}`}
  >
    {children}
    {studioPreview && <button
      type="button"
      className="studio-widget-select-overlay"
      aria-label={`Chọn khối ${widget.title || 'chưa đặt tên'} để chỉnh sửa`}
      aria-pressed={Boolean(selected)}
      onClick={event => { event.stopPropagation(); onSelect?.(); }}
    />}
  </section>;
}

function OverviewMetrics({ widget, data }: { widget: PublicDashboardWidget; data: PublicDashboardData }) {
  const requested = Array.isArray(widget.settings.metricKeys) ? widget.settings.metricKeys : Object.keys(metricDefinitions);
  const keys = requested.filter((key): key is keyof typeof metricDefinitions => key in metricDefinitions);
  return <div className="public-widget-content public-overview-widget">
    <div className="public-widget-heading"><div><span>SỐ LIỆU ĐÃ CÔNG BỐ</span><h2>{widget.title}</h2></div>{data.overview.updatedAt && <time dateTime={data.overview.updatedAt}>Cập nhật {new Date(data.overview.updatedAt).toLocaleDateString('vi-VN')}</time>}</div>
    <div className="public-metric-grid">{keys.map(key => {
      const definition = metricDefinitions[key];
      const Icon = definition.icon;
      return <article key={key}><Icon /><div><strong>{definition.value(data)}</strong><span>{definition.label}</span></div></article>;
    })}</div>
  </div>;
}

function TargetCard({ item }: { item: PublicTarget }) {
  const progress = Math.max(0, Math.min(100, item.progress));
  return <article className="public-studio-target-card">
    <div><span>{item.code}</span><i className={item.status.toLowerCase()}>{statusLabel(item.status)}</i></div>
    <h3>{item.title}</h3>
    <p><Building2 />{item.department}</p>
    <strong>{formatTargetValue(item.currentValue, item.unit)} <small>/ {formatTargetValue(item.targetValue, item.unit)}</small></strong>
    <div className="public-studio-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><i style={{ width: `${progress}%` }} /></div>
    <footer><span>Tiến độ thực hiện</span><b>{progress}%</b></footer>
  </article>;
}

function TargetList({ widget, data }: { widget: PublicDashboardWidget; data: PublicDashboardData }) {
  const mode = widget.settings.mode ?? 'highlight';
  const targetKeys = Array.isArray(widget.settings.targetKeys) ? widget.settings.targetKeys : [];
  const maxItems = Math.max(1, Math.min(24, Number(widget.settings.maxItems) || 6));
  let items = mode === 'highlight' ? data.overview.highlights : data.targets;
  if (mode === 'selected') items = data.targets.filter(item => targetKeys.includes(item.key) || targetKeys.includes(item.code));
  items = items.slice(0, maxItems);
  return <div className="public-widget-content">
    <div className="public-widget-heading"><div><span>CHỈ TIÊU CÔNG KHAI</span><h2>{widget.title}</h2></div><b>{items.length} chỉ tiêu</b></div>
    {items.length ? <div className="public-studio-target-grid">{items.map(item => <TargetCard key={item.key} item={item} />)}</div> : <EmptyWidget icon={<Target />} text="Chưa có chỉ tiêu phù hợp với cấu hình hiển thị." />}
  </div>;
}

function DepartmentProgress({ widget, data }: { widget: PublicDashboardWidget; data: PublicDashboardData }) {
  const maxItems = Math.max(1, Math.min(30, Number(widget.settings.maxItems) || 8));
  const items = data.overview.departments.slice(0, maxItems);
  return <div className="public-widget-content">
    <div className="public-widget-heading"><div><span>KẾT QUẢ THEO ĐƠN VỊ</span><h2>{widget.title}</h2></div></div>
    {items.length ? <div className="public-studio-departments">{items.map((department, index) => <article key={department.key}>
      <b>{String(index + 1).padStart(2, '0')}</b><div><strong>{department.name}</strong><span>{department.completed}/{department.total} chỉ tiêu hoàn thành</span><div className="public-studio-progress"><i style={{ width: `${Math.max(0, Math.min(100, department.progress))}%`, background: department.color }} /></div></div><em>{department.progress}%</em>
    </article>)}</div> : <EmptyWidget icon={<Building2 />} text="Chưa có dữ liệu đơn vị được công bố." />}
  </div>;
}

function FeedbackList({ widget, data }: { widget: PublicDashboardWidget; data: PublicDashboardData }) {
  const maxItems = Math.max(1, Math.min(12, Number(widget.settings.maxItems) || 4));
  const items = data.feedbacks.slice(0, maxItems);
  return <div className="public-widget-content">
    <div className="public-widget-heading"><div><span>KẾT QUẢ PHỤC VỤ NGƯỜI DÂN</span><h2>{widget.title}</h2></div><Link to="/phan-anh">Gửi phản ánh <ArrowRight /></Link></div>
    {items.length ? <div className="public-studio-feedbacks">{items.map((item: PublishedFeedback) => <Link key={item.code} to={`/phan-anh/cong-khai/${encodeURIComponent(item.code)}`}>
      <span><BadgeCheck />{item.department?.name ?? 'Kết quả xử lý'}</span><time>{new Date(item.publicPublishedAt).toLocaleDateString('vi-VN')}</time><h3>{item.publicTitle ?? 'Kết quả xử lý phản ánh'}</h3><p>{item.publicSummary ?? 'Kết quả đã được kiểm duyệt trước khi công bố.'}</p><b>Xem quá trình xử lý <ArrowRight /></b>
    </Link>)}</div> : <EmptyWidget icon={<MessageCircleMore />} text="Chưa có phản ánh mới được công bố." />}
  </div>;
}

function SecureDocumentDownload({ item, downloadUrl, children }: {
  item: PublicDashboardDocument;
  downloadUrl: string;
  children: ReactNode;
}) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  useEffect(() => {
    if (!downloadError) return;
    const timer = window.setTimeout(() => setDownloadError(''), 5500);
    return () => window.clearTimeout(timer);
  }, [downloadError]);

  async function handleDownload() {
    if (downloading) return;
    setDownloading(true);
    setDownloadError('');
    try {
      const response = await downloadApiResponse(downloadUrl);
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') ?? '';
      const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
      const quotedName = disposition.match(/filename="([^"]+)"/i)?.[1];
      let fileName = `${item.code || 'van-ban-cong-khai'}.pdf`;
      try { fileName = encodedName ? decodeURIComponent(encodedName) : quotedName || fileName; } catch { /* use safe fallback */ }
      const blobUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = fileName.replace(/[\\/:*?"<>|]/g, '-');
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch {
      setDownloadError('Chưa thể tải bản xem trước. Hãy kiểm tra trạng thái công bố hoặc thử lại sau.');
    } finally {
      setDownloading(false);
    }
  }

  return <>
    <button type="button" className="public-document-download" onClick={() => void handleDownload()} disabled={downloading} aria-busy={downloading}>
      {children}
      {downloading && <span className="public-document-download-state">Đang tải…</span>}
    </button>
    {downloadError && <div className="public-document-toast" role="alert"><FileText /><span>{downloadError}</span><button type="button" onClick={() => setDownloadError('')} aria-label="Đóng thông báo">×</button></div>}
  </>;
}

function DocumentList({ widget, data }: { widget: PublicDashboardWidget; data: PublicDashboardData }) {
  const selected = Array.isArray(widget.settings.publicationIds) ? widget.settings.publicationIds : [];
  const maxItems = Math.max(1, Math.min(20, Number(widget.settings.maxItems) || 6));
  let items = selected.length ? data.documents.filter(item => selected.includes(item.id)) : [];
  items = items.slice(0, maxItems);
  return <div className="public-widget-content">
    <div className="public-widget-heading"><div><span>VĂN BẢN CÔNG KHAI</span><h2>{widget.title}</h2></div></div>
    {items.length ? <div className="public-studio-documents">{items.map((item: PublicDashboardDocument) => {
      const requestedUrl = String(item.downloadUrl ?? '').trim();
      const downloadUrl = /^(?:\/(?!\/)|https:\/\/)/i.test(requestedUrl) ? requestedUrl : '';
      const content = <><FileText /><div><span>{item.code}</span><strong>{item.title}</strong>{item.summary && <p>{item.summary}</p>}{item.publishedAt && <time>Công bố {new Date(item.publishedAt).toLocaleDateString('vi-VN')}</time>}</div>{downloadUrl && <Download />}</>;
      if (/^\/api\/public-dashboard\/.*\/download(?:\?|$)/i.test(downloadUrl)) return <SecureDocumentDownload key={item.id} item={item} downloadUrl={downloadUrl}>{content}</SecureDocumentDownload>;
      return downloadUrl ? <a key={item.id} href={resolveApiUrl(downloadUrl)} target="_blank" rel="noopener noreferrer">{content}</a> : <article key={item.id}>{content}</article>;
    })}</div> : <EmptyWidget icon={<FileText />} text="Chưa có văn bản được chọn để công khai." />}
  </div>;
}

function RichText({ widget }: { widget: PublicDashboardWidget }) {
  return <div className="public-widget-content public-rich-text"><span>THÔNG TIN</span><h2>{widget.title}</h2><p>{String(widget.settings.body ?? '').trim() || 'Nội dung đang được cập nhật.'}</p></div>;
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function readField(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined, source);
}

function bindingValue(binding: CustomHtmlBinding, data: PublicDashboardData) {
  const record = binding.source === 'overview'
    ? data.overview
    : binding.source === 'target'
      ? data.targets.find(item => item.key === binding.targetKey || item.code === binding.targetKey)
      : data.documents.find(item => item.id === binding.documentId);
  const value = readField(record, binding.field);
  if (binding.format === 'number' && typeof value === 'number') return formatNumber(value);
  if (binding.format === 'percent' && typeof value === 'number') return `${formatNumber(value)}%`;
  if (binding.format === 'date' && typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('vi-VN');
  }
  return value ?? '';
}

function customHtmlDocument(widget: PublicDashboardWidget, data: PublicDashboardData) {
  let html = String(widget.settings.html ?? '');
  const bindings = Array.isArray(widget.settings.bindings) ? widget.settings.bindings : [];
  for (const binding of bindings) {
    const slot = binding.slot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    html = html.replace(new RegExp(`{{\\s*${slot}\\s*}}`, 'g'), escapeHtml(bindingValue(binding, data)));
  }
  const sanitized = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'meta', 'link', 'base'],
    FORBID_ATTR: ['srcset', 'srcdoc', 'formaction'],
  });
  const template = document.createElement('template');
  template.innerHTML = sanitized;
  template.content.querySelectorAll<HTMLElement>('*').forEach(element => {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith('on') || name === 'srcdoc' || name === 'formaction') element.removeAttribute(attribute.name);
      if (name === 'style' && /(?:url\s*\(|expression\s*\(|@import|-moz-binding)/i.test(value)) element.removeAttribute('style');
      if ((name === 'href' || name === 'src') && !/^(?:\/(?!\/)|#|data:image\/(?:png|jpeg|gif|webp);base64,)/i.test(value)) element.removeAttribute(attribute.name);
    }
  });
  template.content.querySelectorAll<HTMLElement>('[data-ioc-slot]').forEach(element => {
    const slot = element.getAttribute('data-ioc-slot');
    const binding = bindings.find(item => item.slot === slot);
    if (binding) element.textContent = String(bindingValue(binding, data));
  });
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none';"><style>html,body{margin:0;min-height:100%;font-family:system-ui,sans-serif;color:#173633;background:transparent}body{padding:4px;box-sizing:border-box}*{box-sizing:border-box}a{color:#0f8378}.custom-card{height:100%;padding:20px;border:1px solid #dce8e5;border-radius:14px;background:#f7fbfa}.custom-card p{margin:0 0 8px;color:#6c817d}.custom-card strong{font-size:32px;color:#0f8378}</style></head><body>${template.innerHTML}</body></html>`;
}

function CustomHtml({ widget, data }: { widget: PublicDashboardWidget; data: PublicDashboardData }) {
  const srcDoc = useMemo(() => customHtmlDocument(widget, data), [widget, data]);
  return <iframe className="public-custom-html-frame" title={widget.title ? `Nội dung tùy biến: ${widget.title}` : 'Nội dung tùy biến trên dashboard'} sandbox="" loading="lazy" referrerPolicy="no-referrer" srcDoc={srcDoc} />;
}

function Cta({ widget }: { widget: PublicDashboardWidget }) {
  const requestedHref = String(widget.settings.href ?? '/phan-anh').trim();
  let href = '/phan-anh';
  if (/^https:\/\//i.test(requestedHref)) href = requestedHref;
  else if (requestedHref.startsWith('/') && !requestedHref.startsWith('//') && !requestedHref.includes('\\')) {
    try {
      const resolved = new URL(requestedHref, window.location.origin);
      if (resolved.origin === window.location.origin) href = `${resolved.pathname}${resolved.search}${resolved.hash}`;
    } catch { /* use the safe citizen-feedback fallback */ }
  }
  const label = String(widget.settings.label ?? 'Xem chi tiết');
  const content = <><div><span>KÊNH PHỤC VỤ NGƯỜI DÂN</span><h2>{widget.title}</h2><p>{String(widget.settings.body ?? '')}</p></div><b>{label}<ArrowRight /></b></>;
  return href.startsWith('/') ? <Link className="public-studio-cta" to={href}>{content}</Link> : <a className="public-studio-cta" href={href} target="_blank" rel="noopener noreferrer">{content}</a>;
}

function EmptyWidget({ icon, text }: { icon: ReactNode; text: string }) {
  return <div className="public-widget-empty">{icon}<span>{text}</span></div>;
}

export function renderPublicDashboardWidget(widget: PublicDashboardWidget, data: PublicDashboardData) {
  if (widget.type === 'overviewMetrics') return <OverviewMetrics widget={widget} data={data} />;
  if (widget.type === 'targetList') return <TargetList widget={widget} data={data} />;
  if (widget.type === 'departmentProgress') return <DepartmentProgress widget={widget} data={data} />;
  if (widget.type === 'feedbackList') return <FeedbackList widget={widget} data={data} />;
  if (widget.type === 'documentList') return <DocumentList widget={widget} data={data} />;
  if (widget.type === 'richText') return <RichText widget={widget} />;
  if (widget.type === 'customHtml') return <CustomHtml widget={widget} data={data} />;
  return <Cta widget={widget} />;
}

export default function PublicDashboardRenderer({ config: unsafeConfig, data, className = '', studioPreview, forcedBreakpoint, selectedWidgetId, onSelectWidget }: RendererProps) {
  const config = useMemo(() => normalizePublicDashboardConfig(unsafeConfig), [unsafeConfig]);
  const breakpoint = useBreakpoint(forcedBreakpoint);
  const cols = PUBLIC_DASHBOARD_COLS[breakpoint];
  const layout = config.layouts[breakpoint];
  const layoutById = new Map(layout.map(item => [item.i, item]));
  const orderedWidgets = [...config.widgets].sort((left, right) => {
    const leftLayout = layoutById.get(left.id);
    const rightLayout = layoutById.get(right.id);
    return (leftLayout?.y ?? Number.MAX_SAFE_INTEGER) - (rightLayout?.y ?? Number.MAX_SAFE_INTEGER)
      || (leftLayout?.x ?? Number.MAX_SAFE_INTEGER) - (rightLayout?.x ?? Number.MAX_SAFE_INTEGER);
  });
  const style = {
    '--public-dashboard-accent': config.theme.accent,
    '--public-dashboard-background': config.theme.background,
    '--public-dashboard-surface': config.theme.surface,
    '--public-dashboard-text': config.theme.text,
    '--public-dashboard-width': `${config.theme.contentWidth}px`,
    '--public-dashboard-radius': `${config.theme.radius}px`,
    '--public-dashboard-cols': cols,
  } as CSSProperties;
  return <div className={`public-dashboard-renderer ${className}`} style={style} data-breakpoint={breakpoint}>
    <div className="public-dashboard-grid">{orderedWidgets.map(widget => {
      const item = layoutById.get(widget.id);
      if (!item) return null;
      const gridStyle = {
        gridColumn: `${item.x + 1} / span ${Math.min(cols, item.w)}`,
        gridRow: `${item.y + 1} / span ${item.h}`,
      };
      return <div key={widget.id} className="public-dashboard-grid-item" style={gridStyle}>
        <WidgetShell widget={widget} studioPreview={studioPreview} selected={selectedWidgetId === widget.id} onSelect={() => onSelectWidget?.(widget.id)}>
          {renderPublicDashboardWidget(widget, data)}
        </WidgetShell>
      </div>;
    })}</div>
  </div>;
}
