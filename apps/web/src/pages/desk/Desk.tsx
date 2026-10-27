import { ReloadOutlined } from '@ant-design/icons';
import { Button, ConfigProvider, Result } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useThemeMode } from '@/app/theme';
import { PageSkeleton } from '@/components/States';
import { deskStyle } from './appearance';
import { Backdrop } from './background/Backdrop';
import { BackgroundPanel } from './background/BackgroundPanel';
import type { Tone } from './background/tone';
import { ConflictDialog, DeskHeader, EditToolbar } from './DeskHeader';
import { DeskGrid, MaximizedWidget } from './DeskGrid';
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

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/** Phím tắt của bàn làm việc: Alt 1…9 đổi không gian; khi tùy biến: Ctrl Z / Ctrl Y hoàn tác, làm lại, Esc để xong. */
function useDeskKeys() {
  const desk = useDesk();
  const { store, spaces, editing } = desk;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (typing(event.target)) return;
      if (event.altKey && !event.ctrlKey && !event.metaKey && /^Digit[1-9]$/.test(event.code)) {
        const space = spaces[Number(event.code.slice(5)) - 1];
        if (space) {
          event.preventDefault();
          store.setActiveSpace(space.id);
        }
        return;
      }
      if (!editing) return;
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        store.undo();
      } else if (mod && (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey))) {
        event.preventDefault();
        store.redo();
      } else if (event.key === 'Escape' && !document.querySelector('.ant-drawer-open, .ant-modal-wrap:not([style*="display: none"])')) {
        store.setEditing(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store, spaces, editing]);
}

function DeskView() {
  const desk = useDesk();
  const space = useActiveSpace();
  const { dark } = useThemeMode();
  const [tone, setTone] = useState<Tone>('dark');
  const [panel, setPanel] = useState(false);
  const [library, setLibrary] = useState(false);
  const [settingsFor, setSettingsFor] = useState<string | null>(null);
  const [maximized, setMaximized] = useState<string | null>(null);
  const profile = desk.profile?.config;
  useStartPage(profile);
  useDeskKeys();

  const style = useMemo(() => (profile ? deskStyle(profile.appearance, dark) : undefined), [profile, dark]);
  const accent = profile?.appearance.accent;
  const openLibrary = useCallback(() => {
    desk.store.setEditing(true);
    setLibrary(true);
  }, [desk.store]);
  const closeMaximized = useCallback(() => setMaximized(null), []);

  if (desk.status === 'loading' || (desk.status === 'ready' && !profile)) return <PageSkeleton />;
  if (desk.status === 'error' || !profile) {
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
    <div className={`desk tone-${tone}${appearance.density === 'compact' ? ' desk-compact' : ''}${desk.editing ? ' is-editing' : ''}`} style={style}>
      <Backdrop background={space?.config.background ?? appearance.background} dim={appearance.dim} blur={appearance.blur} motion={appearance.motion} onTone={setTone} />
      <div className="desk-body">
        {space && <DeskHeader space={space} onBackground={() => setPanel(true)} onLibrary={openLibrary} />}
        {space && <DeskGrid space={space} onSettings={setSettingsFor} onMaximize={setMaximized} onOpenLibrary={openLibrary} />}
      </div>
      <EditToolbar onLibrary={openLibrary} onBackground={() => setPanel(true)} />
      {space && maximized && <MaximizedWidget space={space} widgetId={maximized} onClose={closeMaximized} onSettings={() => setSettingsFor(maximized)} />}
      <BackgroundPanel open={panel} onClose={() => setPanel(false)} />
      <ConflictDialog />
      <span hidden data-library={library} data-settings={settingsFor ?? ''} />
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
