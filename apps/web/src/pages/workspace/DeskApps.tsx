import { AppstoreOutlined, BankOutlined, BellOutlined, FileDoneOutlined, FileTextOutlined, GlobalOutlined, InboxOutlined, LinkOutlined, MailOutlined, MessageOutlined, PlusOutlined, SearchOutlined, TeamOutlined } from '@ant-design/icons';
import { Badge, Button, Drawer, Empty, Input, Tooltip } from 'antd';
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { fold, navItems } from '@/app/nav';
import { useMe } from '@/app/session';
import { useApi } from '@/hooks/useApi';
import { can } from '@/lib/roles';
import { safeShortcut, type Shortcut } from './model';
import type { DeskCounts, WorkApp, WorkAppsData } from './desk-api';
import './desk.css';

export const APP_ICONS = { global: <GlobalOutlined />, mail: <MailOutlined />, bank: <BankOutlined />, document: <FileTextOutlined />, inbox: <InboxOutlined />, approval: <FileDoneOutlined />, message: <MessageOutlined />, bell: <BellOutlined />, team: <TeamOutlined />, link: <LinkOutlined /> };
export function WorkAppIcon({ icon, color }: { icon: string; color: string }) { return <span className="desk-app-icon" style={{ '--app-color': color } as CSSProperties}>{APP_ICONS[icon as keyof typeof APP_ICONS] ?? icon.slice(0, 3)}</span>; }
const BADGES: Record<string, keyof DeskCounts> = { '/admin/approvals': 'approvals', '/admin/viec-cua-toi': 'work', '/admin/proposals': 'proposals', '/admin/feedback': 'feedback', '/admin/notifications': 'notifications' };
type AppItem = { id: string; name: string; url: string; icon: string; color: string; group: string; description: string; badge?: number; shortcut?: Shortcut };

export function DeskApps({ shortcuts, position, editing, onAdd, onEdit }: { shortcuts: Shortcut[]; position: 'bottom' | 'left' | 'hidden'; editing: boolean; onAdd: () => void; onEdit: (s: Shortcut) => void }) {
  const me = useMe();
  const navigate = useNavigate();
  const apps = useApi<WorkAppsData>('/workspace/apps', { refetchInterval: 60_000 });
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const anchor = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ left: 0, width: 1000 });
  useLayoutEffect(() => { const desk = anchor.current?.closest('.ws-root'); if (!desk) return; const measure = () => { const box = desk.getBoundingClientRect(); setBounds({ left: box.left, width: box.width }); }; measure(); const observer = new ResizeObserver(measure); observer.observe(desk); window.addEventListener('resize', measure); return () => { observer.disconnect(); window.removeEventListener('resize', measure); }; }, []);
  const items: AppItem[] = [
    ...(apps.data?.apps ?? []).map((app: WorkApp) => ({ ...app, id: `app:${app.id}` })),
    ...shortcuts.filter(s => { const nav = navItems.find(n => n.path === s.url.split('?')[0]); return !nav || can(me, nav.roles); }).map(s => ({ ...s, id: `shortcut:${s.id}`, name: s.title, group: 'Lối tắt riêng', description: s.hotkey ? `Alt + ${s.hotkey}` : s.title, badge: apps.data?.badges[BADGES[s.url.split('?')[0]]], shortcut: s })),
  ];
  const filtered = items.filter(item => fold(`${item.name} ${item.group} ${item.description}`).includes(fold(search)));
  const groups = [...new Set(filtered.map(item => item.group))];
  function launch(item: AppItem) { if (editing && item.shortcut) { onEdit(item.shortcut); return; } if (!safeShortcut(item.url)) return; if (item.url.startsWith('/')) navigate(item.url); else window.open(item.url, '_blank', 'noopener,noreferrer'); setOpen(false); }
  const render = (item: AppItem, grid = false) => <Tooltip key={item.id} title={<><strong>{item.name}</strong>{item.description && <div>{item.description}</div>}</>}><button className={`desk-app-tile${grid ? ' grid' : ''}`} onClick={() => launch(item)} aria-label={`${item.name}${item.badge ? `, ${item.badge} việc` : ''}`}><Badge count={item.badge || 0} overflowCount={99}><WorkAppIcon icon={item.icon} color={item.color} /></Badge>{grid && <span>{item.name}</span>}</button></Tooltip>;
  const dockItems = items.slice(0, bounds.width < 700 ? 4 : 9);
  return <div ref={anchor} className={`desk-apps-anchor desk-dock-${position}`}>
    {position === 'hidden' ? <Button className="desk-apps-hidden-toggle" icon={<AppstoreOutlined />} onClick={() => setOpen(true)}>Tất cả ứng dụng</Button> : <nav className={`desk-dock ${position}`} style={{ '--dock-left': `${bounds.left}px`, '--dock-width': `${bounds.width}px` } as CSSProperties} aria-label="Ứng dụng công vụ">{dockItems.map((item, index) => <div key={item.id} className={`desk-dock-slot${index && dockItems[index - 1].group !== item.group ? ' desk-dock-group-start' : ''}`}>{render(item)}</div>)}<Tooltip title="Tất cả ứng dụng"><button className="desk-app-tile desk-dock-all" aria-label="Tất cả ứng dụng" onClick={() => setOpen(true)}><AppstoreOutlined /></button></Tooltip>{bounds.width >= 700 && <Tooltip title="Thêm lối tắt"><button className="desk-app-tile desk-dock-add" aria-label="Thêm lối tắt" onClick={onAdd}><PlusOutlined /></button></Tooltip>}</nav>}
    <Drawer title="Tất cả ứng dụng" open={open} onClose={() => setOpen(false)} size={680} extra={<Button icon={<PlusOutlined />} onClick={onAdd}>Thêm lối tắt</Button>}><Input value={search} onChange={event => setSearch(event.target.value)} allowClear prefix={<SearchOutlined />} aria-label="Tìm ứng dụng" placeholder="Tìm ứng dụng" />{apps.error && <p>Chưa tải được ứng dụng công vụ. <Button size="small" onClick={() => void apps.refetch()}>Thử lại</Button></p>}{groups.map(group => <section className="desk-app-group" key={group}><h3>{group}</h3><div className="desk-app-grid">{filtered.filter(item => item.group === group).map(item => render(item, true))}</div></section>)}{!filtered.length && <Empty description="Chưa có ứng dụng" />}</Drawer>
  </div>;
}
