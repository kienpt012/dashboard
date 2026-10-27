import { ExportOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { Popover, Tooltip } from 'antd';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { navItems } from '@/app/nav';
import { useMe } from '@/app/session';
import { DeskIcon, hashColor } from './icons';
import type { DockItem } from './types';
import { hostOf } from './urls';
import { canOpenPath, monogram } from './widgets/tools-logic';
import './linktile.css';

// Ô biểu tượng của một lối tắt — dùng chung cho widget Lối tắt và dock. Chức năng trong hệ thống mở trong trang (trình
// chiếu mở thẻ mới), trang web ngoài mở thẻ mới không kèm thông tin trang gốc, thư mục mở bảng nổi.

export type TileSize = 's' | 'm' | 'l';

const GENERIC_LINK_ICONS = new Set(['global', 'link']);

export function tileColor(item: DockItem) {
  if ('color' in item && item.color) return item.color;
  return hashColor(item.kind === 'link' ? hostOf(item.url) || item.label : item.label);
}

/** Lối tắt người dùng được phép mở (chức năng hệ thống lọc theo vai trò; thư mục lọc cả mục con). */
export function useVisibleItems(items: DockItem[]): DockItem[] {
  const user = useMe();
  const allowed = (item: DockItem): boolean => !('path' in item) || canOpenPath(item.path, user.role, navItems);
  return items.filter(allowed).map(item => (item.kind === 'folder' ? { ...item, items: item.items.filter(allowed) } : item));
}

export function tileLabel(item: DockItem) {
  return item.label || (item.kind === 'link' ? hostOf(item.url) : '');
}

function TileIcon({ item }: { item: DockItem }) {
  const color = tileColor(item);
  if (item.kind === 'link' && GENERIC_LINK_ICONS.has(item.icon)) {
    return (
      <span className="lt-icon mono" style={{ background: color }} aria-hidden>
        {monogram(item.url)}
      </span>
    );
  }
  return (
    <span className="lt-icon" style={{ '--lt-color': color } as CSSProperties} aria-hidden>
      <DeskIcon name={item.icon} />
    </span>
  );
}

export function LinkTile({ item, size = 'm', showLabel = true, onOpen }: { item: DockItem; size?: TileSize; showLabel?: boolean; onOpen?: () => void }) {
  const [open, setOpen] = useState(false);
  const label = tileLabel(item);
  const className = `lt lt-${size}${showLabel ? '' : ' no-label'}`;
  const body = (extra?: ReactNode) => (
    <>
      <TileIcon item={item} />
      {showLabel && <span className="lt-label">{label}</span>}
      {extra}
    </>
  );
  const tip = (node: ReactNode, title: ReactNode) => (
    <Tooltip title={title} mouseEnterDelay={0.4}>
      {node}
    </Tooltip>
  );

  switch (item.kind) {
    case 'link':
      return tip(
        <a className={className} href={item.url} target="_blank" rel="noopener noreferrer" onClick={onOpen} aria-label={`${label} (mở thẻ mới)`}>
          {body(<ExportOutlined className="lt-external" />)}
        </a>,
        hostOf(item.url),
      );
    case 'screen':
    case 'view':
      if (item.path.startsWith('/trinh-chieu')) {
        return tip(
          <a className={className} href={item.path} target="_blank" rel="noopener" onClick={onOpen} aria-label={`${label} (mở thẻ mới)`}>
            {body()}
          </a>,
          label,
        );
      }
      return tip(
        <Link className={className} to={item.path} onClick={onOpen} aria-label={label}>
          {body()}
        </Link>,
        showLabel ? null : label,
      );
    case 'folder':
      return (
        <Popover
          open={open}
          onOpenChange={setOpen}
          trigger="click"
          placement="bottom"
          title={label}
          content={
            <div className="lt-folder">
              {item.items.length ? (
                item.items.map(child => (
                  <LinkTile
                    key={child.id}
                    item={child}
                    size="m"
                    onOpen={() => {
                      setOpen(false);
                      onOpen?.();
                    }}
                  />
                ))
              ) : (
                <span className="lt-empty">Thư mục trống</span>
              )}
            </div>
          }
        >
          <button type="button" className={`${className} folder`} aria-label={`Thư mục ${label}`} aria-expanded={open}>
            {body(<span className="lt-count">{item.items.length}</span>)}
          </button>
        </Popover>
      );
    case 'action':
      return tip(
        <button type="button" className={`${className} disabled`} disabled aria-label={label}>
          {body(<ThunderboltOutlined className="lt-external" />)}
        </button>,
        'Phím tắt gọi thao tác sẽ dùng được khi bật phân hệ Thao tác nhanh',
      );
  }
}
