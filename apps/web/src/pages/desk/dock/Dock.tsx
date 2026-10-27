import { AppstoreOutlined, DeleteOutlined, EditOutlined, FolderAddOutlined, FolderOutlined, PlusOutlined, SettingOutlined } from '@ant-design/icons';
import { App, Drawer, Dropdown, Tooltip, type MenuProps } from 'antd';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type DragEvent, type MouseEvent } from 'react';
import { useNavCounts } from '@/app/layout/navCounts';
import { useApi } from '@/hooks/useApi';
import type { MyWork } from '@/types/domain';
import { LinkTile, useVisibleItems } from '../LinkTile';
import type { DockItem } from '../types';
import { useDesk } from '../useDesk';
import { DockItemEditor, newItemId } from './DockItemEditor';
import { badgeFor, DOCK_MAX, magnifyScale, moveIntoFolder, moveItem, newFolderWith, removeItem, replaceItem } from './dock-logic';
import './dock.css';

// Dock lối tắt của bàn làm việc: nổi ở đáy (hoặc cạnh trái/phải) vùng bàn làm việc, phóng to biểu tượng theo con trỏ,
// huy hiệu số việc chờ, tự ẩn tuỳ chọn. Chuột phải một biểu tượng: sửa, chuyển vào thư mục, gỡ. Khi tùy biến: kéo để
// sắp xếp. Trên điện thoại thành thanh đáy năm ô.

const MOBILE_SLOTS = 4;

