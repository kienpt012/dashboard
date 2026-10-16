import { Typography } from 'antd';
import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { agencyLines, localityInitials, useLocality } from '@/app/locality';
import { currentYear } from '@/lib/format';
import './auth.css';

/** Khung hai cột của trang đăng nhập và khôi phục mật khẩu. */
export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  const locality = useLocality();
  const lines = agencyLines(locality);
  useEffect(() => {
    document.title = `${title} · ${locality.brandName}`;
  }, [title, locality.brandName]);
  return (
    <div className="auth">
      <aside className="auth-side">
        <div className="auth-side-top">
          <span className="auth-mark">{localityInitials(locality)}</span>
          <div className="auth-agency">
            {lines.map(line => (
              <span key={line}>{line}</span>
            ))}
          </div>
        </div>
        <div className="auth-side-mid">
          <span className="auth-product">{locality.brandName}</span>
          <span className="auth-product-sub">Trung tâm điều hành</span>
        </div>
        <div className="auth-side-foot">
          {locality.address && <span>{locality.address}</span>}
          <span>© {currentYear()} {locality.agencyName}</span>
        </div>
      </aside>
      <main className="auth-main">
        <div className="auth-card">
          <div className="auth-mobile-brand">
            <span className="auth-mark small">{localityInitials(locality)}</span>
            <span>{locality.brandName}</span>
          </div>
          <Typography.Title level={2} className="auth-title">
            {title}
          </Typography.Title>
          {children}
        </div>
        <Link to="/" className="auth-back">
          Trang thông tin công khai
        </Link>
      </main>
    </div>
  );
}
