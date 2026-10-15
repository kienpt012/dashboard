import { LoginOutlined, MenuOutlined } from '@ant-design/icons';
import { Button, Drawer, Grid } from 'antd';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { agencyLines, localityInitials, localityTitle, useLocality } from '@/app/locality';
import { currentYear } from '@/lib/format';
import './public.css';

const LINKS = [
  { to: '/', label: 'Trang chủ', end: true },
  { to: '/phan-anh', label: 'Gửi và tra cứu phản ánh', end: false },
];

/** Khung chung của khu vực dành cho người dân: đầu trang, điều hướng, chân trang. */
export function PublicShell({ children, title }: { children: ReactNode; title?: string }) {
  const locality = useLocality();
  const screens = Grid.useBreakpoint();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const unit = locality.configured ? localityTitle(locality) : 'Trung tâm điều hành';

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    document.title = title ? `${title} · ${unit}` : `${locality.brandName} · ${unit}`;
  }, [title, unit, locality.brandName]);

  const nav = LINKS.map(link => (
    <NavLink key={link.to} to={link.to} end={link.end} className={({ isActive }) => `pub-nav-link${isActive ? ' active' : ''}`}>
      {link.label}
    </NavLink>
  ));

  return (
    <div className="pub">
      <header className="pub-header">
        <div className="pub-container pub-header-inner">
          <Link to="/" className="pub-brand">
            <span className="pub-mark">{localityInitials(locality)}</span>
            <span className="pub-brand-text">
              <strong>{unit}</strong>
              <span>{locality.brandName}</span>
            </span>
          </Link>
          {screens.md ? (
            <nav className="pub-nav" aria-label="Điều hướng">
              {nav}
            </nav>
          ) : null}
          <div className="pub-actions">
            {screens.md ? (
              <Link to="/admin/login">
                <Button icon={<LoginOutlined />}>Cán bộ đăng nhập</Button>
              </Link>
            ) : (
              <Button type="text" icon={<MenuOutlined />} onClick={() => setOpen(true)} aria-label="Mở menu" />
            )}
          </div>
        </div>
      </header>
      <Drawer open={open} onClose={() => setOpen(false)} placement="right" size={280} title={unit}>
        <nav className="pub-nav vertical">{nav}</nav>
        <Link to="/admin/login" style={{ display: 'block', marginTop: 16 }}>
          <Button block icon={<LoginOutlined />}>
            Cán bộ đăng nhập
          </Button>
        </Link>
      </Drawer>
      <main className="pub-main">{children}</main>
      <footer className="pub-footer">
        <div className="pub-container pub-footer-inner">
          <div>
            {agencyLines(locality).map(line => (
              <strong key={line}>{line}</strong>
            ))}
            {locality.address && <span>Địa chỉ: {locality.address}</span>}
            {locality.phone && <span>Điện thoại: {locality.phone}</span>}
            {locality.email && <span>Email: {locality.email}</span>}
            {locality.website && (
              <a href={locality.website} target="_blank" rel="noopener noreferrer">
                {locality.website}
              </a>
            )}
          </div>
          <div className="pub-footer-meta">
            <span>
              © {currentYear()} {locality.agencyName}
            </span>
            <span>{locality.brandName}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

/** Tiêu đề khu vực trong trang công khai. */
export function PublicSection({ title, extra, children, id, tone }: { title?: ReactNode; extra?: ReactNode; children: ReactNode; id?: string; tone?: 'alt' }) {
  return (
    <section className={`pub-section${tone ? ` ${tone}` : ''}`} id={id}>
      <div className="pub-container">
        {(title || extra) && (
          <div className="pub-section-head">
            {title && <h2>{title}</h2>}
            {extra}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}