function useDeskRect(anchor: React.RefObject<HTMLElement | null>) {
  const [rect, setRect] = useState({ left: 0, width: typeof window === 'undefined' ? 1200 : window.innerWidth });
  useLayoutEffect(() => {
    const desk = anchor.current?.closest<HTMLElement>('.desk');
    if (!desk) return;
    const measure = () => {
      const box = desk.getBoundingClientRect();
      setRect(current => (current.left === box.left && current.width === box.width ? current : { left: box.left, width: box.width }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(desk);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [anchor]);
  return rect;
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function Dock({ onSettings }: { onSettings: () => void }) {
  const desk = useDesk();
  const { message, modal } = App.useApp();
  const anchor = useRef<HTMLDivElement>(null);
  const rect = useDeskRect(anchor);
  const config = desk.profile?.config.dock;
  const raw = config?.items ?? [];
  const items = useVisibleItems(raw);
  const navCounts = useNavCounts();
  const work = useApi<MyWork>('/my-work', { refetchInterval: 120_000 });
  const workCount = work.data ? work.data.counts.needReport + work.data.counts.rejectedReports + work.data.counts.toReview + work.data.counts.explanations + work.data.counts.proposals : 0;
  const counts = { approvals: navCounts['/admin/approvals'] ?? 0, feedback: navCounts['/admin/feedback'] ?? 0, work: workCount };

  const [editing, setEditing] = useState<DockItem | 'new' | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; after: boolean } | null>(null);
  const [sheet, setSheet] = useState(false);
  const dragId = useRef<string | null>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  const itemRefs = useRef(new Map<string, HTMLDivElement>());
  const frame = useRef(0);

  const position = config?.position ?? 'bottom';
  const mobile = desk.breakpoint === 'mobile' || rect.width < 600;
  const vertical = !mobile && (position === 'left' || position === 'right');
  const reduced = desk.profile?.config.appearance.motion === 'reduced' || prefersReducedMotion();
  const magnify = Boolean(config?.magnify) && !reduced && !mobile && !desk.editing;
  const autoHide = Boolean(config?.autoHide) && !mobile && !desk.editing;
  const shown = !autoHide || revealed || menuOpen !== null || editing !== null;

  const save = useCallback(
    (next: DockItem[]) => desk.store.updateProfile(profile => ({ ...profile, dock: { ...profile.dock, items: next } })),
    [desk.store],
  );

  // Tự ẩn: hiện khi con trỏ tới sát mép bàn làm việc phía có dock.
  useEffect(() => {
    if (!autoHide) return;
    const onMove = (event: globalThis.MouseEvent) => {
      const near =
        position === 'bottom'
          ? event.clientY > window.innerHeight - 56
          : position === 'left'
            ? event.clientX >= rect.left && event.clientX < rect.left + 40
            : event.clientX <= rect.left + rect.width && event.clientX > rect.left + rect.width - 40;
      if (near) {
        window.clearTimeout(hideTimer.current);
        setRevealed(true);
      }
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, [autoHide, position, rect]);

  const resetScale = () => itemRefs.current.forEach(element => element.style.setProperty('--scale', '1'));
  const onMove = (event: MouseEvent<HTMLDivElement>) => {
    if (!magnify) return;
    const { clientX, clientY } = event;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      itemRefs.current.forEach(element => {
        const box = element.getBoundingClientRect();
        const distance = vertical ? Math.abs(clientY - (box.top + box.height / 2)) : Math.abs(clientX - (box.left + box.width / 2));
        element.style.setProperty('--scale', String(magnifyScale(distance)));
      });
    });
  };
  const onLeave = () => {
    cancelAnimationFrame(frame.current);
    resetScale();
    if (autoHide) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => setRevealed(false), 700);
    }
  };
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  // Kéo sắp xếp khi đang tùy biến (thao tác trên danh sách gốc theo mã, kể cả mục bị ẩn vì quyền).
  const onDragStart = (event: DragEvent<HTMLDivElement>, id: string) => {
    if (!desk.editing) return;
    dragId.current = id;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
  };
  const onDragOver = (event: DragEvent<HTMLDivElement>, id: string) => {
    if (!dragId.current || dragId.current === id) return;
    event.preventDefault();
    const box = event.currentTarget.getBoundingClientRect();
    const after = vertical ? event.clientY > box.top + box.height / 2 : event.clientX > box.left + box.width / 2;
    setDrop(current => (current?.id === id && current.after === after ? current : { id, after }));
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const from = raw.findIndex(item => item.id === dragId.current);
    const target = drop ? raw.findIndex(item => item.id === drop.id) : -1;
    dragId.current = null;
    setDrop(null);
    if (from < 0 || target < 0) return;
    const to = target + (drop!.after ? 1 : 0) - (from < target + (drop!.after ? 1 : 0) ? 1 : 0);
    if (to !== from) save(moveItem(raw, from, to));
  };

  const menuFor = (item: DockItem): MenuProps['items'] => {
    const folders = raw.filter(entry => entry.kind === 'folder' && entry.id !== item.id);
    return [
      { key: 'edit', icon: <EditOutlined />, label: item.kind === 'folder' ? 'Sửa thư mục…' : 'Sửa lối tắt…', onClick: () => setEditing(item) },
      ...(item.kind !== 'folder'
        ? [
            {
              key: 'folder',
              icon: <FolderOutlined />,
              label: 'Chuyển vào thư mục',
              children: [
                ...folders.map(folder => ({
                  key: `to-${folder.id}`,
                  label: folder.label,
                  onClick: () => {
                    const next = moveIntoFolder(raw, item.id, folder.id);
                    if (next) save(next);
                    else message.warning('Thư mục đã đủ 12 lối tắt');
                  },
                })),
                ...(folders.length ? [{ type: 'divider' as const }] : []),
                {
                  key: 'new-folder',
                  icon: <FolderAddOutlined />,
                  label: 'Thư mục mới',
                  onClick: () => {
                    const id = newItemId();
                    const next = newFolderWith(raw, item.id, 'Thư mục', id);
                    save(next);
                    const created = next.find(entry => entry.id === id);
                    if (created) setEditing(created);
                  },
                },
              ],
            },
          ]
        : []),
      { type: 'divider' as const },
      {
        key: 'remove',
        icon: <DeleteOutlined />,
        label: 'Gỡ khỏi dock',
        danger: true,
        onClick: () => {
          if (item.kind === 'folder' && item.items.length) {
            modal.confirm({ title: `Gỡ thư mục “${item.label}”?`, content: `Cả ${item.items.length} lối tắt trong thư mục sẽ được gỡ.`, okText: 'Gỡ', okButtonProps: { danger: true }, cancelText: 'Huỷ', onOk: () => save(removeItem(raw, item.id)) });
          } else save(removeItem(raw, item.id));
        },
      },
      { key: 'settings', icon: <SettingOutlined />, label: 'Cài đặt dock…', onClick: onSettings },
    ];
  };

  const editor = (
    <DockItemEditor
      open={editing !== null}
      value={editing === 'new' ? null : editing}
      allowFolder
      onCancel={() => setEditing(null)}
      onSave={item => {
        save(editing === 'new' ? [...raw, item] : replaceItem(raw, item));
        setEditing(null);
      }}
    />
  );

  if (!config || (position === 'hidden' && !desk.editing)) return <div ref={anchor} hidden>{editor}</div>;

  const addButton = (
    <Tooltip title={raw.length >= DOCK_MAX ? `Dock đã đủ ${DOCK_MAX} lối tắt` : 'Thêm lối tắt vào dock'}>
      <button type="button" className="dock-add" onClick={() => setEditing('new')} disabled={raw.length >= DOCK_MAX} aria-label="Thêm lối tắt vào dock">
        <PlusOutlined />
      </button>
    </Tooltip>
  );

  if (mobile) {
    const slots = items.slice(0, MOBILE_SLOTS);
    return (
      <div ref={anchor}>
        <nav className="dock mobile" aria-label="Dock lối tắt">
          {slots.map(item => (
            <div key={item.id} className="dock-item">
              <LinkTile item={item} size="s" />
              {'path' in item && badgeFor(item.path, counts) > 0 && <span className="dock-badge">{badgeFor(item.path, counts) > 99 ? '99+' : badgeFor(item.path, counts)}</span>}
            </div>
          ))}
          <button type="button" className="lt lt-s dock-more" onClick={() => setSheet(true)} aria-label="Mọi lối tắt">
            <span className="lt-icon">
              <AppstoreOutlined />
            </span>
            <span className="lt-label">Tất cả</span>
          </button>
        </nav>
        <Drawer placement="bottom" open={sheet} onClose={() => setSheet(false)} title="Lối tắt" size="auto" className="dock-sheet">
          <div className="dock-sheet-grid">
            {items.map(item => (
              <LinkTile key={item.id} item={item} onOpen={() => setSheet(false)} />
            ))}
            {addButton}
          </div>
        </Drawer>
        {editor}
      </div>
    );
  }

  const style = { '--desk-left': `${rect.left}px`, '--desk-w': `${rect.width}px` } as CSSProperties;
  return (
    <div ref={anchor}>
      <nav
        className={`dock ${position === 'hidden' ? 'bottom' : position}${autoHide ? ' auto' : ''}${shown ? '' : ' tucked'}${desk.editing ? ' is-editing' : ''}`}
        style={style}
        aria-label="Dock lối tắt"
        onMouseMove={onMove}
        onMouseEnter={() => window.clearTimeout(hideTimer.current)}
        onMouseLeave={onLeave}
        onFocus={() => setRevealed(true)}
        onDragLeave={event => !event.currentTarget.contains(event.relatedTarget as Node) && setDrop(null)}
      >
        {position === 'hidden' && <span className="dock-hint">Dock đang ẩn — chỉ hiện khi tùy biến</span>}
        {items.map(item => {
          const badge = 'path' in item ? badgeFor(item.path, counts) : 0;
          return (
            <Dropdown key={item.id} menu={{ items: menuFor(item) }} trigger={['contextMenu']} onOpenChange={open => setMenuOpen(open ? item.id : null)}>
              <div
                ref={element => {
                  if (element) itemRefs.current.set(item.id, element);
                  else itemRefs.current.delete(item.id);
                }}
                className={`dock-item${drop?.id === item.id ? (drop.after ? ' drop-after' : ' drop-before') : ''}`}
                draggable={desk.editing}
                onDragStart={event => onDragStart(event, item.id)}
                onDragOver={event => onDragOver(event, item.id)}
                onDrop={onDrop}
                onDragEnd={() => {
                  dragId.current = null;
                  setDrop(null);
                }}
                onClickCapture={event => {
                  if (!desk.editing) return;
                  event.preventDefault();
                  event.stopPropagation();
                  setEditing(item);
                }}
              >
                <LinkTile item={item} showLabel={false} />
                {badge > 0 && (
                  <span className="dock-badge" aria-label={`${badge} việc chờ`}>
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </div>
            </Dropdown>
          );
        })}
        {items.length > 0 && <span className="dock-sep" aria-hidden />}
        {addButton}
      </nav>
      {editor}
    </div>
  );
}
