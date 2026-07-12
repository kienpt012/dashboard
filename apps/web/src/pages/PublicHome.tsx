import { ArrowRight, BarChart3, Building2, CalendarDays, CheckCircle2, ChevronRight, CircleUserRound, Clock3, FileCheck2, Landmark, MapPin, Menu, Phone, Search, ShieldCheck, Sparkles, Target, UsersRound, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

const services = [
  { icon: FileCheck2, title: 'Thủ tục hành chính', text: 'Tra cứu và thực hiện dịch vụ công trực tuyến', color: '#0f766e' },
  { icon: Search, title: 'Tra cứu hồ sơ', text: 'Theo dõi trạng thái xử lý hồ sơ đã nộp', color: '#2563eb' },
  { icon: Building2, title: 'Phản ánh kiến nghị', text: 'Gửi phản ánh về đô thị và đời sống dân sinh', color: '#d97706' },
  { icon: ShieldCheck, title: 'Thông tin an ninh', text: 'Tiếp nhận tin báo và thông tin cần hỗ trợ', color: '#dc4f4f' },
];

function formatValue(value: number, unit: string) {
  return `${value.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} ${unit}`;
}

export default function PublicHome() {
  const [data, setData] = useState<any>();
  const [menu, setMenu] = useState(false);
  useEffect(() => { api('/public/overview?year=2026').then(setData); }, []);
  return <div className="public-site">
    <header className="public-header">
      <Link to="/" className="public-brand"><div className="brand-mark">TH</div><div><strong>PHƯỜNG TÂN HƯNG</strong><span>Cổng thông tin điều hành số</span></div></Link>
      <nav className={menu ? 'show' : ''}><a href="#tong-quan">Tổng quan</a><a href="#chi-tieu">Chỉ tiêu công khai</a><a href="#phong-ban">Phòng ban</a><a href="#dich-vu">Dịch vụ người dân</a><button aria-label="Đóng menu" className="public-nav-close" onClick={() => setMenu(false)}><X/></button></nav>
      <div className="public-head-actions"><div className="public-live"><i/>Dữ liệu trực tuyến</div><Link aria-label="Đăng nhập quản trị" to="/admin/login" className="admin-link"><CircleUserRound/>Đăng nhập quản trị</Link><button aria-label="Mở menu" className="public-menu" onClick={() => setMenu(true)}><Menu/></button></div>
    </header>

    <main>
      <section className="public-hero" id="tong-quan">
        <div className="hero-orb one"/><div className="hero-orb two"/><div className="hero-grid"/>
        <div className="public-container hero-content">
          <div className="hero-copy"><span className="hero-kicker"><Sparkles/>MINH BẠCH · HIỆN ĐẠI · VÌ NGƯỜI DÂN</span><h1>Tân Hưng chuyển động<br/>bằng <em>dữ liệu.</em></h1><p>Theo dõi kết quả thực hiện các mục tiêu phát triển của phường một cách trực quan, cập nhật và dễ hiểu.</p><div className="hero-actions"><a href="#chi-tieu" className="public-btn gold">Xem kết quả điều hành <ArrowRight/></a><a href="#dich-vu" className="public-btn ghost">Dịch vụ dành cho người dân</a></div><div className="hero-trust"><span><CheckCircle2/>Dữ liệu được kiểm chứng</span><span><Clock3/>Cập nhật thường xuyên</span><span><ShieldCheck/>Thông tin công khai</span></div></div>
          <div className="hero-command-card">
            <div className="command-card-head"><div><span>TIẾN ĐỘ THỰC HIỆN</span><strong>Kế hoạch năm 2026</strong></div><BarChart3/></div>
            <div className="public-ring" style={{'--p': `${(data?.overallProgress || 0) * 3.6}deg`} as any}><div><strong>{data?.overallProgress || 0}<small>%</small></strong><span>tiến độ chung</span></div></div>
            <div className="command-card-stats"><div><span>Tổng chỉ tiêu</span><b>{data?.total ?? '—'}</b></div><div><span>Hoàn thành</span><b>{data?.completed ?? '—'}</b></div><div><span>Đúng tiến độ</span><b>{data?.onTrack ?? '—'}</b></div></div>
            <div className="command-update"><i/><span>Cập nhật gần nhất: {data ? new Date(data.updatedAt).toLocaleDateString('vi-VN') : 'Đang tải...'}</span></div>
          </div>
        </div>
      </section>

      <section className="public-stats"><div className="public-container stats-row"><div><Landmark/><span><b>{data?.departments?.length || 6}</b> đơn vị tham gia</span></div><div><Target/><span><b>{data?.total || 10}</b> chỉ tiêu công khai</span></div><div><CheckCircle2/><span><b>{data?.completed || 0}</b> chỉ tiêu hoàn thành</span></div><div><CalendarDays/><span><b>2026</b> năm kế hoạch</span></div></div></section>

      <section className="public-section" id="chi-tieu"><div className="public-container"><div className="public-section-head"><div><span>KẾT QUẢ NỔI BẬT</span><h2>Chỉ tiêu người dân quan tâm</h2><p>Các chỉ số trọng tâm phản ánh chất lượng phục vụ và phát triển địa phương.</p></div><button className="public-outline-btn">Xem toàn bộ báo cáo <ChevronRight/></button></div><div className="highlight-grid">{data?.highlights?.map((item:any, index:number) => <article className="highlight-card" key={item.code}><div className="highlight-top"><span>{String(index + 1).padStart(2, '0')}</span><i className={item.progress >= 100 ? 'done' : item.progress >= 70 ? 'good' : 'watch'}>{item.progress >= 100 ? 'Hoàn thành' : item.progress >= 70 ? 'Đúng tiến độ' : 'Đang theo dõi'}</i></div><h3>{item.title}</h3><p>{item.department}</p><div className="highlight-values"><strong>{formatValue(item.currentValue, item.unit)}</strong><span>/ {formatValue(item.targetValue, item.unit)}</span></div><div className="public-progress"><i style={{width:`${item.progress}%`}}/></div><div className="highlight-foot"><span>Tiến độ thực hiện</span><b>{item.progress}%</b></div></article>) || <div className="public-loading">Đang cập nhật dữ liệu...</div>}</div></div></section>

      <section className="public-section department-public" id="phong-ban"><div className="public-container"><div className="public-section-head light"><div><span>NỖ LỰC TỪ CÁC ĐƠN VỊ</span><h2>Tiến độ theo phòng ban</h2><p>Mỗi đơn vị cùng góp phần hoàn thành mục tiêu chung của phường.</p></div></div><div className="public-department-grid">{data?.departments?.map((dep:any, index:number) => <div className="public-department" key={dep.name}><div className="dep-rank">{String(index + 1).padStart(2,'0')}</div><div className="dep-public-icon" style={{color:dep.color}}><Building2/></div><div className="dep-public-info"><strong>{dep.name}</strong><span>{dep.completed}/{dep.total} chỉ tiêu đã hoàn thành</span><div className="public-progress dark"><i style={{width:`${dep.progress}%`,background:dep.color}}/></div></div><b>{dep.progress}%</b></div>)}</div></div></section>

      <section className="public-section services-section" id="dich-vu"><div className="public-container"><div className="public-section-head centered"><div><span>PHỤC VỤ NGƯỜI DÂN</span><h2>Tiện ích nhanh, thủ tục thuận tiện</h2><p>Tiếp cận các dịch vụ thiết yếu từ một điểm duy nhất.</p></div></div><div className="service-grid">{services.map(({icon:Icon,title,text,color}) => <a href="#" className="service-card" key={title}><div className="service-icon" style={{background:color+'14',color}}><Icon/></div><div><h3>{title}</h3><p>{text}</p></div><ChevronRight/></a>)}</div><div className="citizen-banner"><div className="citizen-people"><UsersRound/></div><div><span>TRUNG TÂM PHỤC VỤ HÀNH CHÍNH CÔNG</span><h3>Đồng hành cùng người dân và doanh nghiệp</h3><p>Hỗ trợ thủ tục, tiếp nhận phản ánh và giải đáp thông tin trong giờ hành chính.</p></div><div className="citizen-contact"><a href="tel:02800000000"><Phone/>028 0000 0000</a><span><MapPin/>Phường Tân Hưng, TP. Hồ Chí Minh</span></div></div></div></section>
    </main>

    <footer className="public-footer"><div className="public-container"><div className="footer-brand"><div className="brand-mark">TH</div><div><strong>UBND PHƯỜNG TÂN HƯNG</strong><span>Cổng thông tin điều hành và phục vụ người dân</span></div></div><div className="footer-links"><a href="#tong-quan">Tổng quan</a><a href="#chi-tieu">Chỉ tiêu</a><a href="#dich-vu">Dịch vụ công</a><Link to="/admin/login">Quản trị hệ thống</Link></div><p>© 2026 UBND Phường Tân Hưng. Dữ liệu được công khai phục vụ người dân.</p></div></footer>
  </div>;
}
