import {
  DesktopOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuOutlined,
  MenuUnfoldOutlined,
  MoonOutlined,
  SearchOutlined,
  SunOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Avatar, Badge, Button, Drawer, Dropdown, Grid, Layout, Menu, Tooltip, type MenuProps } from 'antd';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { localityInitials, useLocality } from '@/app/locality';
import { useMe } from '@/app/session';
import { useThemeMode, type ThemeChoice } from '@/app/theme';
import { BackToTop } from '@/components/Scroll';
import { ErrorBoundary, PageSkeleton } from '@/components/States';
import { useApi } from '@/hooks/useApi';
import { session } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { APPROVERS, can, initials, isGlobal, roleLabel } from '@/lib/roles';
import { navGroups, routeInfo } from '../nav';
import { BugReport } from './BugReport';
import { CommandPalette } from './CommandPalette';
import { Jarvis, JarvisMark, type JarvisVoiceState } from './Jarvis';
import { Notifications } from './Notifications';
import './layout.css';

const COLLAPSE_KEY = 'ioc_nav_collapsed';

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

function Brand({ collapsed }: { collapsed?: boolean }) {
  const locality = useLocality();
  return (
    <Link to="/admin" className={`brand${collapsed ? ' collapsed' : ''}`}>
      <span className="brand-mark">{localityInitials(locality)}</span>
      {!collapsed && (
        <span className="brand-text">
          <strong>{locality.brandName}</strong>
          <span>{locality.configured ? locality.agencyName : 'Trung tâm điều hành'}</span>
        </span>
      )}
    </Link>
  );
}

function useCounts() {
  const user = useMe();
  const approvals = useApi<unknown[]>(can(user, APPROVERS) ? '/targets/pending-updates' : null, { refetchInterval: 120_000 });
  const feedback = useApi<{ received?: number; reopenRequested?: number }>('/feedbacks/stats', { refetchInterval: 120_000 });
  return {
    '/admin/approvals': approvals.data?.length ?? 0,
    '/admin/feedback': (feedback.data?.received ?? 0) + (feedback.data?.reopenRequested ?? 0),
  } as Record<string, number>;
}

