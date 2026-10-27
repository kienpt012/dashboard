import { BgColorsOutlined, ReloadOutlined } from '@ant-design/icons';
import { Button, ConfigProvider, Result } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useThemeMode } from '@/app/theme';
import { PageSkeleton } from '@/components/States';
import { deskStyle } from './appearance';
import { Backdrop } from './background/Backdrop';
import { BackgroundPanel } from './background/BackgroundPanel';
import type { Tone } from './background/tone';
import { DeskProvider, useActiveSpace, useDesk } from './useDesk';
import type { DeskProfileConfig } from './types';
import './desk.css';

// Bàn làm việc số (DH-00): trang chủ cá nhân của từng cán bộ.

const START_PATHS: Record<DeskProfileConfig['startPage'], string | null> = { desk: null, ops: '/admin/dieu-hanh', work: '/admin/viec-cua-toi' };

/** Ngay sau đăng nhập, chuyển tới trang mở đầu người dùng đã chọn (một lần). */
function useStartPage(profile: DeskProfileConfig | undefined) {
  const navigate = useNavigate();
  const checked = useRef(false);
  useEffect(() => {
    if (checked.current || !profile) return;
    checked.current = true;
    let fresh = false;
    try {
      fresh = sessionStorage.getItem('ioc_fresh_login') === '1';
      sessionStorage.removeItem('ioc_fresh_login');
    } catch {
      return;
    }
    const target = START_PATHS[profile.startPage];
    if (fresh && target) navigate(target, { replace: true });
  }, [profile, navigate]);
}

function DeskView() {
  const desk = useDesk();
  const space = useActiveSpace();
  const { dark } = useThemeMode();
  const [tone, setTone] = useState<Tone>('dark');
  const [panel, setPanel] = useState(false);
  const profile = desk.profile?.config;
  useStartPage(profile);

  const style = useMemo(() => (profile ? deskStyle(profile.appearance, dark) : undefined), [profile, dark]);
  const accent = profile?.appearance.accent;

  if (desk.status === 'loading' || !profile) return <PageSkeleton />;
  if (desk.status === 'error') {
    return (
      <Result
        status="warning"
        title="Không tải được bàn làm việc"
        subTitle={desk.error}
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => void desk.store.load()}>
            Thử lại
          </Button>
        }
      />
    );
  }
  const appearance = profile.appearance;
  const view = (
    <div className={`desk tone-${tone}${appearance.density === 'compact' ? ' desk-compact' : ''}`} style={style}>
      <Backdrop background={space?.config.background ?? appearance.background} dim={appearance.dim} blur={appearance.blur} motion={appearance.motion} onTone={setTone} />
      <div className="desk-body">
        <div className="desk-toolbar">
          <Button icon={<BgColorsOutlined />} onClick={() => setPanel(true)}>
            Hình nền và giao diện
          </Button>
        </div>
        <h2 className="desk-temp-title">{space?.name}</h2>
      </div>
      <BackgroundPanel open={panel} onClose={() => setPanel(false)} />
    </div>
  );
  return accent ? <ConfigProvider theme={{ token: { colorPrimary: accent, colorInfo: accent } }}>{view}</ConfigProvider> : view;
}

export default function Desk() {
  return (
    <DeskProvider>
      <DeskView />
    </DeskProvider>
  );
}
