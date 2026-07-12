import {
  ArrowRight,
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleUserRound,
  Clock3,
  Landmark,
  Menu,
  ShieldCheck,
  Sparkles,
  Target,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

type PublicOverview = {
  year: number;
  total: number;
  completed: number;
  onTrack: number;
  overallProgress: number;
  updatedAt: string;
  departments: Array<{ name: string; color: string; total: number; completed: number; progress: number }>;
  highlights: Array<{ code: string; title: string; unit: string; targetValue: number; currentValue: number; progress: number; department: string; status: string }>;
};

function formatValue(value: number, unit: string) {
  return `${value.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} ${unit}`;
}

export default function PublicHome() {
  const [data, setData] = useState<PublicOverview>();
  const [error, setError] = useState('');
  const [menu, setMenu] = useState(false);
  const year = new Date().getFullYear();

  useEffect(() => {
    api<PublicOverview>(`/public/overview?year=${year}`)
      .then(setData)
      .catch(reason => setError(reason.message || 'Dữ liệu công khai đang được cập nhật'));
  }, [year]);

  return <div className="public-site">
    <header className="public-header">
      <Link to="/" className="public-brand"><div className="brand-mark">TH</div><div><strong>PHƯỜNG TÂN HƯNG</strong><span>Cổng thông tin điều hành số</span></div></Link>
      <nav className={menu ? 'show' : ''}>
        <a href="#tong-quan" onClick={() => setMenu(false)}>Tổng quan</a>
        <a href="#chi-tieu" onClick={() => setMenu(false)}>Chỉ tiêu công khai</a>
        <a href="#phong-ban" onClick={() => setMenu(false)}>Kết quả theo đơn vị</a>
        <button aria-label="Đóng menu" className="public-nav-close" onClick={() => setMenu(false)}><X /></button>
      </nav>
      <div className="public-head-actions">
        <div className="public-live"><i />Dữ liệu đã kiểm duyệt</div>
        <Link aria-label="Đăng nhập hệ thống" to="/admin/login" className="admin-link"><CircleUserRound />Đăng nhập hệ thống</Link>
        <button aria-label="Mở menu" className="public-menu" onClick={() => setMenu(true)}><Menu /></button>
      </div>
    </header>

    <main>
      <section className="public-hero" id="tong-quan">
        <div className="hero-orb one" /><div className="hero-orb two" /><div className="hero-grid" />
        <div className="public-container hero-content">
          <div className="hero-copy">
            <span className="hero-kicker"><Sparkles />MINH BẠCH · DỄ HIỂU · VÌ NGƯỜI DÂN</span>
            <h1>Tân Hưng chuyển động<br />bằng <em>dữ liệu.</em></h1>
            <p>Theo dõi kết quả thực hiện những mục tiêu đã được phê duyệt công khai, với cách trình bày rõ ràng và nhất quán.</p>
            <div className="hero-actions"><a href="#chi-tieu" className="public-btn gold">Xem kết quả điều hành <ArrowRight /></a></div>
            <div className="hero-trust"><span><CheckCircle2 />Số liệu qua quy trình duyệt</span><span><Clock3 />Có thời điểm cập nhật</span><span><ShieldCheck />Chỉ công bố dữ liệu được phép</span></div>
          </div>
          <div className="hero-command-card">
            <div className="command-card-head"><div><span>TIẾN ĐỘ THỰC HIỆN</span><strong>Kế hoạch năm {data?.year ?? year}</strong></div><BarChart3 /></div>
            <div className="public-ring" style={{ '--p': `${(data?.overallProgress ?? 0) * 3.6}deg` } as any}><div><strong>{data?.overallProgress ?? 0}<small>%</small></strong><span>tiến độ chung</span></div></div>
            <div className="command-card-stats"><div><span>Tổng chỉ tiêu</span><b>{data?.total ?? '—'}</b></div><div><span>Hoàn thành</span><b>{data?.completed ?? '—'}</b></div><div><span>Đúng tiến độ</span><b>{data?.onTrack ?? '—'}</b></div></div>
            <div className="command-update"><i /><span>{data ? `Cập nhật gần nhất: ${new Date(data.updatedAt).toLocaleString('vi-VN')}` : error || 'Đang tải dữ liệu công khai...'}</span></div>
          </div>
        </div>
      </section>

      <section className="public-stats"><div className="public-container stats-row">
        <div><Landmark /><span><b>{data?.departments.length ?? '—'}</b> đơn vị có chỉ tiêu công khai</span></div>
        <div><Target /><span><b>{data?.total ?? '—'}</b> chỉ tiêu công khai</span></div>
        <div><CheckCircle2 /><span><b>{data?.completed ?? '—'}</b> chỉ tiêu hoàn thành</span></div>
        <div><CalendarDays /><span><b>{data?.year ?? year}</b> năm kế hoạch</span></div>
      </div></section>

      <section className="public-section" id="chi-tieu"><div className="public-container">
        <div className="public-section-head"><div><span>KẾT QUẢ NỔI BẬT</span><h2>Chỉ tiêu người dân quan tâm</h2><p>Các chỉ số trọng tâm được quản trị viên lựa chọn công khai sau khi số liệu đã được kiểm duyệt.</p></div></div>
        {error ? <div className="public-loading">{error}</div> : <div className="highlight-grid">{data ? data.highlights.length ? data.highlights.map((item, index) => <article className="highlight-card" key={item.code}>
          <div className="highlight-top"><span>{String(index + 1).padStart(2, '0')}</span><i className={item.status === 'COMPLETED' ? 'done' : item.status === 'ON_TRACK' ? 'good' : 'watch'}>{item.status === 'COMPLETED' ? 'Hoàn thành' : item.status === 'ON_TRACK' ? 'Đúng tiến độ' : 'Cần theo dõi'}</i></div>
          <h3>{item.title}</h3><p>{item.department}</p>
          <div className="highlight-values"><strong>{formatValue(item.currentValue, item.unit)}</strong><span>/ {formatValue(item.targetValue, item.unit)}</span></div>
          <div className="public-progress"><i style={{ width: `${item.progress}%` }} /></div><div className="highlight-foot"><span>Tiến độ thực hiện</span><b>{item.progress}%</b></div>
        </article>) : <div className="public-loading">Chưa có chỉ tiêu nổi bật được công bố.</div> : <div className="public-loading">Đang tải dữ liệu...</div>}</div>}
      </div></section>

      <section className="public-section department-public" id="phong-ban"><div className="public-container">
        <div className="public-section-head light"><div><span>KẾT QUẢ THEO ĐƠN VỊ</span><h2>Tiến độ các chỉ tiêu công khai</h2><p>Số liệu chỉ tổng hợp từ những chỉ tiêu được phép hiển thị trên cổng thông tin.</p></div></div>
        <div className="public-department-grid">{data?.departments.map((department, index) => <div className="public-department" key={department.name}>
          <div className="dep-rank">{String(index + 1).padStart(2, '0')}</div><div className="dep-public-icon" style={{ color: department.color }}><Building2 /></div>
          <div className="dep-public-info"><strong>{department.name}</strong><span>{department.completed}/{department.total} chỉ tiêu đã hoàn thành</span><div className="public-progress dark"><i style={{ width: `${department.progress}%`, background: department.color }} /></div></div><b>{department.progress}%</b>
        </div>)}</div>
      </div></section>
    </main>

    <footer className="public-footer"><div className="public-container">
      <div className="footer-brand"><div className="brand-mark">TH</div><div><strong>UBND PHƯỜNG TÂN HƯNG</strong><span>Cổng thông tin điều hành số</span></div></div>
      <div className="footer-links"><a href="#tong-quan">Tổng quan</a><a href="#chi-tieu">Chỉ tiêu</a><Link to="/admin/login">Không gian nội bộ</Link></div>
      <p>© {year} UBND Phường Tân Hưng. Dữ liệu công khai phục vụ người dân.</p>
    </div></footer>
  </div>;
}
