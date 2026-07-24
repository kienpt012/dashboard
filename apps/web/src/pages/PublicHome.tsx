import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Building2,
  CheckCircle2,
  CircleUserRound,
  Landmark,
  Menu,
  MessageCircleMore,
  Target,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { currentVietnamYear } from '../date';
import type {
  FeedbackCategory,
  PublishedFeedback,
  PublicOverview,
  PublicTarget,
  PublicTargetListResponse,
} from '../types';

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

function PublicTargetCard({ item }: { item: PublicTarget }) {
  const status = targetStatus(item.status);
  const progress = Math.max(0, Math.min(100, item.progress));
  return <article className="highlight-card public-target-card">
    <div className="highlight-top">
      <span className="public-target-code">Mã {item.code}</span>
      <i className={status.className}>{status.label}</i>
    </div>
    <h3>{item.title}</h3>
    <p><Building2 />{item.department}</p>
    <div className="highlight-values">
      <strong>{formatValue(item.currentValue, item.unit)}</strong>
      <span>/ {formatValue(item.targetValue, item.unit)}</span>
    </div>
    <div className="public-progress" role="progressbar" aria-label={`Tiến độ chỉ tiêu ${item.code}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
      <i style={{ width: `${progress}%` }} />
    </div>
    <div className="highlight-foot"><span>Tiến độ thực hiện</span><b>{item.progress}%</b></div>
  </article>;
}

export default function PublicHome() {
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
    } catch (reason) {
      setData(undefined);
      setError(reason instanceof Error ? reason.message : 'Dữ liệu công khai đang được cập nhật');
    } finally {
      setOverviewLoading(false);
    }
  }

  async function loadPublishedFeedbacks() {
    setFeedbackLoading(true);
    setFeedbackError('');
    try {
      setPublishedFeedbacks(await api<PublishedFeedback[]>('/public/feedbacks/published'));
    } catch (reason) {
      setFeedbackError(reason instanceof Error ? reason.message : 'Không thể tải kết quả phản ánh công khai');
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
      if (requestId !== targetRequestRef.current) return;
      setPublicTargets(current => append ? mergePublicTargets(current, response.items) : response.items);
      setPublicTargetsPage(response.page);
      setPublicTargetsPageCount(response.pageCount);
      setPublicTargetsTotal(response.total);
    } catch (reason) {
      if (requestId !== targetRequestRef.current) return;
      setPublicTargetsError(reason instanceof Error ? reason.message : 'Không thể tải danh sách chỉ tiêu công khai');
    } finally {
      if (requestId === targetRequestRef.current) setPublicTargetsLoading(false);
    }
  }

  useEffect(() => {
    void loadOverview();
    void loadPublishedFeedbacks();
  }, []);

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

  return <div className="public-site">
    <header className="public-header">
      <Link to="/" className="public-brand" inert={menu ? true : undefined} aria-hidden={menu ? true : undefined}><div className="brand-mark">LT</div><div><strong>PHƯỜNG LÁI THIÊU</strong><span>Cổng thông tin điều hành số</span></div></Link>
      <nav ref={menuNavRef} id="public-navigation" aria-label="Điều hướng cổng thông tin" className={menu ? 'show' : ''} tabIndex={menu ? -1 : undefined}>
        <a href="#chi-tieu" onClick={() => setMenu(false)}>Chỉ tiêu công khai</a>
        <a href="#phong-ban" onClick={() => setMenu(false)}>Kết quả theo đơn vị</a>
        <a href="#ket-qua-phan-anh" onClick={() => setMenu(false)}>Kết quả phản ánh</a>
        <Link to="/phan-anh" onClick={() => setMenu(false)}>Gửi phản ánh</Link>
        <button ref={menuCloseRef} aria-label="Đóng menu" className="public-nav-close" onClick={() => setMenu(false)}><X /></button>
      </nav>
      <div className="public-head-actions">
        <div className={`public-live${error ? ' error' : overviewLoading ? ' loading' : ''}`} role="status" inert={menu ? true : undefined} aria-hidden={menu ? true : undefined}><i />{error ? 'Tạm thời mất kết nối' : overviewLoading ? 'Đang đồng bộ dữ liệu' : 'Số liệu đã công bố'}</div>
        <Link aria-label="Đăng nhập hệ thống" to="/admin/login" className="admin-link" inert={menu ? true : undefined} aria-hidden={menu ? true : undefined}><CircleUserRound />Đăng nhập hệ thống</Link>
        <button ref={menuButtonRef} aria-label="Mở menu" aria-controls="public-navigation" aria-expanded={menu} className="public-menu" onClick={() => setMenu(true)}><Menu /></button>
      </div>
    </header>

    <main inert={menu ? true : undefined} aria-hidden={menu ? true : undefined}>
      <section className="public-section public-targets-lead" id="chi-tieu"><div className="public-container">
        <div className="public-targets-title">
          <div>
            <span>CHỈ TIÊU CÔNG KHAI</span>
            <h1>Kết quả thực hiện chỉ tiêu năm {data?.year ?? year}</h1>
            <p>{data?.updatedAt
              ? `Cập nhật gần nhất ${new Date(data.updatedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`
              : overviewLoading ? 'Đang tải số liệu đã được phê duyệt công khai.' : 'Chưa có số liệu công bố cho năm kế hoạch này.'}</p>
          </div>
          {error && <button type="button" className="public-retry-button" onClick={() => void loadOverview()}>Tải lại dữ liệu</button>}
        </div>

        <div className="public-overview-summary" aria-label="Tổng hợp chỉ tiêu công khai">
          <div><Landmark /><span><b>{data?.departments.length ?? '—'}</b>Đơn vị có chỉ tiêu</span></div>
          <div><Target /><span><b>{data?.total ?? '—'}</b>Tổng chỉ tiêu</span></div>
          <div><CheckCircle2 /><span><b>{data?.completed ?? '—'}</b>Đã hoàn thành</span></div>
          <div><BarChart3 /><span><b>{data ? `${data.overallProgress}%` : '—'}</b>Tiến độ chung</span></div>
        </div>

        <div className="public-target-browser-head">
          <div>
            <h2>{targetFilter === FEATURED_FILTER ? 'Chỉ tiêu nổi bật' : 'Danh sách chỉ tiêu công khai'}</h2>
            <p>{targetFilter === FEATURED_FILTER
              ? 'Các chỉ tiêu được chọn để theo dõi nhanh.'
              : publicTargetsTotal ? `${publicTargetsTotal} chỉ tiêu phù hợp với phạm vi đã chọn.` : 'Chọn phạm vi để tra cứu chỉ tiêu.'}</p>
          </div>
          <label>
            <span>Phạm vi hiển thị</span>
            <select value={targetFilter} onChange={event => setTargetFilter(event.target.value)}>
              <option value={FEATURED_FILTER}>Chỉ tiêu nổi bật</option>
              <option value={ALL_TARGETS_FILTER}>Tất cả phòng ban</option>
              {data?.departments.map(department =>
                <option key={department.key} value={`${DEPARTMENT_FILTER_PREFIX}${department.key}`}>{department.name}</option>,
              )}
            </select>
          </label>
        </div>

        {targetFilter === FEATURED_FILTER
          ? error
            ? <div className="public-feedback-state error" role="alert"><span>{error}</span><button type="button" onClick={() => void loadOverview()}>Thử tải lại</button></div>
            : overviewLoading
              ? <div className="public-loading" role="status">Đang tải chỉ tiêu nổi bật...</div>
              : data?.highlights.length
                ? <div className="highlight-grid">{data.highlights.map(item => <PublicTargetCard item={item} key={item.key} />)}</div>
                : <div className="public-feedback-state"><Target /><div><strong>Chưa có chỉ tiêu nổi bật được công bố</strong><span>Chọn “Tất cả phòng ban” để xem các chỉ tiêu công khai.</span></div><button type="button" className="public-more-button" onClick={() => setTargetFilter(ALL_TARGETS_FILTER)}>Xem tất cả chỉ tiêu</button></div>
          : publicTargetsError && !publicTargets.length
            ? <div className="public-feedback-state error" role="alert"><span>{publicTargetsError}</span><button type="button" onClick={() => void loadPublicTargets(1, false, selectedDepartment(targetFilter))}>Thử tải lại</button></div>
            : publicTargetsLoading && !publicTargets.length
              ? <div className="public-loading" role="status">Đang tải danh sách chỉ tiêu...</div>
              : publicTargets.length
                ? <div className="highlight-grid">{publicTargets.map(item => <PublicTargetCard item={item} key={item.key} />)}</div>
                : <div className="public-feedback-state"><Target /><div><strong>Không có chỉ tiêu trong phạm vi này</strong><span>Hãy chọn phòng ban khác hoặc xem tất cả phòng ban.</span></div></div>}

        {targetFilter !== FEATURED_FILTER && <div className="public-target-pagination" aria-live="polite">
          <span>{publicTargetsTotal ? `Đã hiển thị ${publicTargets.length}/${publicTargetsTotal} chỉ tiêu` : ''}</span>
          {publicTargetsError && publicTargets.length > 0
            ? <button type="button" className="public-more-button" onClick={() => void loadPublicTargets(publicTargetsPage + 1, true, selectedDepartment(targetFilter))}>Thử tải lại</button>
            : publicTargetsPage < publicTargetsPageCount && <button type="button" className="public-more-button" disabled={publicTargetsLoading} onClick={() => void loadPublicTargets(publicTargetsPage + 1, true, selectedDepartment(targetFilter))}>{publicTargetsLoading ? 'Đang tải...' : 'Xem thêm chỉ tiêu'}</button>}
        </div>}
      </div></section>

      <section className="public-section department-public" id="phong-ban"><div className="public-container">
        <div className="public-section-head light"><div><span>KẾT QUẢ THEO ĐƠN VỊ</span><h2>Tiến độ các chỉ tiêu công khai</h2><p>Tổng hợp tiến độ các chỉ tiêu đã công bố theo từng đơn vị.</p></div></div>
        {error ? <div className="public-department-state" role="alert"><span>Chưa thể tải kết quả theo đơn vị.</span><button type="button" onClick={() => void loadOverview()}>Thử lại</button></div> : overviewLoading ? <div className="public-department-state" role="status">Đang tải kết quả theo đơn vị...</div> : <div className="public-department-grid">{data?.departments.map((department, index) => <div className="public-department" key={department.key}>
          <div className="dep-rank">{String(index + 1).padStart(2, '0')}</div><div className="dep-public-icon" style={{ color: department.color }}><Building2 /></div>
          <div className="dep-public-info"><strong>{department.name}</strong><span>{department.completed}/{department.total} chỉ tiêu đã hoàn thành</span><div className="public-progress dark" role="progressbar" aria-label={`Tiến độ đơn vị ${department.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.max(0, Math.min(100, department.progress))}><i style={{ width: `${Math.max(0,Math.min(100,department.progress))}%`, background: department.color }} /></div></div><b>{department.progress}%</b>
        </div>)}</div>}
      </div></section>

      <section className="public-section published-feedback-section" id="ket-qua-phan-anh"><div className="public-container">
        <div className="public-section-head"><div><span>KẾT QUẢ PHẢN ÁNH CÔNG KHAI</span><h2>Phản ánh đã được xử lý công khai</h2><p>Các kết quả dưới đây đã hoàn tất quy trình xử lý, phê duyệt và loại bỏ thông tin riêng tư trước khi công bố.</p></div><Link to="/phan-anh" className="public-outline-btn">Gửi hoặc tra cứu phản ánh <ArrowRight /></Link></div>
        {feedbackLoading ? <div className="public-loading" role="status">Đang tải kết quả phản ánh...</div>
          : feedbackError ? <div className="public-feedback-state error" role="alert"><span>{feedbackError}</span><button type="button" onClick={() => void loadPublishedFeedbacks()}>Thử tải lại</button></div>
          : publishedFeedbacks.length ? <div className="published-feedback-grid">{publishedFeedbacks.map(item => <Link className="published-feedback-card" to={`/phan-anh/cong-khai/${encodeURIComponent(item.code)}`} key={item.code}>
            <div className="published-feedback-meta"><span><BadgeCheck />{item.category ? feedbackCategoryNames[item.category] : 'Kết quả xử lý'}</span><time dateTime={item.publicPublishedAt}>{new Date(item.publicPublishedAt).toLocaleDateString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}</time></div>
            <h3>{item.publicTitle || 'Kết quả xử lý phản ánh'}</h3>
            <p>{item.publicSummary || 'Kết quả đang được cập nhật.'}</p>
            <div className="published-feedback-foot"><span><Building2 />{item.department?.name || 'UBND Phường Lái Thiêu'}</span><b>{item.code}</b></div>
            <span className="published-feedback-view">Xem toàn bộ quá trình xử lý <ArrowRight/></span>
          </Link>)}</div>
          : <div className="public-feedback-state"><BadgeCheck /><div><strong>Chưa có kết quả mới được công bố</strong><span>Các phản ánh đã xử lý sẽ xuất hiện tại đây sau khi kết quả được phê duyệt và công bố.</span></div></div>}
      </div></section>

      <section className="public-section services-section"><div className="public-container">
        <div className="citizen-banner"><div className="citizen-people"><MessageCircleMore /></div><div><span>GỬI VÀ TRA CỨU PHẢN ÁNH</span><h3>Phản ánh vấn đề trên địa bàn</h3><p>Gửi nội dung trực tuyến và theo dõi từng bước xử lý bằng mã bảo mật riêng.</p></div><Link to="/phan-anh" className="public-outline-btn">Gửi hoặc tra cứu phản ánh <ArrowRight /></Link></div>
      </div></section>
    </main>

    <footer className="public-footer" inert={menu ? true : undefined} aria-hidden={menu ? true : undefined}><div className="public-container">
      <div className="footer-brand"><div className="brand-mark">LT</div><div><strong>UBND PHƯỜNG LÁI THIÊU</strong><span>Cổng thông tin điều hành số</span></div></div>
      <div className="footer-links"><a href="#chi-tieu">Chỉ tiêu</a><a href="#phong-ban">Đơn vị</a><Link to="/phan-anh">Gửi phản ánh</Link><Link to="/admin/login">Không gian nội bộ</Link></div>
      <p>© {year} UBND Phường Lái Thiêu.</p>
    </div></footer>
  </div>;
}
