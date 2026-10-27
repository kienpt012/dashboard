import { AppstoreOutlined, DesktopOutlined, ExportOutlined } from '@ant-design/icons';
import { Button, Empty, Popover, Spin, Tooltip } from 'antd';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMe } from '@/app/session';
import { navGroups, type NavItem } from '@/app/nav';
import { useApi } from '@/hooks/useApi';
import { can } from '@/lib/roles';
import { DeskIcon, hashColor } from './icons';
import type { DeskPayload, DockItem } from './types';
import './launcher.css';

// Nút "Lối tắt" trên đầu trang của mọi màn hình: lối tắt người dùng đã ghim (dock) và mọi chức năng được phép dùng.

function itemColor(item: DockItem) {
  if ('color' in item && item.color) return item.color;
  return hashColor(item.kind === 'link' ? new URL(item.url).hostname : item.label);
}

export function openDockItem(item: DockItem, navigate: (to: string) => void) {
  if (item.kind === 'link') window.open(item.url, '_blank', 'noopener,noreferrer');
  else if (item.kind === 'screen' || item.kind === 'view') {
    if (item.path.startsWith('/trinh-chieu')) window.open(item.path, '_blank', 'noopener');
    else navigate(item.path);
  }
}

function Tile({ item, onOpen }: { item: DockItem; onOpen: (item: DockItem) => void }) {
  const [open, setOpen] = useState(false);
  const color = itemColor(item);
  const tile = (
    <button type="button" className="lp-tile" onClick={() => (item.kind === 'folder' ? setOpen(value => !value) : onOpen(item))} title={item.kind === 'link' ? item.url : undefined}>
      <span className="lp-icon" style={{ background: `${color}1f`, color }}>
        <DeskIcon name={item.icon} size={18} />
      </span>
      <span className="lp-label">{item.label || (item.kind === 'link' ? new URL(item.url).hostname : '')}</span>
      {item.kind === 'link' && <ExportOutlined className="lp-external" />}
    </button>
  );
  if (item.kind !== 'folder') return tile;
  return (
    <Popover open={open} onOpenChange={setOpen} trigger="click" placement="bottom" content={<div className="lp-grid">{item.items.map(child => <Tile key={child.id} item={child} onOpen={onOpen} />)}</div>}>
      {tile}
    </Popover>
  );
}

function navTile(item: NavItem): DockItem {
  return { id: item.path, kind: 'screen', path: item.path, label: item.label, icon: 'link' };
}

export function LauncherButton() {
  const user = useMe();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const desk = useApi<DeskPayload>(open ? '/desk' : null, { staleTime: 0 });
  const pinned = desk.data?.profile.config.dock.items ?? [];
  const groups = navGroups
    .map(group => ({ ...group, items: group.items.filter(item => can(user, item.roles)) }))
    .filter(group => group.items.length);
  const go = (item: DockItem) => {
    setOpen(false);
    openDockItem(item, navigate);
  };

  const content = (
    <div className="lp-panel">
      <div className="lp-section">
        <div className="lp-title">
          <span>Lối tắt của tôi</span>
          <Link to="/admin" onClick={() => setOpen(false)}>
            <DesktopOutlined /> Bàn làm việc
          </Link>
        </div>
        {desk.isLoading ? (
          <div className="lp-loading">
            <Spin size="small" />
          </div>
        ) : pinned.length ? (
          <div className="lp-grid">{pinned.map(item => <Tile key={item.id} item={item} onOpen={go} />)}</div>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa ghim lối tắt nào — bấm biểu tượng ghim cạnh tiêu đề mỗi trang" />
        )}
      </div>
      {groups.map(group => (
        <div className="lp-section" key={group.label}>
          <div className="lp-title">
            <span>{group.label}</span>
          </div>
          <div className="lp-grid">
            {group.items.map(item => (
              <button type="button" key={item.path} className="lp-tile" onClick={() => go(navTile(item))}>
                <span className="lp-icon" style={{ background: 'var(--ioc-color-primary-bg)', color: 'var(--ioc-color-primary)' }}>
                  {item.icon}
                </span>
                <span className="lp-label">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <Popover content={content} trigger="click" open={open} onOpenChange={setOpen} placement="bottomRight" arrow={false} styles={{ container: { padding: 0 } }}>
      <Tooltip title="Lối tắt">
        <Button type="text" className="head-btn" icon={<AppstoreOutlined />} aria-label="Lối tắt" />
      </Tooltip>
    </Popover>
  );
}
