import {
  Building2,
  ChevronRight,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api, auth } from '../api';
import { APPROVAL_ROLES, getInitials, hasAnyRole, roleLabels } from '../authz';
import { groupFor, navGroups, titleFor } from '../nav';
import CommandPalette from './CommandPalette';
import ConnectionBar from './ConnectionBar';
import ErrorBoundary from './ErrorBoundary';
import CopilotDock from './CopilotDock';
import ScrollProgress from './ScrollProgress';
import ThemeToggle from './ThemeToggle';
import { ToastHost } from './Toast';

const RAIL_KEY = 'ioc_sidebar_rail';
const DOCK_KEY = 'ioc_copilot_open';

function readFlag(key: string) {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string, value: boolean) {
  try {
    if (value) localStorage.setItem(key, '1');
    else localStorage.removeItem(key);
  } catch {
    /* Bỏ qua khi trình duyệt chặn lưu trữ cục bộ. */
  }
}

export default function Layout() {
  const [open, setOpen] = useState(false);
  const [rail, setRail] = useState(() => readFlag(RAIL_KEY));
  const [palette, setPalette] = useState(false);
  const [copilot, setCopilot] = useState(() => readFlag(DOCK_KEY));

  const sidebarRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  const user = auth.user;
  const isAdmin = user?.role === 'ADMIN';
  const scoped = !isAdmin;
  const initials = getInitials(user?.fullName);
  const roleLabel = user ? roleLabels[user.role] : 'Người dùng';
  const scopeLabel = isAdmin ? 'Toàn hệ thống' : user?.department?.name || 'Chưa gán phòng ban';
  const title = titleFor(location.pathname, scoped);
  const group = groupFor(location.pathname);

  const visibleGroups = navGroups
    .map(entry => ({ ...entry, items: entry.items.filter(item => hasAnyRole(user, item.roles)) }))
    .filter(entry => entry.items.length > 0);

  const setCopilotOpen = useCallback((value: boolean) => {
    setCopilot(value);
    writeFlag(DOCK_KEY, value);
  }, []);

  /* Số việc đang chờ người dùng xử lý, hiển thị thành huy hiệu trên thanh điều hướng.
     Đây là thứ bản cũ không có: cán bộ phải mở từng màn hình mới biết có việc mới hay không.
     Lỗi tải được nuốt im lặng — đây là thông tin phụ trợ, không được làm hỏng màn hình chính. */
  const [pending, setPending] = useState({ approvals: 0, feedback: 0 });
  const userId = user?.id;
  const canApprove = hasAnyRole(user, APPROVAL_ROLES);

  useEffect(() => {
    if (!userId) return;
    let active = true;

    const load = async () => {
      const [updates, stats] = await Promise.allSettled([
        canApprove ? api<unknown[]>('/targets/pending-updates') : Promise.resolve([]),
        api<{ received?: number; reopenRequested?: number }>('/feedbacks/stats'),
      ]);
      if (!active) return;
      setPending({
        approvals: updates.status === 'fulfilled' && Array.isArray(updates.value) ? updates.value.length : 0,
        feedback:
          stats.status === 'fulfilled'
            ? (stats.value?.received ?? 0) + (stats.value?.reopenRequested ?? 0)
            : 0,
      });
    };

    void load();
    const timer = window.setInterval(() => void load(), 120_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [userId, canApprove]);

  const pendingFor = (to: string) =>
    to === '/admin/approvals' ? pending.approvals : to === '/admin/feedback' ? pending.feedback : 0;

  /* Đóng ngăn kéo mỗi khi chuyển màn hình. */
  useEffect(() => setOpen(false), [location.pathname]);

  /* Đường dẫn /admin/copilot của bản cũ vẫn dùng được: đưa về tổng quan và mở trợ lý. */
  useEffect(() => {
    if (location.pathname !== '/admin/copilot') return;
    setCopilotOpen(true);
    navigate('/admin', { replace: true });
  }, [location.pathname, navigate, setCopilotOpen]);

  /* Ctrl/⌘ + K mở bảng lệnh. */
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPalette(value => !value);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* Ngăn kéo trên màn hình hẹp: khoá cuộn nền, giữ tiêu điểm, Esc để đóng. */
  useLayoutEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusClose = () => sidebarRef.current?.querySelector<HTMLElement>('.mobile-close')?.focus();
    focusClose();
    const focusTimer = window.setTimeout(focusClose, 280);
    const close = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', close);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', close);
      document.body.style.overflow = previousOverflow;
      window.setTimeout(() => menuButtonRef.current?.focus(), 0);
    };
  }, [open]);

  const logout = () => {
    auth.clear();
    navigate('/admin/login', { replace: true });
  };

  const toggleRail = () => {
    setRail(value => {
      writeFlag(RAIL_KEY, !value);
      return !value;
    });
  };

  function keepSidebarFocus(event: ReactKeyboardEvent<HTMLElement>) {
    if (!open || event.key !== 'Tab') return;
    const items = [
      ...(sidebarRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) || []),
    ];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="app-shell" data-rail={rail || undefined} data-copilot={copilot ? 'open' : undefined}>
      <a className="skip-link" href="#noi-dung-chinh">
        Bỏ qua điều hướng, tới nội dung chính
      </a>
      <ScrollProgress />

      <aside
        ref={sidebarRef}
        id="admin-navigation"
        aria-label="Điều hướng quản trị"
        className={`sidebar ${open ? 'open' : ''}`}
        onKeyDown={keepSidebarFocus}
      >
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            LT
          </div>
          <div>
            <strong>IOC LÁI THIÊU</strong>
            <span>Trung tâm điều hành</span>
          </div>
          <button
            type="button"
            className="rail-toggle"
            onClick={toggleRail}
            aria-label={rail ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
          >
            {rail ? <PanelLeftOpen /> : <PanelLeftClose />}
          </button>
          <button type="button" className="mobile-close" onClick={() => setOpen(false)} aria-label="Đóng menu">
            <X />
          </button>
        </div>

        <div className="system-state">
          <i aria-hidden="true" />
          Phiên làm việc đã xác thực
        </div>

        <nav>
          {visibleGroups.map(entry => (
            <div className="nav-group" key={entry.label}>
              <p className="nav-label">{entry.label}</p>
              {entry.items.map(({ to, label, scopedLabel, icon: Icon }) => {
                const text = (scoped && scopedLabel) || label;
                const count = pendingFor(to);
                return (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/admin'}
                    /* Khi thu gọn còn dải biểu tượng, nhãn chỉ còn hiện qua chú giải.
                       Dùng `title` của trình duyệt thay vì chú giải CSS vì vùng điều
                       hướng có thanh cuộn dọc, mọi phần tử tràn ra ngoài đều bị cắt. */
                    title={rail ? text : undefined}
                    className={({ isActive }) => (isActive ? 'active' : '')}
                  >
                    <Icon size={18} aria-hidden="true" />
                    <span>{text}</span>
                    {count > 0 && (
                      <i className="nav-count" aria-label={`${count} việc đang chờ xử lý`}>
                        {count > 99 ? '99+' : count}
                      </i>
                    )}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="avatar" aria-hidden="true">
            {initials}
          </div>
          <div>
            <strong>{user?.fullName || 'Người dùng'}</strong>
            <span>{roleLabel}</span>
          </div>
          <button type="button" onClick={logout} aria-label="Đăng xuất" data-tooltip="Đăng xuất">
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      {open && <div className="backdrop" onClick={() => setOpen(false)} />}

      <main className="main-area" inert={open ? true : undefined} aria-hidden={open ? true : undefined}>
        <header className="topbar">
          <button
            ref={menuButtonRef}
            type="button"
            className="menu-btn"
            onClick={() => setOpen(true)}
            aria-label="Mở menu"
            aria-controls="admin-navigation"
            aria-expanded={open}
          >
            <Menu />
          </button>

          <div>
            <p className="breadcrumb">
              <span>{group}</span>
              <ChevronRight aria-hidden="true" />
              <span>{roleLabel}</span>
            </p>
            <h1>{title}</h1>
          </div>

          <div className="top-actions">
            <div className="clock-chip">
              <Building2 size={15} aria-hidden="true" />
              {scopeLabel}
            </div>
            <button
              type="button"
              className="cmdk-trigger"
              onClick={() => setPalette(true)}
              aria-label="Mở bảng lệnh tìm kiếm"
            >
              <Search aria-hidden="true" />
              <span>Tìm nhanh…</span>
              <kbd className="kbd">Ctrl K</kbd>
            </button>
            <ThemeToggle />
            <NavLink
              to="/admin/profile"
              className={({ isActive }) => `profile-chip${isActive ? ' active' : ''}`}
              aria-label="Mở hồ sơ và bảo mật"
              title="Hồ sơ & bảo mật"
            >
              <div className="avatar small" aria-hidden="true">
                {initials}
              </div>
              <span>{user?.fullName || 'Người dùng'}</span>
            </NavLink>
          </div>
        </header>

        <ConnectionBar />

        <div className="page" id="noi-dung-chinh">
          <ErrorBoundary inline resetKey={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>

      <CommandPalette open={palette} onClose={() => setPalette(false)} onOpenCopilot={() => setCopilotOpen(true)} />
      <CopilotDock open={copilot} onOpenChange={setCopilotOpen} />
      <ToastHost shifted />
    </div>
  );
}