function NavMenu({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const user = useMe();
  const location = useLocation();
  const navigate = useNavigate();
  const counts = useCounts();
  const scoped = !isGlobal(user);

  const items = useMemo<MenuProps['items']>(
    () =>
      navGroups
        .map(group => ({
          type: 'group' as const,
          key: group.label,
          label: group.label,
          children: group.items
            .filter(item => can(user, item.roles))
            .map(item => {
              const label = (scoped && item.scopedLabel) || item.label;
              const count = counts[item.path] ?? 0;
              return {
                key: item.path,
                icon: item.icon,
                label: (
                  <span className="menu-label">
                    <span>{label}</span>
                    {count > 0 && !collapsed && <Badge count={count} size="small" overflowCount={99} />}
                  </span>
                ),
                title: label,
              };
            }),
        }))
        .filter(group => group.children.length > 0),
    [user, scoped, counts, collapsed],
  );

  const selected = routeInfo(location.pathname, scoped).path;
  const selectedKey = navGroups.flatMap(group => group.items).find(item => item.path !== '/admin' && selected.startsWith(item.path))?.path ?? selected;

  return (
    <Menu
      mode="inline"
      inlineCollapsed={collapsed}
      items={items}
      selectedKeys={[selectedKey]}
      onClick={({ key }) => {
        onNavigate?.();
        if (key === '/trinh-chieu') window.open('/trinh-chieu', '_blank', 'noopener');
        else navigate(key);
      }}
      className="side-menu"
    />
  );
}

const THEME_ITEMS: { key: ThemeChoice; label: string; icon: React.ReactNode }[] = [
  { key: 'light', label: 'Sáng', icon: <SunOutlined /> },
  { key: 'dark', label: 'Tối', icon: <MoonOutlined /> },
  { key: 'system', label: 'Theo hệ thống', icon: <DesktopOutlined /> },
];

export default function AdminLayout() {
  const user = useMe();
  const location = useLocation();
  const navigate = useNavigate();
  const screens = Grid.useBreakpoint();
  const mobile = !screens.lg;
  const theme = useThemeMode();
  const locality = useLocality();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const [copilot, setCopilot] = useState(false);
  const [voice, setVoice] = useState<JarvisVoiceState>('off');
  const openJarvis = useCallback(() => setCopilot(true), []);
  const closeJarvis = useCallback(() => setCopilot(false), []);
  const [loadedAt, setLoadedAt] = useState(() => new Date());
  const info = routeInfo(location.pathname, !isGlobal(user));

  useEffect(() => {
    setDrawer(false);
    setLoadedAt(new Date());
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  // Liên kết cũ /admin/copilot: mở sẵn Jarvis.
  useEffect(() => {
    if ((location.state as { copilot?: boolean } | null)?.copilot) setCopilot(true);
  }, [location.state]);

  useEffect(() => {
    document.title = `${info.label} · ${locality.brandName}`;
  }, [info.label, locality.brandName]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPalette(value => !value);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'j') {
        event.preventDefault();
        setCopilot(value => !value);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function toggle() {
    if (mobile) {
      setDrawer(true);
      return;
    }
    setCollapsed(value => {
      try {
        localStorage.setItem(COLLAPSE_KEY, value ? '0' : '1');
      } catch {
        /* bỏ qua */
      }
      return !value;
    });
  }

  function logout() {
    session.clear();
    navigate('/admin/login', { replace: true });
  }

  const userMenu: MenuProps = {
    items: [
      {
        key: 'who',
        type: 'group',
        label: (
          <div className="user-card">
            <strong>{user.fullName}</strong>
            <span>{user.position || roleLabel[user.role]}</span>
            {user.department && <span>{user.department.name}</span>}
          </div>
        ),
      },
      { type: 'divider' },
      { key: 'profile', icon: <UserOutlined />, label: 'Hồ sơ cá nhân', onClick: () => navigate('/admin/profile') },
      {
        key: 'theme',
        icon: theme.dark ? <MoonOutlined /> : <SunOutlined />,
        label: 'Giao diện',
        children: THEME_ITEMS.map(item => ({
          key: `theme-${item.key}`,
          icon: item.icon,
          label: item.label,
          onClick: () => theme.setChoice(item.key),
        })),
      },
      { type: 'divider' },
      { key: 'logout', icon: <LogoutOutlined />, label: 'Đăng xuất', danger: true, onClick: logout },
    ],
    selectedKeys: [`theme-${theme.choice}`],
  };

  const siderWidth = collapsed ? 64 : 240;

  return (
    <Layout className="shell" hasSider>
      {!mobile && (
        <Layout.Sider width={240} collapsedWidth={64} collapsed={collapsed} trigger={null} className="shell-sider" style={{ position: 'fixed', insetBlock: 0, insetInlineStart: 0 }}>
          <Brand collapsed={collapsed} />
          <div className="sider-scroll">
            <NavMenu collapsed={collapsed} />
          </div>
        </Layout.Sider>
      )}
      {mobile && (
        <Drawer placement="left" open={drawer} onClose={() => setDrawer(false)} size={272} closable={false} styles={{ body: { padding: 0 } }} className="shell-drawer">
          <Brand />
          <NavMenu onNavigate={() => setDrawer(false)} />
        </Drawer>
      )}
      <Layout style={{ marginInlineStart: mobile ? 0 : siderWidth, transition: 'margin-inline-start 0.2s' }}>
        <Layout.Header className="shell-header">
          <Button
            type="text"
            className="head-btn"
            icon={mobile ? <MenuOutlined /> : collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={toggle}
            aria-label="Thu gọn hoặc mở rộng điều hướng"
          />
          <button type="button" className="search-trigger" onClick={() => setPalette(true)}>
            <SearchOutlined />
            <span className="search-label">Tìm kiếm</span>
            <kbd>Ctrl K</kbd>
          </button>
          <div className="head-actions">
            <Tooltip title={voice === 'idle' ? 'Jarvis đang chờ gọi tên (Ctrl J)' : 'Jarvis (Ctrl J)'}>
              <Button
                type="text"
                className={`head-btn jarvis-btn voice-${voice}${copilot ? ' on' : ''}`}
                icon={<JarvisMark size={20} state={voice} />}
                onClick={() => setCopilot(value => !value)}
                aria-label="Jarvis"
              />
            </Tooltip>
            <BugReport />
            <Notifications />
            <Dropdown menu={userMenu} trigger={['click']} placement="bottomRight">
              <button type="button" className="user-chip" aria-label="Tài khoản">
                <Avatar size={30} className="user-avatar">
                  {initials(user.fullName)}
                </Avatar>
                {screens.md && (
                  <span className="user-chip-text">
                    <strong>{user.fullName}</strong>
                    <span>{user.position || roleLabel[user.role]}</span>
                  </span>
                )}
              </button>
            </Dropdown>
          </div>
        </Layout.Header>
        <Layout.Content className="shell-content">
          <ErrorBoundary resetKey={location.pathname}>
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </Layout.Content>
        <footer className="screen-strip" aria-label="Định danh màn hình">
          <span className="code">{info.screen}</span>
          <span>{locality.brandName}</span>
          <span>{dateTime(loadedAt)}</span>
        </footer>
      </Layout>
      <CommandPalette
        open={palette}
        onClose={() => setPalette(false)}
        onCopilot={() => setCopilot(true)}
        onTheme={() => theme.setChoice(theme.dark ? 'light' : 'dark')}
        onLogout={logout}
      />
      <Jarvis open={copilot} onOpen={openJarvis} onClose={closeJarvis} onVoiceState={setVoice} />
      <BackToTop />
    </Layout>
  );
}
