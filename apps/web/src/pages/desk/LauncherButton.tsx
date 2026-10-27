import { AppstoreOutlined, DesktopOutlined } from '@ant-design/icons';
import { Button, Empty, Popover, Spin, Tooltip } from 'antd';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMe } from '@/app/session';
import { navGroups, type NavItem } from '@/app/nav';
import { useApi } from '@/hooks/useApi';
import { can } from '@/lib/roles';
import { SCREEN_ICONS } from './icons';
import { LinkTile, useVisibleItems } from './LinkTile';
import type { DeskPayload, DockItem } from './types';
import './launcher.css';

// Nút "Lối tắt" trên đầu trang của mọi màn hình: lối tắt người dùng đã ghim (dock) và mọi chức năng được phép dùng,
// vẽ bằng cùng ô biểu tượng với dock và widget Lối tắt.

const navTile = (item: NavItem): DockItem => ({ id: item.path, kind: 'screen', path: item.path, label: item.label, icon: SCREEN_ICONS[item.path] ?? 'link' });

export function LauncherButton() {
  const user = useMe();
  const [open, setOpen] = useState(false);
  const desk = useApi<DeskPayload>(open ? '/desk' : null, { staleTime: 0 });
  const pinned = useVisibleItems(desk.data?.profile.config.dock.items ?? []);
  const groups = navGroups
    .map(group => ({ ...group, items: group.items.filter(item => can(user, item.roles)) }))
    .filter(group => group.items.length);
  const close = () => setOpen(false);

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
          <div className="lp-grid">
            {pinned.map(item => (
              <LinkTile key={item.id} item={item} size="s" onOpen={close} />
            ))}
          </div>
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
              <LinkTile key={item.path} item={navTile(item)} size="s" onOpen={close} />
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
