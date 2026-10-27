import { ReloadOutlined } from '@ant-design/icons';
import { Button, ConfigProvider, Result } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useThemeMode } from '@/app/theme';
import { PageSkeleton } from '@/components/States';
import { deskStyle } from './appearance';
import { Backdrop } from './background/Backdrop';
import { BackgroundPanel, type PanelTab } from './background/BackgroundPanel';
import type { Tone } from './background/tone';
import { ConflictDialog, DeskHeader, EditToolbar } from './DeskHeader';
import { Dock } from './dock/Dock';
import { DeskGrid, MaximizedWidget } from './DeskGrid';
import { DeskProvider, useActiveSpace, useDesk } from './useDesk';
import { WidgetLibrary } from './WidgetLibrary';
import { WidgetSettings } from './WidgetSettings';
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

/** Cuộn tới widget vừa thêm và nháy viền để mắt bắt được ngay. */
function revealWidget(widgetId: string) {
  window.setTimeout(() => {
    const element = document.querySelector<HTMLElement>(`.desk-grid .dw[data-widget="${widgetId}"]`);
    if (!element) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'nearest' });
    element.classList.add('dw-flash');
    window.setTimeout(() => element.classList.remove('dw-flash'), 1800);
  }, 80);
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
  const [panelTab, setPanelTab] = useState<PanelTab>('background');
  const [library, setLibrary] = useState(false);
  const [settingsFor, setSettingsFor] = useState<string | null>(null);
  const [settingsSide, setSettingsSide] = useState<'left' | 'right'>('right');
  const [maximized, setMaximized] = useState<string | null>(null);
  const profile = desk.profile?.config;
  useStartPage(profile);
  useDeskKeys();

  const style = useMemo(() => (profile ? deskStyle(profile.appearance, dark) : undefined), [profile, dark]);
  const accent = profile?.appearance.accent;
  // Mỗi lúc chỉ mở một ngăn bên (kho widget, hình nền, cài đặt widget) để chúng không chồng lên nhau.
  const openLibrary = useCallback(() => {
    desk.store.setEditing(true);
    setPanel(false);
    setSettingsFor(null);
    setLibrary(true);
  }, [desk.store]);
  const openPanel = useCallback((tab: PanelTab = 'background') => {
    setLibrary(false);
    setSettingsFor(null);
    setPanelTab(tab);
    setPanel(true);
  }, []);
  const closeMaximized = useCallback(() => setMaximized(null), []);
  // Ngăn cài đặt mở ở phía không che widget đang sửa, để thấy thay đổi ngay.
  const openSettings = useCallback((widgetId: string) => {
    const rect = document.querySelector(`.desk-grid .dw[data-widget="${widgetId}"]`)?.getBoundingClientRect();
    setSettingsSide(rect && rect.left + rect.width / 2 > window.innerWidth * 0.55 ? 'left' : 'right');
    setLibrary(false);
    setPanel(false);
    setSettingsFor(widgetId);
  }, []);

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
  const side = library || panel ? 'right' : settingsFor ? settingsSide : null;
  // Dock đứng cạnh trái/phải (không tự ẩn): chừa lề để dock không đè lên widget.
  const dockSide = (profile.dock.position === 'left' || profile.dock.position === 'right') && !profile.dock.autoHide ? ` dock-${profile.dock.position}` : '';
  const view = (
    <div className={`desk tone-${tone}${appearance.density === 'compact' ? ' desk-compact' : ''}${desk.editing ? ' is-editing' : ''}${side ? ` side-${side}` : ''}${dockSide}`} style={style}>
      <Backdrop background={space?.config.background ?? appearance.background} dim={appearance.dim} blur={appearance.blur} motion={appearance.motion} onTone={setTone} />
      <div className="desk-body">
        {space && <DeskHeader space={space} onBackground={() => openPanel()} onLibrary={openLibrary} />}
        {space && <DeskGrid space={space} onSettings={openSettings} onMaximize={setMaximized} onOpenLibrary={openLibrary} />}
      </div>
      <EditToolbar onLibrary={openLibrary} onBackground={() => openPanel()} />
      <Dock onSettings={() => openPanel('general')} />
      {space && maximized && <MaximizedWidget space={space} widgetId={maximized} onClose={closeMaximized} onSettings={() => openSettings(maximized)} />}
      <BackgroundPanel open={panel} tab={panelTab} onClose={() => setPanel(false)} />
      <ConflictDialog />
      {space && <WidgetLibrary open={library} onClose={() => setLibrary(false)} space={space} onAdded={revealWidget} />}
      {space && <WidgetSettings space={space} widgetId={settingsFor} placement={settingsSide} onClose={() => setSettingsFor(null)} />}
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
