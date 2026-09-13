import {
  AlertCircle,
  ArrowRight,
  ArrowUp,
  BadgeCheck,
  BarChart3,
  Building2,
  CheckCircle2,
  CircleUserRound,
  Clock3,
  Landmark,
  Menu,
  MessageCircleMore,
  ShieldCheck,
  Target,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { AnimationEvent, CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { CountUp, Reveal, ScrollGrid } from '../components/Motion';
import ScrollProgress from '../components/ScrollProgress';
import { toast } from '../components/Toast';
import { Empty, Skeleton } from '../components/UI';
import { currentVietnamYear } from '../date';
import { prefersReducedMotion } from '../motion';
import { PUBLIC_DASHBOARD_WIDGET_LABELS, normalizePublicDashboardConfig } from '../public-dashboard/defaults';
import PublicDashboardRenderer from '../public-dashboard/PublicDashboardRenderer';
import type { PublicDashboardResponse } from '../public-dashboard/types';
import type {
  FeedbackCategory,
  PublishedFeedback,
  PublicOverview,
  PublicTarget,
  PublicTargetListResponse,
} from '../types';
import '../styles/public-site.css';

const feedbackCategoryNames: Record<FeedbackCategory, string> = {
  INFRASTRUCTURE: 'Hạ tầng đô thị',
  ENVIRONMENT: 'Môi trường',
  ADMINISTRATIVE_PROCEDURE: 'Thủ tục hành chính',
  SECURITY_ORDER: 'An ninh trật tự',
  SOCIAL_WELFARE: 'An sinh xã hội',
  CULTURE_EDUCATION: 'Văn hóa - giáo dục',
  OTHER: 'Nội dung khác',
};

function formatValue(value: number, unit: string) {
  return `${value.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} ${unit}`;
}

function formatDay(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

/** Góc quét của vòng tiến độ — nguyên thể `.ring` đọc biến `--p`. */
function ringStyle(progress: number): CSSProperties {
  return { '--p': `${Math.max(0, Math.min(100, progress)) * 3.6}deg` } as CSSProperties;
}

function progressDecimals(value: number) {
  return value.toLocaleString('vi-VN', { maximumFractionDigits: 20 }).split(',')[1]?.length ?? 0;
}

/** Giữ trạng thái cuối của timeline cuộn, kể cả khi người đọc cuộn ngược. */
function finishScrollReveal(event: AnimationEvent<HTMLElement>) {
  if (event.target === event.currentTarget && event.animationName === 'ioc-reveal-scroll') {
    event.currentTarget.dataset.scrollRevealed = 'true';
  }
}

const FEATURED_FILTER = 'featured';
const ALL_TARGETS_FILTER = 'all';
const DEPARTMENT_FILTER_PREFIX = 'department:';

function selectedDepartment(filter: string) {
  return filter.startsWith(DEPARTMENT_FILTER_PREFIX)
    ? filter.slice(DEPARTMENT_FILTER_PREFIX.length)
    : '';
}

function mergePublicTargets(current: PublicTarget[], incoming: PublicTarget[]) {
  const merged = new Map(current.map(item => [item.key, item]));
  for (const item of incoming) merged.set(item.key, item);
  return [...merged.values()];
}

function targetStatus(status: string) {
  if (status === 'COMPLETED') return { label: 'Hoàn thành', className: 'done' };
  if (status === 'ON_TRACK') return { label: 'Đúng tiến độ', className: 'good' };
  if (status === 'OVERDUE') return { label: 'Quá hạn', className: 'overdue' };
  if (status === 'NOT_STARTED') return { label: 'Chưa bắt đầu', className: 'neutral' };
  return { label: 'Cần theo dõi', className: 'watch' };
}

/** Thông báo lỗi tại chỗ, kèm một hành động tải lại. */
function PublicAlert({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="alert bad public-alert" role="alert">
    <AlertCircle />
    <p>{message}</p>
    <button type="button" className="btn secondary compact" onClick={onRetry}>Thử tải lại</button>
  </div>;
}

/** Khung xương của một lưới thẻ — giữ đúng nhịp lưới để không nhảy bố cục. */
function PublicCardSkeletons({ count = 3, row = false }: { count?: number; row?: boolean }) {
  return <div className="public-skeleton-grid" role="status" aria-label="Đang tải dữ liệu">
    {Array.from({ length: count }, (_, index) =>
      <Skeleton key={index} className={row ? 'public-skeleton-row' : 'public-skeleton-card'} />)}
  </div>;
}

function PublicTargetCard({ item, index }: { item: PublicTarget; index: number }) {
  const status = targetStatus(item.status);
  const progress = Math.max(0, Math.min(100, item.progress));
  return <Reveal asChild index={index + 1}><article className="highlight-card public-target-card" onAnimationEnd={finishScrollReveal}>
    <div className="highlight-top">
      <span className="public-target-code">Mã {item.code}</span>
      <i className={status.className}>{status.label}</i>
    </div>
    <h3>{item.title}</h3>
    <p><Building2 />{item.department}</p>
    <div className="public-target-metrics">
      <div
        className="ring public-ring grow"
        style={ringStyle(progress)}
        role="progressbar"
        aria-label={`Tiến độ chỉ tiêu ${item.code}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      ><span>{item.progress}%</span></div>
      <div className="highlight-values">
        <strong>{formatValue(item.currentValue, item.unit)}</strong>
        <span>/ {formatValue(item.targetValue, item.unit)}</span>
      </div>
    </div>
    <div className="highlight-foot"><span>Hạn hoàn thành</span><b>{formatDay(item.dueDate)}</b></div>
  </article></Reveal>;
}

export default function PublicHome() {
  const [publicDashboard, setPublicDashboard] = useState<PublicDashboardResponse | null>(null);
  const [dashboardResolved, setDashboardResolved] = useState(false);
  const [data, setData] = useState<PublicOverview>();
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [error, setError] = useState('');
  const [targetFilter, setTargetFilter] = useState(FEATURED_FILTER);
  const [publicTargets, setPublicTargets] = useState<PublicTarget[]>([]);
  const [publicTargetsLoading, setPublicTargetsLoading] = useState(false);
  const [publicTargetsError, setPublicTargetsError] = useState('');
  const [publicTargetsPage, setPublicTargetsPage] = useState(1);
  const [publicTargetsPageCount, setPublicTargetsPageCount] = useState(0);
  const [publicTargetsTotal, setPublicTargetsTotal] = useState(0);
  const [publishedFeedbacks, setPublishedFeedbacks] = useState<PublishedFeedback[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(true);
  const [feedbackError, setFeedbackError] = useState('');
  const [menu, setMenu] = useState(false);
  const [stuck, setStuck] = useState(false);
  const [atTop, setAtTop] = useState(true);
  const menuNavRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuCloseRef = useRef<HTMLButtonElement>(null);
  const targetRequestRef = useRef(0);
  const year = currentVietnamYear();

  async function loadOverview() {
    setOverviewLoading(true);
    setError('');
    try {
      setData(await api<PublicOverview>('/public/overview'));
      return true;
    } catch (reason) {
      setData(undefined);
      setError(reason instanceof Error ? reason.message : 'Dữ liệu công khai đang được cập nhật');
      return false;
    } finally {
      setOverviewLoading(false);
    }
  }

  async function loadPublishedFeedbacks() {
    setFeedbackLoading(true);
    setFeedbackError('');
    try {
      setPublishedFeedbacks(await api<PublishedFeedback[]>('/public/feedbacks/published'));
      return true;
    } catch (reason) {
      setFeedbackError(reason instanceof Error ? reason.message : 'Không thể tải kết quả phản ánh công khai');
      return false;
    } finally {
      setFeedbackLoading(false);
    }
  }

  async function loadPublicTargets(page: number, append: boolean, department: string) {
    const requestId = ++targetRequestRef.current;
    setPublicTargetsLoading(true);
    setPublicTargetsError('');
    try {
      const params = new URLSearchParams({
        year: String(data?.year ?? year),
        page: String(page),
        pageSize: '6',
      });
      if (department) params.set('department', department);
      const response = await api<PublicTargetListResponse>(`/public/targets?${params.toString()}`);
      if (requestId !== targetRequestRef.current) return null;
      setPublicTargets(current => append ? mergePublicTargets(current, response.items) : response.items);
      setPublicTargetsPage(response.page);
      setPublicTargetsPageCount(response.pageCount);
      setPublicTargetsTotal(response.total);
      return true;
    } catch (reason) {
      if (requestId !== targetRequestRef.current) return null;
      setPublicTargetsError(reason instanceof Error ? reason.message : 'Không thể tải danh sách chỉ tiêu công khai');
      return false;
    } finally {
      if (requestId === targetRequestRef.current) setPublicTargetsLoading(false);
    }
  }

  /* Chỉ báo kết quả cho các lần người dùng chủ động tải lại — lần tải đầu im lặng. */
  async function retryOverview() {
    if (await loadOverview()) toast.ok('Đã tải lại số liệu công khai');
    else toast.error('Chưa thể tải lại số liệu công khai');
  }

  async function retryPublishedFeedbacks() {
    if (await loadPublishedFeedbacks()) toast.ok('Đã tải lại kết quả phản ánh công khai');
    else toast.error('Chưa thể tải lại kết quả phản ánh công khai');
  }

  async function retryPublicTargets(page: number, append: boolean) {
    const result = await loadPublicTargets(page, append, selectedDepartment(targetFilter));
    if (result === true) toast.ok('Đã tải lại danh sách chỉ tiêu công khai');
    else if (result === false) toast.error('Chưa thể tải lại danh sách chỉ tiêu công khai');
  }

  useEffect(() => {
    let active = true;
    api<PublicDashboardResponse>('/public/dashboard')
      .then(result => { if (active) setPublicDashboard(result); })
      .catch(() => { if (active) setPublicDashboard(null); })
      .finally(() => { if (active) setDashboardResolved(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!dashboardResolved || publicDashboard) return;
    void loadOverview();
    void loadPublishedFeedbacks();
  }, [dashboardResolved, publicDashboard]);

  useEffect(() => {
    if (targetFilter === FEATURED_FILTER) {
      targetRequestRef.current += 1;
      setPublicTargets([]);
      setPublicTargetsError('');
      setPublicTargetsPage(1);
      setPublicTargetsPageCount(0);
      setPublicTargetsTotal(0);
      setPublicTargetsLoading(false);
      return;
    }
    setPublicTargets([]);
    setPublicTargetsPage(1);
    setPublicTargetsPageCount(0);
    setPublicTargetsTotal(0);
    void loadPublicTargets(1, false, selectedDepartment(targetFilter));
  }, [targetFilter, data?.year]);

  useEffect(() => {
    const targetId=decodeURIComponent(window.location.hash.replace(/^#/,''));
    if(!targetId)return;
    const frame=requestAnimationFrame(()=>document.getElementById(targetId)?.scrollIntoView({block:'start'}));
    return()=>cancelAnimationFrame(frame);
  }, [dashboardResolved, publicDashboard]);

  /* Thanh điều hướng chuyển sang nền đặc, nút "về đầu trang" hiện sau ~600px. */
  useEffect(() => {
    let frame = 0;
    let wasStuck = false;
    let wasAtTop = true;
    const measure = () => {
      frame = 0;
      const offset = window.scrollY;
      const nextStuck = offset > 40;
      const nextAtTop = offset <= 600;
      if (nextStuck !== wasStuck) { wasStuck = nextStuck; setStuck(nextStuck); }
      if (nextAtTop !== wasAtTop) { wasAtTop = nextAtTop; setAtTop(nextAtTop); }
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(measure); };
    window.addEventListener('scroll', schedule, { passive: true });
    measure();
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
    };
  }, []);

  useEffect(() => {
    if (!menu) return;
    const previousOverflow = document.body.style.overflow;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : menuButtonRef.current;
    document.body.style.overflow = 'hidden';
    const focusFrame = requestAnimationFrame(() => menuCloseRef.current?.focus());
    const keepFocusInside = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenu(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const nav = menuNavRef.current;
      const items = [...(nav?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])];
      if (!nav || !items.length) {
        event.preventDefault();
        nav?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (!nav.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', keepFocusInside);
    return () => {
      cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', keepFocusInside);
      document.body.style.overflow = previousOverflow;
      window.setTimeout(() => {
        if (trigger?.isConnected && trigger.getClientRects().length) trigger.focus();
      }, 0);
    };
  }, [menu]);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1025px)');
    const closeDesktopMenu = () => { if (desktop.matches) setMenu(false) };
    closeDesktopMenu();
    desktop.addEventListener('change', closeDesktopMenu);
    return () => desktop.removeEventListener('change', closeDesktopMenu);
  }, []);

  const hidden = menu ? true : undefined;

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'instant' : 'smooth' });
  }

  /* Vỏ dùng chung cho cả ba nhánh hiển thị: thanh điều hướng dính + ngăn kéo. */
  function renderHeader(links: ReactNode, live?: ReactNode) {
    return <>
      <header className={`public-header${stuck ? ' is-stuck' : ''}`}>
        <Link to="/" className="public-brand" inert={hidden} aria-hidden={hidden}><div className="brand-mark">LT</div><div><strong>PHƯỜNG LÁI THIÊU</strong><span>Cổng thông tin điều hành số</span></div></Link>
        <nav ref={menuNavRef} id="public-navigation" aria-label="Điều hướng cổng thông tin" className={menu ? 'show' : ''} tabIndex={menu ? -1 : undefined}>
          {links}
          <Link to="/admin/login" className="nav-admin-link" onClick={() => setMenu(false)}><CircleUserRound />Đăng nhập hệ thống</Link>
          <button ref={menuCloseRef} aria-label="Đóng menu" className="public-nav-close" onClick={() => setMenu(false)}><X /></button>
        </nav>
        <div className="public-head-actions">
          {live}
          <Link aria-label="Đăng nhập hệ thống" to="/admin/login" className="admin-link" inert={hidden} aria-hidden={hidden}><CircleUserRound />Đăng nhập hệ thống</Link>
          <button ref={menuButtonRef} aria-label="Mở menu" aria-controls="public-navigation" aria-expanded={menu} className="public-menu" onClick={() => setMenu(true)}><Menu /></button>
        </div>
      </header>
      {menu && <div className="public-nav-backdrop" onClick={() => setMenu(false)} aria-hidden="true" />}
    </>;
  }

  /* Chân trang ba cột + dòng bản quyền. */
  function renderFooter(links: ReactNode) {
    return <footer className="public-footer" inert={hidden} aria-hidden={hidden}><div className="public-container">
      <div className="footer-grid">
        <div className="footer-brand"><div className="brand-mark">LT</div><div><strong>UBND PHƯỜNG LÁI THIÊU</strong><span>Cổng thông tin điều hành số</span></div></div>
        <div className="footer-col">
          <strong>Nội dung công khai</strong>
          <div className="footer-links">{links}</div>
        </div>
        <div className="footer-col">
          <strong>Dành cho người dân</strong>
          <div className="footer-links">
            <Link to="/phan-anh">Gửi phản ánh</Link>
            <Link to="/phan-anh">Tra cứu phản ánh</Link>
            <Link to="/admin/login">Không gian nội bộ</Link>
          </div>
        </div>
      </div>
      <p>© {year} UBND Phường Lái Thiêu.</p>
    </div></footer>;
  }

  function renderBackToTop() {
    return <button
      type="button"
      className={`back-to-top${atTop ? '' : ' show'}`}
      aria-label="Về đầu trang"
      tabIndex={atTop ? -1 : 0}
      aria-hidden={atTop ? true : undefined}
      onClick={scrollToTop}
    ><ArrowUp /></button>;
  }

  if (!dashboardResolved) {
    return <div className="public-site public-dashboard-loading-shell" data-hero="false">
      <ScrollProgress />
      <header className="public-header"><Link to="/" className="public-brand"><div className="brand-mark">LT</div><div><strong>PHƯỜNG LÁI THIÊU</strong><span>Cổng thông tin điều hành số</span></div></Link></header>
      <main role="status" aria-live="polite" className="public-boot">
        <Skeleton className="public-boot-hero" />
        <PublicCardSkeletons count={3} />
      </main>
    </div>;
  }

  if (publicDashboard) {
    const dashboardConfig = normalizePublicDashboardConfig(publicDashboard.config);
    const navigationTypes = new Set<string>();
    const navigationWidgets = dashboardConfig.widgets.filter(widget => {
      if (!['targetList', 'departmentProgress', 'feedbackList', 'documentList'].includes(widget.type) || navigationTypes.has(widget.type)) return false;
      navigationTypes.add(widget.type);
      return true;
    }).slice(0, 4);
    return <div className="public-site public-site-dynamic" data-hero="false">
      <ScrollProgress />
      {dashboardConfig.settings.showHeader && renderHeader(<>
        {navigationWidgets.map(widget => <a key={widget.id} href={`#widget-${widget.id}`} onClick={() => setMenu(false)}>{widget.title || PUBLIC_DASHBOARD_WIDGET_LABELS[widget.type]}</a>)}
        <Link to="/phan-anh" onClick={() => setMenu(false)}>Gửi phản ánh</Link>
      </>, <div className="public-live" role="status" inert={hidden} aria-hidden={hidden}><i />Dữ liệu đã công bố</div>)}
      <main inert={hidden} aria-hidden={hidden}>
        <PublicDashboardRenderer config={dashboardConfig} data={publicDashboard.data} />
      </main>
      {dashboardConfig.settings.showFooter && renderFooter(<>
        {navigationWidgets.map(widget => <a key={widget.id} href={`#widget-${widget.id}`}>{widget.title || PUBLIC_DASHBOARD_WIDGET_LABELS[widget.type]}</a>)}
      </>)}
      {renderBackToTop()}
    </div>;
  }

  const overallProgress = data?.overallProgress ?? 0;
  const updatedLabel = data?.updatedAt
    ? `Cập nhật gần nhất ${new Date(data.updatedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`
    : overviewLoading ? 'Đang tải số liệu đã được phê duyệt công khai.' : 'Chưa có số liệu công bố cho năm kế hoạch này.';

  return <div className="public-site" data-hero="true">
    <ScrollProgress />

    {renderHeader(<>
      <a href="#chi-tieu" onClick={() => setMenu(false)}>Chỉ tiêu công khai</a>
      <a href="#phong-ban" onClick={() => setMenu(false)}>Kết quả theo đơn vị</a>
      <a href="#ket-qua-phan-anh" onClick={() => setMenu(false)}>Kết quả phản ánh</a>
      <Link to="/phan-anh" onClick={() => setMenu(false)}>Gửi phản ánh</Link>
    </>, <div className={`public-live${error ? ' error' : overviewLoading ? ' loading' : ''}`} role="status" inert={hidden} aria-hidden={hidden}><i />{error ? 'Tạm thời mất kết nối' : overviewLoading ? 'Đang đồng bộ dữ liệu' : 'Số liệu đã công bố'}</div>)}

    <main inert={hidden} aria-hidden={hidden}>
      {/* ---------- Hero: giới thiệu, hai hành động chính, số liệu trực tiếp ---------- */}
      <section className="public-hero">
        <span className="hero-orb one" aria-hidden="true" />
        <span className="hero-orb two" aria-hidden="true" />
        <div className="public-container hero-grid">
          <Reveal asChild index={0}><div className="hero-copy">
            <span className="hero-kicker"><ShieldCheck />Số liệu đã phê duyệt công bố</span>
            <h1>Cổng thông tin điều hành số Phường Lái Thiêu</h1>
            <p>Theo dõi tiến độ thực hiện chỉ tiêu năm {data?.year ?? year}, kết quả xử lý phản ánh của người dân và số liệu điều hành đã được phê duyệt công khai.</p>
            <div className="hero-actions">
              <a className="public-btn primary" href="#chi-tieu"><BarChart3 />Xem chỉ tiêu công khai</a>
              <Link className="public-btn ghost" to="/phan-anh"><MessageCircleMore />Gửi phản ánh</Link>
            </div>
            <div className="hero-trust">
              <span><BadgeCheck />Đã loại bỏ thông tin riêng tư trước khi công bố</span>
              <span><Clock3 />{updatedLabel}</span>
            </div>
          </div></Reveal>

          <Reveal asChild index={1}><aside className="hero-card" aria-label="Số liệu chỉ tiêu công khai">
            <div className="hero-card-head">
              <div>
                <span>Số liệu trực tiếp</span>
                <strong>Năm kế hoạch {data?.year ?? year}</strong>
              </div>
            </div>
            {error
              ? <PublicAlert message={error} onRetry={() => void retryOverview()} />
              : overviewLoading && !data
                ? <div className="hero-card-skeleton"><Skeleton className="skeleton-ring" /><Skeleton className="skeleton-stats" /></div>
                : <>
                  <div className="hero-card-ring">
                    <div
                      className="ring public-ring grow"
                      style={ringStyle(overallProgress)}
                      role="progressbar"
                      aria-label="Tiến độ chung các chỉ tiêu công khai"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={overallProgress}
                    ><CountUp value={overallProgress} decimals={progressDecimals(overallProgress)} suffix="%" /></div>
                    <div>
                      <b>Tiến độ chung</b>
                      <p><CountUp value={data?.completed ?? 0} />/<CountUp value={data?.total ?? 0} /> chỉ tiêu đã hoàn thành</p>
                    </div>
                  </div>
                  <div className="hero-card-stats">
                    <div><b>{data ? <CountUp value={data.total} /> : '—'}</b><span>Tổng chỉ tiêu</span></div>
                    <div><b>{data ? <CountUp value={data.onTrack} /> : '—'}</b><span>Đúng tiến độ</span></div>
                    <div><b>{data ? <CountUp value={data.departments.length} /> : '—'}</b><span>Đơn vị</span></div>
                  </div>
                  <div className="hero-card-foot"><Clock3 />{updatedLabel}</div>
                </>}
          </aside></Reveal>
        </div>
      </section>

      {/* ---------- Chỉ tiêu công khai ---------------------------------------------- */}
      <Reveal asChild variant="fade"><section className="public-section public-targets-lead" id="chi-tieu"><div className="public-container">
        <Reveal asChild index={0}><div className="public-section-head">
          <div>
            <span>Chỉ tiêu công khai</span>
            <h2>Kết quả thực hiện chỉ tiêu năm {data?.year ?? year}</h2>
            <p>{updatedLabel}</p>
          </div>
          {error && <button type="button" className="btn secondary" onClick={() => void retryOverview()}>Tải lại dữ liệu</button>}
        </div></Reveal>

        <div className="stat-grid" aria-label="Tổng hợp chỉ tiêu công khai">
          <Reveal asChild index={1}><div className="stat-card"><div className="stat-icon brand"><Landmark /></div><span>Đơn vị có chỉ tiêu</span><strong>{data ? <CountUp value={data.departments.length} /> : '—'}</strong></div></Reveal>
          <Reveal asChild index={2}><div className="stat-card"><div className="stat-icon accent"><Target /></div><span>Tổng chỉ tiêu</span><strong>{data ? <CountUp value={data.total} /> : '—'}</strong></div></Reveal>
          <Reveal asChild index={3}><div className="stat-card"><div className="stat-icon ok"><CheckCircle2 /></div><span>Đã hoàn thành</span><strong>{data ? <CountUp value={data.completed} /> : '—'}</strong></div></Reveal>
          <Reveal asChild index={4}><div className="stat-card"><div className="stat-icon warn"><BarChart3 /></div><span>Tiến độ chung</span><strong>{data ? <CountUp value={data.overallProgress} decimals={progressDecimals(data.overallProgress)} suffix="%" /> : '—'}</strong></div></Reveal>
        </div>

        <Reveal asChild index={0}><div className="public-target-toolbar">
          <div>
            <h2>{targetFilter === FEATURED_FILTER ? 'Chỉ tiêu nổi bật' : 'Danh sách chỉ tiêu công khai'}</h2>
            <p>{targetFilter === FEATURED_FILTER
              ? 'Các chỉ tiêu được chọn để theo dõi nhanh.'
              : publicTargetsTotal ? `${publicTargetsTotal} chỉ tiêu phù hợp với phạm vi đã chọn.` : 'Chọn phạm vi để tra cứu chỉ tiêu.'}</p>
          </div>
          <label className="public-scope-field">
            <span>Phạm vi hiển thị</span>
            <select value={targetFilter} onChange={event => setTargetFilter(event.target.value)}>
              <option value={FEATURED_FILTER}>Chỉ tiêu nổi bật</option>
              <option value={ALL_TARGETS_FILTER}>Tất cả phòng ban</option>
              {data?.departments.map(department =>
                <option key={department.key} value={`${DEPARTMENT_FILTER_PREFIX}${department.key}`}>{department.name}</option>,
              )}
            </select>
          </label>
        </div></Reveal>

        {targetFilter === FEATURED_FILTER
          ? error
            ? <PublicAlert message={error} onRetry={() => void retryOverview()} />
            : overviewLoading
              ? <PublicCardSkeletons count={3} />
              : data?.highlights.length
                ? <ScrollGrid className="highlight-grid">{data.highlights.map((item, index) => <PublicTargetCard item={item} index={index} key={item.key} />)}</ScrollGrid>
                : <div className="public-empty-panel"><Empty
                  title="Chưa có chỉ tiêu nổi bật được công bố"
                  description="Chọn “Tất cả phòng ban” để xem các chỉ tiêu công khai."
                  action={<button type="button" className="btn secondary" onClick={() => setTargetFilter(ALL_TARGETS_FILTER)}>Xem tất cả chỉ tiêu</button>}
                /></div>
          : publicTargetsError && !publicTargets.length
            ? <PublicAlert message={publicTargetsError} onRetry={() => void retryPublicTargets(1, false)} />
            : publicTargetsLoading && !publicTargets.length
              ? <PublicCardSkeletons count={6} />
              : publicTargets.length
                ? <ScrollGrid className="highlight-grid">{publicTargets.map((item, index) => <PublicTargetCard item={item} index={index % 6} key={item.key} />)}</ScrollGrid>
                : <div className="public-empty-panel"><Empty
                  title="Không có chỉ tiêu trong phạm vi này"
                  description="Hãy chọn phòng ban khác hoặc xem tất cả phòng ban."
                /></div>}

        {targetFilter !== FEATURED_FILTER && <div className="public-target-pagination" aria-live="polite">
          <span>{publicTargetsTotal ? `Đã hiển thị ${publicTargets.length}/${publicTargetsTotal} chỉ tiêu` : ''}</span>
          {publicTargetsError && publicTargets.length > 0
            ? <button type="button" className="btn secondary" onClick={() => void retryPublicTargets(publicTargetsPage + 1, true)}>Thử tải lại</button>
            : publicTargetsPage < publicTargetsPageCount && <button type="button" className={`btn secondary${publicTargetsLoading ? ' loading' : ''}`} disabled={publicTargetsLoading} onClick={() => void loadPublicTargets(publicTargetsPage + 1, true, selectedDepartment(targetFilter))}>{publicTargetsLoading ? 'Đang tải...' : 'Xem thêm chỉ tiêu'}</button>}
        </div>}
      </div></section></Reveal>

      {/* ---------- Kết quả theo đơn vị ---------------------------------------------- */}
      <Reveal asChild variant="fade"><section className="public-section alt department-public" id="phong-ban"><div className="public-container">
        <Reveal asChild index={0}><div className="public-section-head light"><div><span>Kết quả theo đơn vị</span><h2>Tiến độ các chỉ tiêu công khai</h2><p>Tổng hợp tiến độ các chỉ tiêu đã công bố theo từng đơn vị.</p></div></div></Reveal>
        {error
          ? <PublicAlert message="Chưa thể tải kết quả theo đơn vị." onRetry={() => void retryOverview()} />
          : overviewLoading
            ? <PublicCardSkeletons count={4} row />
            : data?.departments.length
              ? <div className="public-department-grid">{data.departments.map((department, index) => <Reveal asChild index={index % 6 + 1} key={department.key}><div className="public-department">
                <div className="dep-rank">{String(index + 1).padStart(2, '0')}</div>
                <div className="dep-public-icon" style={{ color: department.color }}><Building2 /></div>
                <div className="dep-public-info">
                  <strong>{department.name}</strong>
                  <span>{department.completed}/{department.total} chỉ tiêu đã hoàn thành</span>
                  <div className="progress public-progress dark" role="progressbar" aria-label={`Tiến độ đơn vị ${department.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.max(0, Math.min(100, department.progress))}><i style={{ width: `${Math.max(0,Math.min(100,department.progress))}%`, background: department.color }} /></div>
                </div>
                <b>{department.progress}%</b>
              </div></Reveal>)}</div>
              : <div className="public-empty-panel"><Empty
                title="Chưa có đơn vị nào được công bố"
                description="Kết quả theo đơn vị sẽ xuất hiện sau khi số liệu được phê duyệt công khai."
              /></div>}
      </div></section></Reveal>

      {/* ---------- Kết quả phản ánh công khai --------------------------------------- */}
      <Reveal asChild variant="fade"><section className="public-section published-feedback-section" id="ket-qua-phan-anh"><div className="public-container">
        <Reveal asChild index={0}><div className="public-section-head"><div><span>Kết quả phản ánh công khai</span><h2>Phản ánh đã được xử lý công khai</h2><p>Các kết quả dưới đây đã hoàn tất quy trình xử lý, phê duyệt và loại bỏ thông tin riêng tư trước khi công bố.</p></div><Link to="/phan-anh" className="public-outline-btn">Gửi hoặc tra cứu phản ánh <ArrowRight /></Link></div></Reveal>
        {feedbackLoading
          ? <PublicCardSkeletons count={3} />
          : feedbackError
            ? <PublicAlert message={feedbackError} onRetry={() => void retryPublishedFeedbacks()} />
            : publishedFeedbacks.length
              ? <ScrollGrid className="published-feedback-grid">{publishedFeedbacks.map((item, index) => <Reveal asChild index={index % 6 + 1} key={item.code}><Link className="published-feedback-card" to={`/phan-anh/cong-khai/${encodeURIComponent(item.code)}`} onAnimationEnd={finishScrollReveal}>
                <div className="published-feedback-meta"><span><BadgeCheck />{item.category ? feedbackCategoryNames[item.category] : 'Kết quả xử lý'}</span><time dateTime={item.publicPublishedAt}>{new Date(item.publicPublishedAt).toLocaleDateString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}</time></div>
                <h3>{item.publicTitle || 'Kết quả xử lý phản ánh'}</h3>
                <p>{item.publicSummary || 'Kết quả đang được cập nhật.'}</p>
                <div className="published-feedback-foot"><span><Building2 />{item.department?.name || 'UBND Phường Lái Thiêu'}</span><b>{item.code}</b></div>
                <span className="published-feedback-view">Xem toàn bộ quá trình xử lý <ArrowRight/></span>
              </Link></Reveal>)}</ScrollGrid>
              : <div className="public-empty-panel"><Empty
                title="Chưa có kết quả mới được công bố"
                description="Các phản ánh đã xử lý sẽ xuất hiện tại đây sau khi kết quả được phê duyệt và công bố."
              /></div>}
      </div></section></Reveal>

      {/* ---------- Lời kêu gọi gửi phản ánh ----------------------------------------- */}
      <Reveal asChild><section className="public-section alt services-section"><div className="public-container">
        <div className="citizen-banner"><div className="citizen-people"><MessageCircleMore /></div><div><span>Gửi và tra cứu phản ánh</span><h3>Phản ánh vấn đề trên địa bàn</h3><p>Gửi nội dung trực tuyến và theo dõi từng bước xử lý bằng mã bảo mật riêng.</p></div><Link to="/phan-anh" className="public-outline-btn">Gửi hoặc tra cứu phản ánh <ArrowRight /></Link></div>
      </div></section></Reveal>
    </main>

    {renderFooter(<>
      <a href="#chi-tieu">Chỉ tiêu</a>
      <a href="#phong-ban">Đơn vị</a>
      <a href="#ket-qua-phan-anh">Kết quả phản ánh</a>
    </>)}
    {renderBackToTop()}
  </div>;
}
