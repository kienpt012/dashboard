import { BellOutlined, CalendarOutlined, ClockCircleOutlined, FileDoneOutlined, FileTextOutlined, InboxOutlined, PushpinOutlined } from '@ant-design/icons';
import { Alert, Button, Drawer, Empty, Segmented, Spin, Tag } from 'antd';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMe } from '@/app/session';
import { useApi } from '@/hooks/useApi';
import { dateTime } from '@/lib/format';
import { APPROVERS, can } from '@/lib/roles';
import type { DeskBriefingData, DeskBriefingItem } from './desk-api';
import { dueLabel } from './DeskNotes';
import './desk.css';

function BriefingItem({ item }: { item: DeskBriefingItem }) {
  const content = <><strong>{item.title}</strong><span>{item.status}</span>{item.assignee && <small>{item.assignee.fullName} · {item.assignee.username}</small>}{item.autoApproveAt && <small>Tự thông qua: {dueLabel(item.autoApproveAt)}</small>}</>;
  return item.href ? <Link className={`desk-agenda-item desk-agenda-${item.kind}`} to={item.href}>{content}</Link> : <div className={`desk-agenda-item desk-agenda-${item.kind}`}>{content}</div>;
}

export function DeskCalendarWidget() {
  const [period, setPeriod] = useState<'today' | 'tomorrow' | 'week'>('today');
  const briefing = useApi<DeskBriefingData>('/workspace/briefing', { refetchInterval: 30_000 });
  return <div className="desk-calendar-widget"><Segmented size="small" value={period} onChange={setPeriod} options={[{ value: 'today', label: 'Hôm nay' }, { value: 'tomorrow', label: 'Ngày mai' }, { value: 'week', label: 'Tuần này' }]} />{briefing.error ? <Alert type="warning" title="Chưa tải được lịch việc" /> : briefing.isLoading ? <Spin /> : <div className="desk-agenda-list">{(briefing.data?.[period] ?? []).map(item => <BriefingItem key={item.id} item={item} />)}{!briefing.data?.[period]?.length && <Empty description="Chưa có việc" image={Empty.PRESENTED_IMAGE_SIMPLE} />}</div>}</div>;
}

export function DeskBriefingHeader() {
  const me = useMe();
  const briefing = useApi<DeskBriefingData>('/workspace/briefing', { refetchInterval: 30_000 });
  const [day, setDay] = useState<'today' | 'tomorrow' | null>(null);
  const data = briefing.data;
  return <section className="desk-briefing" aria-label="Hôm nay và ngày mai">{briefing.error ? <Alert type="warning" title="Chưa tải được công việc" action={<Button onClick={() => void briefing.refetch()}>Thử lại</Button>} /> : <>
    <div className="desk-agenda-days">{(['today', 'tomorrow'] as const).map(key => <article className="desk-agenda-day" key={key}><header><h2><CalendarOutlined />{key === 'today' ? 'Hôm nay' : 'Ngày mai'}</h2><span>{data?.[key]?.length ?? 0} mục</span></header>{briefing.isLoading ? <Spin size="small" /> : <div className="desk-agenda-list">{data?.[key]?.slice(0, 4).map(item => <BriefingItem key={item.id} item={item} />)}{!data?.[key]?.length && <p className="desk-brief-empty">Chưa có việc</p>}</div>}<button className="desk-text-button" onClick={() => setDay(key)}>Xem tất cả</button></article>)}</div>
    <nav className="desk-counts" aria-label="Số việc cần xử lý"><Link to="/admin/viec-cua-toi"><FileTextOutlined /><strong>{data?.counts.reports ?? 0}</strong> báo cáo đến hạn</Link><button onClick={() => window.dispatchEvent(new Event('ioc:desk-notes-open'))}><PushpinOutlined /><strong>{data?.counts.notes ?? 0}</strong> note mới</button>{can(me, APPROVERS) && <Link to="/admin/approvals"><FileDoneOutlined /><strong>{data?.counts.approvals ?? 0}</strong> chờ duyệt</Link>}<Link to="/admin/viec-cua-toi"><InboxOutlined /><strong>{data?.counts.work ?? 0}</strong> việc cần làm</Link></nav>
  </>}
    <Drawer title={day === 'today' ? 'Hôm nay' : 'Ngày mai'} open={!!day} onClose={() => setDay(null)} size={620}><div className="desk-agenda-list">{day && data?.[day]?.map(item => <BriefingItem key={item.id} item={item} />)}{day && !data?.[day]?.length && <Empty description="Chưa có việc" />}</div></Drawer>
  </section>;
}

function tomorrowVietnam() {
  const date = new Date(Date.now() + 7 * 3_600_000);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1) - 7 * 3_600_000;
}

export function DeskSystemNotes({ all = false }: { all?: boolean }) {
  const me = useMe();
  const key = `ioc:desk-hidden:${me.id}`;
  const [hidden, setHidden] = useState<Record<string, number>>(() => { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; } });
  const [open, setOpen] = useState(false);
  const briefing = useApi<DeskBriefingData>('/workspace/briefing', { refetchInterval: 30_000 });
  const rows = (briefing.data?.systemNotes ?? []).filter(item => !(hidden[item.id] > Date.now()));
  function hide(id: string) { const next = { ...Object.fromEntries(Object.entries(hidden).filter(([, until]) => until > Date.now())), [id]: tomorrowVietnam() }; setHidden(next); try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* Hiding remains active in this tab when storage is unavailable. */ } }
  const cards = (list: DeskBriefingItem[]) => list.map(item => <article className="desk-system-paper" key={item.id}><header><Tag icon={<BellOutlined />}>Hệ thống</Tag><button className="desk-text-button" onClick={() => hide(item.id)}>Ẩn đến mai</button></header><BriefingItem item={item} />{item.dueAt && <time><ClockCircleOutlined /> {dateTime(item.dueAt)}</time>}</article>);
  if (!rows.length) return all ? <Empty description="Chưa có việc" /> : null;
  return <section className="desk-system-notes" aria-label="Note hệ thống"><div className="desk-section-heading"><h2><BellOutlined /> Nhắc việc <span>{rows.length}</span></h2>{!all && rows.length > 3 && <Button size="small" onClick={() => setOpen(true)}>Xem tất cả</Button>}</div><div className="desk-system-grid">{cards(all ? rows : rows.slice(0, 3))}</div><Drawer title="Note hệ thống" open={open} onClose={() => setOpen(false)} size={620}><div className="desk-system-grid">{cards(rows)}</div></Drawer></section>;
}
