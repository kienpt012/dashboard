import { FileSearchOutlined, FormOutlined, ReloadOutlined } from '@ant-design/icons';
import { Button, Result, Skeleton } from 'antd';
import { Link } from 'react-router-dom';
import { localityTitle, useLocality } from '@/app/locality';
import { useThemeMode } from '@/app/theme';
import { useApi } from '@/hooks/useApi';
import { errorText } from '@/lib/api';
import { date } from '@/lib/format';
import { PublicRenderer, themeStyle } from '../public-site/Renderer';
import type { PublicDashboardResponse } from '../public-site/types';
import { PublicShell } from './PublicShell';

function HomeSkeleton() {
  return (
    <div className="pub-container pd-page-body">
      <div className="pd-skeleton">
        {[12, 8, 4, 6, 6].map((span, index) => (
          <div key={index} style={{ gridColumn: `span ${span}` }}>
            <Skeleton active paragraph={{ rows: span === 12 ? 2 : 5 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Trang chủ dành cho người dân: dựng theo bản trang công khai đã công bố (hoặc bố cục mặc định). */
export default function PublicHome() {
  const locality = useLocality();
  const { dark } = useThemeMode();
  const page = useApi<PublicDashboardResponse>('/public/dashboard', { staleTime: 60_000 });
  const config = page.data?.config;
  const overview = page.data?.data.overview;
  const unit = locality.configured ? localityTitle(locality) : locality.brandName;

  return (
    <PublicShell width={config?.theme.contentWidth} footer={config?.settings.showFooter ?? true}>
      <div className="pd-page" style={config ? themeStyle(config, dark) : undefined}>
        {(config?.settings.showHeader ?? true) && (
          <section className="pd-hero">
            <div className="pub-container pd-hero-inner">
              <div className="pd-hero-text">
                <span className="pd-hero-unit">{unit}</span>
                <h1>{overview ? `Công khai kết quả điều hành năm ${overview.year}` : 'Thông tin công khai'}</h1>
                {overview?.updatedAt && <span className="pd-hero-meta">Số liệu cập nhật ngày {date(overview.updatedAt)}</span>}
              </div>
              <div className="pd-hero-actions">
                <Link to="/phan-anh">
                  <Button size="large" icon={<FormOutlined />} className="pd-hero-primary">
                    Gửi phản ánh
                  </Button>
                </Link>
                <Link to="/phan-anh?tab=tra-cuu">
                  <Button size="large" ghost icon={<FileSearchOutlined />}>
                    Tra cứu hồ sơ
                  </Button>
                </Link>
              </div>
            </div>
          </section>
        )}
        {page.error && !page.data ? (
          <div className="pub-container pd-page-body">
            <Result
              status="warning"
              title="Chưa tải được trang"
              subTitle={errorText(page.error)}
              extra={
                <Button icon={<ReloadOutlined />} onClick={() => void page.refetch()}>
                  Thử lại
                </Button>
              }
            />
          </div>
        ) : !page.data ? (
          <HomeSkeleton />
        ) : (
          <div className="pub-container pd-page-body">
            <PublicRenderer config={page.data.config} data={page.data.data} />
          </div>
        )}
      </div>
    </PublicShell>
  );
}
