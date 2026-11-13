import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Tooltip } from 'antd';
import { Link } from 'react-router-dom';
import { ArrowRightOutlined, CheckOutlined, CloudOutlined, DeleteOutlined, LeftOutlined, PauseOutlined, PlayCircleOutlined, PlusOutlined, ReloadOutlined, RightOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useMe } from '@/app/session';
import { Chart, type ChartOption } from '@/components/Chart';
import { Markdown } from '@/components/Markdown';
import { errorText, http } from '@/lib/api';
import { holidaysOn } from '@/lib/holidays';
import { lunarLabel, solarToLunar, vietnamDateParts } from '@/lib/lunar';
import { toggleCheck } from '@/lib/markdown';
import type { MyWork, Overview } from '@/types/domain';
import type { WorkspaceWidget } from './model';
import { apiRows, calculateExpression, readJsonPath } from './widget-utils';
import './widgets.css';
import { DepartmentWorkWidget, MyTargetsWidget, TargetChartWidget, OverviewWidget, ApprovalWidget, ProposalsWidget, FeedbackWidget, DocumentsWidget, PinsWidget } from './IocWidgets';
import { SentNotesWidget } from './DeskNotes';
import { DeskCalendarWidget } from './DeskBriefing';

type Props = { widget: WorkspaceWidget; onChange: (settings: Record<string, unknown>) => void };
type RemoteResult = { data: unknown; fetchedAt: string; source: string };
type Task = { id: string; text: string; done: boolean; dueAt?: string };
const text = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const number = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const bounded = (value: unknown, fallback: number, min: number, max: number) => Math.max(min, Math.min(max, number(value, fallback)));
const numeric = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : typeof value === 'string' && value.trim() && Number.isFinite(Number(value)) ? Number(value) : null;
const format = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const DATE_OPTIONS: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
const PUBLIC_FORECAST = 'https://api.open-meteo.com/v1/forecast?latitude=10.905&longitude=106.699&hourly=temperature_2m&forecast_days=1&timezone=Asia%2FHo_Chi_Minh';

function useNow(interval = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), interval); return () => window.clearInterval(timer); }, [interval]);
  return now;
}

function validHttps(raw: string) {
  try { const url = new URL(raw); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; } catch { return ''; }
}

function useRemote(url: string, interval = 300) {
  const [result, setResult] = useState<RemoteResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    const id = ++generation.current;
    setResult(null);
    setError('');
    if (!url) { setLoading(false); return; }
    if (!validHttps(url)) { setLoading(false); setError('Nhập một địa chỉ API HTTPS hợp lệ.'); return; }
    let pending = false;
    const load = async () => {
      if (pending) return;
      pending = true;
      setLoading(true);
      try {
        const response = await http.post<RemoteResult>('/workspace/fetch', { url });
        if (generation.current === id) { setResult(response); setError(''); }
      } catch (cause) {
        if (generation.current === id) setError(errorText(cause));
      } finally {
        pending = false;
        if (generation.current === id) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, Math.max(60, interval) * 1000);
    return () => { generation.current++; window.clearInterval(timer); };
  }, [url, interval, refresh]);
  return { result, error, loading, refresh: () => setRefresh(value => value + 1) };
}

function State({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <div className={`ws-widget-state${error ? ' ws-widget-error' : ''}`}>{children}</div>;
}

function Refresh({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return <button type="button" className="ws-widget-icon-btn" aria-label="Làm mới dữ liệu" title="Làm mới dữ liệu" disabled={loading} onClick={onClick}><ReloadOutlined spin={loading} /></button>;
}

function ClockWidget({ widget }: Props) {
  const now = useNow();
  let zone = text(widget.settings.timezone, 'Asia/Ho_Chi_Minh');
  try { new Intl.DateTimeFormat('vi-VN', { timeZone: zone }).format(now); } catch { zone = 'Asia/Ho_Chi_Minh'; }
  const date = new Date(now);
  return <div className="ws-widget-clock"><div className="ws-widget-time">{date.toLocaleTimeString('vi-VN', { timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: Boolean(widget.settings.hour12) })}<span>{date.toLocaleTimeString('vi-VN', { timeZone: zone, second: '2-digit' })}</span></div><p>{date.toLocaleDateString('vi-VN', { ...DATE_OPTIONS, timeZone: zone })}</p><span className="ws-widget-pill">{zone.replaceAll('_', ' ')}</span></div>;
}

function WeatherWidget({ widget }: Props) {
  const lat = bounded(widget.settings.latitude, 10.905, -90, 90);
  const lon = bounded(widget.settings.longitude, 106.699, -180, 180);
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&forecast_days=3&timezone=auto`;
  const remote = useRemote(url, 900);
  const temperature = numeric(readJsonPath(remote.result?.data, 'current.temperature_2m'));
  const code = number(readJsonPath(remote.result?.data, 'current.weather_code'), -1);
  const description = code < 0 ? 'Dự báo hiện tại' : code === 0 ? 'Trời quang' : code <= 3 ? 'Có mây' : code <= 48 ? 'Sương mù' : code <= 67 ? 'Có mưa' : code <= 77 ? 'Có tuyết' : code <= 86 ? 'Mưa rào' : 'Dông';
  return <div className="ws-widget-weather"><div className="ws-widget-line"><span>{text(widget.settings.city, 'Lái Thiêu')}</span><Refresh loading={remote.loading} onClick={remote.refresh} /></div>{remote.error && <State error>{remote.error}</State>}{temperature === null ? !remote.error && <State>{remote.loading ? 'Đang lấy dự báo…' : 'Chưa có dữ liệu thời tiết.'}</State> : <><div className="ws-widget-weather-main"><div><strong>{Math.round(temperature)}<sup>°</sup></strong><p>{description}</p></div><div className="ws-widget-weather-orb"><CloudOutlined /></div></div><div className="ws-widget-weather-detail"><span>Độ ẩm <b>{String(readJsonPath(remote.result?.data, 'current.relative_humidity_2m') ?? '—')}%</b></span><span>Gió <b>{String(readJsonPath(remote.result?.data, 'current.wind_speed_10m') ?? '—')} km/h</b></span></div><div className="ws-widget-weather-days">{[0, 1, 2].map(index => { const rawDate = readJsonPath(remote.result?.data, `daily.time.${index}`); return <div key={index}><span>{index === 0 ? 'Hôm nay' : typeof rawDate === 'string' ? new Date(`${rawDate}T12:00:00`).toLocaleDateString('vi-VN', { weekday: 'short' }) : '—'}</span><b>{String(readJsonPath(remote.result?.data, `daily.temperature_2m_max.${index}`) ?? '—')}°</b><small>{String(readJsonPath(remote.result?.data, `daily.temperature_2m_min.${index}`) ?? '—')}°</small></div>; })}</div></>}<a className="ws-widget-source" href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Dự báo: Open-Meteo {remote.result ? `· ${new Date(remote.result.fetchedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : ''}</a></div>;
}

function NotesWidget({ widget, onChange }: Props) {
  const value = text(widget.settings.text);
  const preview = widget.settings.preview === true;
  return (
    <div className="ws-widget-notes">
      <div className="ws-widget-line ws-note-toolbar">
        <div className="ws-widget-segment" role="group" aria-label="Chế độ ghi chú">
          <button type="button" className={!preview ? 'active' : ''} aria-pressed={!preview} onClick={() => onChange({ ...widget.settings, preview: false })}>Viết</button>
          <button type="button" className={preview ? 'active' : ''} aria-pressed={preview} onClick={() => onChange({ ...widget.settings, preview: true })}>Xem trước</button>
        </div>
        <Tooltip title={<span>Dùng # cho tiêu đề, **chữ đậm**, _chữ nghiêng_, - cho danh sách, - [ ] cho ô đánh dấu và [tên](https://...) cho liên kết.</span>}>
          <button type="button" className="ws-widget-icon-btn ws-note-help" aria-label="Hướng dẫn định dạng Markdown">M↓</button>
        </Tooltip>
      </div>
      {preview ? (
        <div className="ws-note-preview">
          {value.trim() ? <Markdown text={value} onToggle={index => onChange({ ...widget.settings, text: toggleCheck(value, index) })} /> : <State>Chưa có ghi chú</State>}
        </div>
      ) : (
        <textarea aria-label="Nội dung ghi chú" placeholder="Một ý tưởng, một điều cần nhớ…\nDùng **chữ đậm**, # tiêu đề hoặc - [ ] việc cần làm." value={value} maxLength={20_000} onChange={event => onChange({ ...widget.settings, text: event.target.value })} />
      )}
      <div className="ws-widget-note-footer"><span>Ghi chú riêng · hỗ trợ Markdown</span><span>{value.length.toLocaleString('vi-VN')} ký tự</span></div>
    </div>
  );
}

function TasksWidget({ widget, onChange }: Props) {
  const [draft, setDraft] = useState('');
  const [dueAt, setDueAt] = useState('');
  const items: Task[] = Array.isArray(widget.settings.items) ? widget.settings.items.filter((item): item is Task => Boolean(item && typeof item === 'object' && typeof item.id === 'string' && typeof item.text === 'string')).slice(0, 100) : [];
  const done = items.filter(item => item.done).length;
  const save = (next: Task[]) => onChange({ ...widget.settings, items: next });
  return <div className="ws-widget-tasks"><div className="ws-widget-line"><span>{done}/{items.length} hoàn thành</span><span className="ws-widget-pill">{items.length ? Math.round(done / items.length * 100) : 0}%</span></div><div className="ws-widget-progress"><i style={{ width: `${items.length ? done / items.length * 100 : 0}%` }} /></div><form className="ws-widget-task-add" onSubmit={event => { event.preventDefault(); if (draft.trim() && items.length < 100) { save([...items, { id: crypto.randomUUID(), text: draft.trim(), done: false, ...(dueAt ? { dueAt } : {}) }]); setDraft(''); setDueAt(''); } }}><input aria-label="Việc cần làm mới" placeholder="Thêm một việc cần làm…" maxLength={300} value={draft} onChange={event => setDraft(event.target.value)} /><input type="date" aria-label="Ngày của việc riêng" value={dueAt} onChange={event => setDueAt(event.target.value)} /><button aria-label="Thêm việc" type="submit" disabled={!draft.trim() || items.length >= 100}><PlusOutlined /></button></form><div className="ws-widget-task-list">{!items.length && <State>Chưa có việc</State>}{items.map(item => <div key={item.id} className={`ws-widget-task${item.done ? ' done' : ''}`}><label><input type="checkbox" checked={Boolean(item.done)} onChange={event => save(items.map(value => value.id === item.id ? { ...value, done: event.target.checked } : value))} /><span>{item.text}{item.dueAt && <small style={{ display: 'block' }}>{new Date(`${item.dueAt}T12:00:00+07:00`).toLocaleDateString('vi-VN')}</small>}</span></label><button className="ws-widget-icon-btn" type="button" aria-label={`Xóa việc ${item.text}`} onClick={() => save(items.filter(value => value.id !== item.id))}><DeleteOutlined /></button></div>)}</div>{done > 0 && <button className="ws-widget-text-btn" type="button" onClick={() => save(items.filter(item => !item.done))}>Dọn {done} việc đã xong</button>}</div>;
}

function FocusWidget({ widget }: Props) {
  const minutes = bounded(widget.settings.minutes, 25, 1, 180);
  const breakMinutes = bounded(widget.settings.breakMinutes, 5, 1, 60);
  const [mode, setMode] = useState<'focus' | 'break'>('focus');
  const duration = (mode === 'focus' ? minutes : breakMinutes) * 60;
  const [remaining, setRemaining] = useState(duration);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [completed, setCompleted] = useState(false);
  useEffect(() => { setDeadline(null); setRemaining(duration); setCompleted(false); }, [duration, mode]);
  useEffect(() => {
    if (deadline === null) return;
    const tick = () => { const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000)); setRemaining(left); if (left === 0) { setDeadline(null); setCompleted(true); } };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [deadline]);
  return <div className="ws-widget-focus"><div className="ws-widget-segment"><button type="button" className={mode === 'focus' ? 'active' : ''} onClick={() => setMode('focus')}>Tập trung</button><button type="button" className={mode === 'break' ? 'active' : ''} onClick={() => setMode('break')}>Nghỉ ngắn</button></div><div className="ws-widget-focus-ring" style={{ '--ws-ring-progress': `${(1 - remaining / duration) * 360}deg` } as CSSProperties}><div><strong>{String(Math.floor(remaining / 60)).padStart(2, '0')}<span>:</span>{String(remaining % 60).padStart(2, '0')}</strong><span>{completed ? 'Bạn đã hoàn thành!' : mode === 'focus' ? 'Đang tập trung' : 'Nghỉ ngắn'}</span></div></div><div className="ws-widget-focus-actions"><button className="ws-widget-primary" type="button" onClick={() => { if (deadline) { setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000))); setDeadline(null); } else { setCompleted(false); setDeadline(Date.now() + (remaining > 0 ? remaining : duration) * 1000); } }}>{deadline ? <PauseOutlined /> : <PlayCircleOutlined />}{deadline ? 'Tạm dừng' : 'Bắt đầu'}</button><button className="ws-widget-icon-btn" type="button" title="Bắt đầu lại" aria-label="Bắt đầu lại bộ đếm" onClick={() => { setDeadline(null); setRemaining(duration); setCompleted(false); }}><ReloadOutlined /></button></div><span className="ws-widget-live" role="status">{completed ? 'Hết giờ. Hãy dành một chút thời gian nghỉ ngơi.' : 'Bộ đếm hoạt động khi bạn ở không gian này.'}</span></div>;
}

function CalendarWidget({ widget }: Props) {
  const now = useNow(60_000);
  const today = vietnamDateParts(new Date(now));
  const [offset, setOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const showLunar = widget.settings.showLunar !== false;
  const showHolidays = widget.settings.showHolidays !== false;
  // Build every calendar cell at noon in Vietnam, independently of the device timezone.
  const month = new Date(Date.UTC(today.year, today.month - 1 + offset, 1, 5));
  const year = month.getUTCFullYear();
  const monthIndex = month.getUTCMonth();
  const start = (month.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const selected = Math.min(selectedDay ?? (offset === 0 ? today.day : 1), days);
  const selectedDate = new Date(Date.UTC(year, monthIndex, selected, 5));
  const selectedHolidays = showHolidays ? holidaysOn(selectedDate) : [];
  const changeMonth = (amount: number) => { setOffset(value => value + amount); setSelectedDay(null); };
  return (
    <div className={`ws-widget-calendar${showLunar ? ' ws-calendar-lunar' : ''}`}>
      <div className="ws-widget-line"><strong>{month.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' })}</strong><div><button className="ws-widget-icon-btn" type="button" aria-label="Tháng trước" onClick={() => changeMonth(-1)}><LeftOutlined /></button><button className="ws-widget-icon-btn" type="button" aria-label="Tháng sau" onClick={() => changeMonth(1)}><RightOutlined /></button></div></div>
      <div className="ws-widget-calendar-grid">
        {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(day => <span className="ws-widget-weekday" key={day}>{day}</span>)}
        {Array.from({ length: Math.ceil((start + days) / 7) * 7 }, (_, index) => {
          const day = index - start + 1;
          if (day < 1 || day > days) return <span key={index} aria-hidden />;
          const date = new Date(Date.UTC(year, monthIndex, day, 5));
          const lunar = solarToLunar(date);
          const holidays = showHolidays ? holidaysOn(date) : [];
          const current = offset === 0 && day === today.day;
          const label = `${day}/${monthIndex + 1}/${year}${showLunar ? ` · Âm lịch ${lunarLabel(date)}` : ''}${holidays.length ? ` · ${holidays.map(item => item.name).join(', ')}` : ''}`;
          return <Tooltip key={index} title={label}>
            <button type="button" className={`ws-calendar-day${current ? ' today' : ''}${index % 7 >= 5 ? ' weekend' : ''}${selected === day ? ' selected' : ''}${holidays.length ? ' holiday' : ''}`} aria-label={label} aria-current={current ? 'date' : undefined} aria-pressed={selected === day} onClick={() => setSelectedDay(day)}>
              <span>{day}</span>{showLunar && <small>{lunar.day === 1 || day === 1 ? `${lunar.day}/${lunar.month}` : lunar.day}{lunar.leap ? '⁺' : ''}</small>}{holidays.length > 0 && <i aria-hidden />}
            </button>
          </Tooltip>;
        })}
      </div>
      <div className="ws-calendar-detail" aria-live="polite">
        <span>{selected}/{monthIndex + 1}{showLunar ? ` · Âm lịch ${lunarLabel(selectedDate)}` : ''}</span>
        {selectedHolidays.length > 0 && <strong>{selectedHolidays.map(item => item.name).join(' · ')}</strong>}
      </div>
      <button type="button" className="ws-widget-text-btn" onClick={() => { setOffset(0); setSelectedDay(null); }}>Hôm nay · {today.day}/{today.month}/{today.year} · Giờ Việt Nam</button>
    </div>
  );
}

function IocWidget({ widget }: Props) {
  const user = useMe();
  const year = bounded(widget.settings.year, new Date().getFullYear(), 2000, 2200);
  const data = useQuery({ queryKey: ['workspace-ioc', user.id, year], queryFn: ({ signal }) => http.get<Overview>(`/ioc/overview?year=${year}`, signal), refetchInterval: 120_000 });
  const totals = data.data?.totals;
  const chart = useMemo<ChartOption>(() => ({ tooltip: { trigger: 'item', renderMode: 'richText' }, series: [{ type: 'pie', stillShowZeroSum: false, radius: ['72%', '90%'], center: ['50%', '50%'], label: { show: false }, padAngle: 3, itemStyle: { borderRadius: 5 }, data: totals ? [{ name: 'Hoàn thành', value: totals.completed, itemStyle: { color: '#7bddae' } }, { name: 'Đúng tiến độ', value: totals.onTrack, itemStyle: { color: '#7ebaff' } }, { name: 'Có rủi ro', value: totals.atRisk, itemStyle: { color: '#f6cd79' } }, { name: 'Quá hạn', value: totals.overdue, itemStyle: { color: '#f28ea6' } }, { name: 'Chưa bắt đầu', value: totals.notStarted, itemStyle: { color: '#6a728c' } }] : [] }] }), [totals]);
  if (!totals) return <State error={Boolean(data.error)}>{data.error ? <>{errorText(data.error)}<button type="button" className="ws-widget-text-btn" onClick={() => void data.refetch()}>Thử lại</button></> : 'Đang tải số liệu điều hành…'}</State>;
  return <div className="ws-widget-ioc"><div className="ws-widget-line"><span className="ws-widget-live"><i />{data.data?.scope === 'department' ? 'Phạm vi phòng ban' : 'Dữ liệu điều hành'} · {year}</span><Refresh loading={data.isFetching} onClick={() => void data.refetch()} /></div><div className="ws-widget-ioc-main"><div className="ws-widget-ioc-donut"><Chart option={chart} height={158} /><div><strong>{Math.round(totals.progress)}<small>%</small></strong><span>tiến độ chung</span></div></div><div className="ws-widget-ioc-stats"><div><i style={{ background: '#7bddae' }} /><span>Hoàn thành</span><b>{totals.completed}</b></div><div><i style={{ background: '#7ebaff' }} /><span>Đúng tiến độ</span><b>{totals.onTrack}</b></div><div><i style={{ background: '#f6cd79' }} /><span>Có rủi ro</span><b>{totals.atRisk}</b></div><div><i style={{ background: '#f28ea6' }} /><span>Quá hạn</span><b>{totals.overdue}</b></div></div></div><div className="ws-widget-ioc-bottom"><span><b>{totals.targets}</b> chỉ tiêu theo dõi</span><Link to="/admin/dieu-hanh">Mở điều hành <ArrowRightOutlined /></Link></div>{data.error && <small className="ws-widget-error">Làm mới thất bại: {errorText(data.error)}</small>}</div>;
}

function WorkWidget({ widget }: Props) {
  const user = useMe();
  const year = bounded(widget.settings.year, new Date().getFullYear(), 2000, 2200);
  const query = useQuery({ queryKey: ['workspace-work', user.id, year], queryFn: ({ signal }) => http.get<MyWork>(`/my-work?year=${year}`, signal), refetchInterval: 120_000 });
  const data = query.data;
  if (user.role === 'MANAGER') return <DepartmentWorkWidget />;
  if (!data) return <State error={Boolean(query.error)}>{query.error ? <>{errorText(query.error)}<button type="button" className="ws-widget-text-btn" onClick={() => void query.refetch()}>Thử lại</button></> : 'Đang tải việc của bạn…'}</State>;
  return <div className="ws-widget-work"><div className="ws-widget-work-counts"><Link to="/admin/viec-cua-toi"><b>{data.counts.needReport}</b><span>Cần báo cáo</span></Link><Link to="/admin/viec-cua-toi"><b>{data.counts.toReview}</b><span>Chờ duyệt</span></Link><Link to="/admin/viec-cua-toi"><b>{data.counts.explanations}</b><span>Giải trình</span></Link></div><div className="ws-widget-work-list">{data.needReport.slice(0, 3).map(item => <Link key={item.id} to={`/admin/targets/${item.id}`}><span className="ws-widget-work-marker"><ThunderboltOutlined /></span><div><strong>{item.title}</strong><small>{item.currentPeriod}</small></div><RightOutlined /></Link>)}{!data.needReport.length && <State><CheckOutlined /> Bạn không có chỉ tiêu cần báo cáo.</State>}</div><Link className="ws-widget-more" to="/admin/viec-cua-toi">Xem tất cả công việc <ArrowRightOutlined /></Link>{query.error && <small className="ws-widget-error">Làm mới thất bại: {errorText(query.error)}</small>}</div>;
}

function ApiWidget({ widget }: Props) {
  const settings = widget.settings;
  const url = text(settings.url);
  const remote = useRemote(url, bounded(settings.interval, 300, 60, 86_400));
  const selected = readJsonPath(remote.result?.data, text(settings.path));
  const display = text(settings.display, 'line');
  const rows = useMemo(() => apiRows(selected, text(settings.xKey, 'name'), text(settings.yKey, 'value')), [selected, settings.xKey, settings.yKey]);
  const metric = numeric(selected);
  const option = useMemo<ChartOption>(() => {
    const base = { textStyle: { color: '#dce6ff', fontSize: 11 }, color: ['#9b9cff', '#74d5d1', '#f5c97e', '#f394b3', '#84b7f7'], tooltip: { trigger: display === 'pie' ? 'item' : 'axis', renderMode: 'richText' }, grid: { left: 12, right: 12, top: 18, bottom: 10, containLabel: true } };
    if (display === 'pie') return { ...base, series: [{ type: 'pie', radius: ['48%', '78%'], data: rows, label: { color: '#dce6ff', fontSize: 10, formatter: '{b}', width: 90, overflow: 'truncate' } }] };
    return { ...base, xAxis: { type: 'category', data: rows.map(row => row.name), axisLine: { lineStyle: { color: '#ffffff20' } }, axisTick: { show: false }, axisLabel: { color: '#b6c0d9', hideOverlap: true, width: 65, overflow: 'truncate' } }, yAxis: { type: 'value', axisLabel: { color: '#b6c0d9' }, splitLine: { lineStyle: { color: '#ffffff0d' } } }, series: [{ type: display === 'bar' ? 'bar' : 'line', data: rows.map(row => row.value), smooth: true, showSymbol: rows.length < 15, symbolSize: 6, lineStyle: { width: 3 }, itemStyle: { borderRadius: [4, 4, 0, 0] }, areaStyle: display === 'line' ? { color: '#9b9cff', opacity: 0.13 } : undefined, barMaxWidth: 32 }] };
  }, [rows, display]);
  if (!url) return <State><span className="ws-widget-empty-icon"><ArrowRightOutlined /></span><strong>Chưa cấu hình</strong></State>;
  return <div className="ws-widget-api"><div className="ws-widget-line"><span className="ws-widget-live"><i />{remote.result ? `Cập nhật ${new Date(remote.result.fetchedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : 'Kết nối dữ liệu ngoài'}</span><Refresh loading={remote.loading} onClick={remote.refresh} /></div>{remote.error && <State error>{remote.error}</State>}{remote.loading && !remote.result && <State>Đang kết nối nguồn dữ liệu…</State>}{remote.result && (selected === undefined ? <State error>Không tìm thấy đường dẫn “{text(settings.path)}”. Kiểm tra cài đặt đường dẫn JSON.</State> : display === 'metric' ? metric === null ? <State error>Giá trị đã chọn không phải một con số.</State> : <div className="ws-widget-api-metric"><strong>{format(metric)}</strong><span>{text(settings.unit)}</span></div> : display === 'table' ? <div className="ws-widget-api-table"><table><thead><tr><th>{text(settings.xKey, 'Nhãn')}</th><th>{text(settings.unit, 'Giá trị')}</th></tr></thead><tbody>{rows.slice(0, 50).map((row, index) => <tr key={index}><td>{row.name}</td><td>{format(row.value)}</td></tr>)}</tbody></table>{!rows.length && <State>Không tìm thấy các dòng dữ liệu số.</State>}</div> : rows.length ? <Chart option={option} height={Math.max(150, Math.min(300, widget.h * 60 - 130))} /> : <State error>Không tìm thấy chuỗi số. Kiểm tra đường dẫn, khóa nhãn và khóa giá trị.</State>)}<div className="ws-widget-api-footer"><a href={validHttps(url) || undefined} target="_blank" rel="noopener noreferrer">{(() => { try { return new URL(url).hostname; } catch { return 'Nguồn API'; } })()} ↗</a><span>{text(settings.unit)}</span></div>{url.startsWith('https://api.open-meteo.com/') && <a href="https://open-meteo.com/" className="ws-widget-source" target="_blank" rel="noopener noreferrer">Dữ liệu dự báo: Open-Meteo</a>}</div>;
}

function EmbedWidget({ widget }: Props) {
  const url = validHttps(text(widget.settings.url));
  if (!url) return <State><strong>Chưa cấu hình</strong><span>Nhập địa chỉ HTTPS trong cài đặt.</span></State>;
  return <div className="ws-widget-embed"><iframe src={url} title={widget.title} loading="lazy" sandbox="allow-scripts" referrerPolicy="no-referrer" /><div><span>Một số trang không cho phép nhúng hoặc yêu cầu đăng nhập.</span><a href={url} target="_blank" rel="noopener noreferrer">Mở trang ↗</a></div></div>;
}

function CalculatorWidget() {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [answer, setAnswer] = useState<number | null>(null);
  const solve = useCallback(() => { try { setAnswer(calculateExpression(input)); setError(''); } catch (cause) { setError(errorText(cause)); } }, [input]);
  const keys = ['C', '(', ')', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '⌫', '0', '.', '='];
  return <div className="ws-widget-calculator"><form onSubmit={event => { event.preventDefault(); solve(); }}><input aria-label="Biểu thức cần tính" placeholder="0" maxLength={160} value={input} onChange={event => { setInput(event.target.value); setError(''); }} /><div aria-live="polite">{error || (answer === null ? 'Nhập phép tính, nhấn Enter' : `= ${format(answer)}`)}</div></form><div className="ws-widget-calculator-keys">{keys.map(key => <button type="button" className={key === '=' ? 'equals' : ['÷', '×', '−', '+'].includes(key) ? 'operator' : ''} key={key} onClick={() => { if (key === '=') solve(); else if (key === 'C') { setInput(''); setAnswer(null); setError(''); } else if (key === '⌫') setInput(value => value.slice(0, -1)); else setInput(value => (value + (key === '−' ? '-' : key)).slice(0, 160)); }}>{key}</button>)}</div></div>;
}

function CountdownWidget({ widget }: Props) {
  const now = useNow();
  const target = new Date(text(widget.settings.date)).getTime();
  if (!Number.isFinite(target)) return <State><span className="ws-widget-empty-icon"><ReloadOutlined /></span><strong>Chưa cấu hình</strong><span>Chọn ngày và giờ trong cài đặt tiện ích.</span></State>;
  const remaining = Math.max(0, Math.floor((target - now) / 1000));
  const values = [Math.floor(remaining / 86400), Math.floor(remaining / 3600) % 24, Math.floor(remaining / 60) % 60, remaining % 60];
  return <div className="ws-widget-countdown"><span className="ws-widget-eyebrow">{remaining ? 'THỜI GIAN CÒN LẠI' : 'ĐÃ ĐẾN THỜI ĐIỂM'}</span><strong>{text(widget.settings.label, 'Sự kiện của bạn')}</strong><div>{values.map((value, index) => <span key={index}><b>{String(value).padStart(2, '0')}</b><small>{['ngày', 'giờ', 'phút', 'giây'][index]}</small></span>)}</div><p>{new Date(target).toLocaleString('vi-VN', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p></div>;
}

export function WorkspaceWidgetBody(props: Props) {
  switch (props.widget.type) {
    case 'my-targets': return <MyTargetsWidget />;
    case 'target-chart': return <TargetChartWidget {...props} />;
    case 'alerts': case 'departments': case 'activity': return <OverviewWidget kind={props.widget.type} />;
    case 'approvals': return <ApprovalWidget />;
    case 'proposals': return <ProposalsWidget />;
    case 'feedback': return <FeedbackWidget />;
    case 'documents': return <DocumentsWidget />;
    case 'pins': return <PinsWidget {...props} />;
    case 'sent-notes': return <SentNotesWidget />;
    case 'agenda': return <DeskCalendarWidget />;
    case 'clock': return <ClockWidget {...props} />;
    case 'weather': return <WeatherWidget {...props} />;
    case 'notes': return <NotesWidget {...props} />;
    case 'tasks': return <TasksWidget {...props} />;
    case 'focus': return <FocusWidget {...props} />;
    case 'calendar': return <CalendarWidget {...props} />;
    case 'ioc': return <IocWidget {...props} />;
    case 'work': return <WorkWidget {...props} />;
    case 'api': return <ApiWidget {...props} />;
    case 'embed': return <EmbedWidget {...props} />;
    case 'calculator': return <CalculatorWidget />;
    case 'countdown': return <CountdownWidget {...props} />;
    default: return <State>Tiện ích chưa được hỗ trợ.</State>;
  }
}

function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return <label className="ws-settings-field"><span>{label}</span>{children}{help && <small>{help}</small>}</label>;
}

/** Validate before the parent applies a draft, so an invalid URL cannot block autosave. */
export function widgetSettingsError(widget: WorkspaceWidget): string | null {
  if (widget.type === 'api' || widget.type === 'embed') {
    const url = text(widget.settings.url);
    if (url && (url.length > 2048 || /[\u0000-\u0020\\]/.test(url) || !validHttps(url))) return 'Hãy nhập URL HTTPS hợp lệ, không chứa khoảng trắng hoặc thông tin đăng nhập.';
  }
  if (widget.type === 'countdown' && text(widget.settings.date) && !Number.isFinite(new Date(text(widget.settings.date)).getTime())) return 'Hãy chọn ngày và giờ hợp lệ cho cột mốc.';
  return null;
}

export function WidgetSettings({ widget, onChange }: Props) {
  const settings = widget.settings;
  const patch = (value: Record<string, unknown>) => onChange({ ...settings, ...value });
  const input = (key: string, fallback = '', placeholder = '') => <input value={text(settings[key], fallback)} placeholder={placeholder} maxLength={key === 'url' ? 2048 : 300} onChange={event => patch({ [key]: event.target.value })} />;
  const numericInput = (key: string, fallback: number, min: number, max: number, step = 1) => <input type="number" min={min} max={max} step={step} value={number(settings[key], fallback)} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value)) patch({ [key]: Math.max(min, Math.min(max, value)) }); }} />;
  let fields: ReactNode;
  switch (widget.type) {
    case 'clock': fields = <><Field label="Múi giờ"><select value={text(settings.timezone, 'Asia/Ho_Chi_Minh')} onChange={event => patch({ timezone: event.target.value })}>{[['Asia/Ho_Chi_Minh', 'Việt Nam'], ['Asia/Tokyo', 'Tokyo'], ['Asia/Singapore', 'Singapore'], ['Asia/Shanghai', 'Bắc Kinh'], ['Europe/London', 'London'], ['Europe/Paris', 'Paris'], ['America/New_York', 'New York'], ['America/Los_Angeles', 'Los Angeles'], ['Australia/Sydney', 'Sydney'], ['UTC', 'UTC']].map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></Field><label className="ws-settings-check"><input type="checkbox" checked={Boolean(settings.hour12)} onChange={event => patch({ hour12: event.target.checked })} />Định dạng 12 giờ</label></>; break;
    case 'weather': fields = <><Field label="Tên địa điểm">{input('city', 'Lái Thiêu')}</Field><div className="ws-settings-two"><Field label="Vĩ độ">{numericInput('latitude', 10.905, -90, 90, 0.001)}</Field><Field label="Kinh độ">{numericInput('longitude', 106.699, -180, 180, 0.001)}</Field></div><p className="ws-settings-hint">Dự báo thực tế từ Open-Meteo, làm mới mỗi 15 phút.</p><div className="ws-settings-presets">{[{ city: 'Lái Thiêu', latitude: 10.905, longitude: 106.699 }, { city: 'TP. Hồ Chí Minh', latitude: 10.823, longitude: 106.63 }, { city: 'Hà Nội', latitude: 21.028, longitude: 105.834 }, { city: 'Đà Nẵng', latitude: 16.054, longitude: 108.202 }].map(city => <button type="button" key={city.city} onClick={() => patch(city)}>{city.city}</button>)}</div></>; break;
    case 'focus': fields = <div className="ws-settings-two"><Field label="Thời gian tập trung (phút)">{numericInput('minutes', 25, 1, 180)}</Field><Field label="Nghỉ ngắn (phút)">{numericInput('breakMinutes', 5, 1, 60)}</Field></div>; break;
    case 'ioc': case 'work': fields = <><Field label="Năm theo dõi">{numericInput('year', new Date().getFullYear(), 2000, 2200)}</Field><p className="ws-settings-hint">Số liệu được lấy từ IOC theo đúng quyền truy cập của tài khoản và làm mới mỗi 2 phút.</p></>; break;
    case 'api': fields = <><button type="button" className="ws-settings-preset-button" onClick={() => patch({ url: PUBLIC_FORECAST, path: 'hourly', xKey: 'time', yKey: 'temperature_2m', display: 'line', unit: '°C', interval: 900 })}><PlusOutlined /> Dùng mẫu: Nhiệt độ Lái Thiêu trong ngày</button><Field label="Địa chỉ API JSON (HTTPS)" help="API công khai, phương thức GET. Không nhập khóa bí mật hoặc mã truy cập vào URL.">{input('url', '', 'https://api.example.com/data')}</Field><Field label="Kiểu hiển thị"><select value={text(settings.display, 'line')} onChange={event => patch({ display: event.target.value })}>{[['line', 'Biểu đồ đường'], ['bar', 'Biểu đồ cột'], ['pie', 'Biểu đồ tròn'], ['metric', 'Một chỉ số'], ['table', 'Bảng số liệu']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="Đường dẫn dữ liệu" help="Ví dụ: data.items, hourly hoặc current.temperature_2m. Để trống để lấy toàn bộ JSON.">{input('path', '', 'data.items')}</Field>{settings.display !== 'metric' && <div className="ws-settings-two"><Field label="Khóa nhãn / trục X" help="Tên trường của từng dòng hoặc mảng nhãn.">{input('xKey', 'name')}</Field><Field label="Khóa số / trục Y" help="Tên trường số của từng dòng hoặc mảng số.">{input('yKey', 'value')}</Field></div>}<div className="ws-settings-two"><Field label="Đơn vị">{input('unit', '', '%, người, °C…')}</Field><Field label="Làm mới sau (giây)">{numericInput('interval', 300, 60, 86400)}</Field></div><p className="ws-settings-hint">Hỗ trợ mảng đối tượng, hai mảng song song hoặc đối tượng chứa số. Biểu đồ dùng tối đa 240 điểm; bảng hiển thị 50 dòng. Dữ liệu chỉ làm mới khi mở không gian này.</p></>; break;
    case 'embed': fields = <><Field label="Địa chỉ trang web (HTTPS)">{input('url', '', 'https://example.com')}</Field><p className="ws-settings-hint">Trang được nhúng trong khung cô lập, hỗ trợ tiện ích tương tác. Một số website chặn nhúng hoặc yêu cầu đăng nhập; bạn có thể mở bằng liên kết bên dưới tiện ích.</p></>; break;
    case 'countdown': fields = <><Field label="Tên sự kiện">{input('label', '', 'Một cột mốc đáng chờ đợi')}</Field><Field label="Ngày và giờ"><input type="datetime-local" value={text(settings.date).slice(0, 16)} onChange={event => patch({ date: event.target.value })} /></Field><p className="ws-settings-hint">Thời gian sử dụng múi giờ trên thiết bị của bạn.</p></>; break;
    case 'notes': fields = <p className="ws-settings-hint">Viết trực tiếp rồi chọn Xem trước để đọc ghi chú đã định dạng. Dùng # cho tiêu đề, **chữ đậm**, _chữ nghiêng_, - [ ] cho việc cần làm và [tên](https://...) cho liên kết. Có thể đánh dấu việc ngay trong bản xem trước. Nội dung được lưu riêng theo tài khoản.</p>; break;
    case 'tasks': fields = <p className="ws-settings-hint">Thêm, đánh dấu hoàn tất và dọn việc ngay trên tiện ích. Đây là danh sách riêng của bạn, tối đa 100 việc.</p>; break;
    case 'calendar': fields = <><label className="ws-settings-check"><input type="checkbox" checked={settings.showLunar !== false} onChange={event => patch({ showLunar: event.target.checked })} />Hiện âm lịch Việt Nam</label><label className="ws-settings-check"><input type="checkbox" checked={settings.showHolidays !== false} onChange={event => patch({ showHolidays: event.target.checked })} />Đánh dấu ngày lễ, ngày kỷ niệm</label><p className="ws-settings-hint">Chọn một ngày để xem âm lịch và ngày lễ. Lịch dùng múi giờ Việt Nam (UTC+7); dấu ⁺ chỉ tháng âm lịch nhuận. Các mốc kỷ niệm không thay thế lịch nghỉ và nghỉ bù được công bố hằng năm.</p></>; break;
    case 'my-targets': case 'target-chart': case 'alerts': case 'approvals': case 'departments': case 'feedback': case 'documents': case 'activity': case 'sent-notes': case 'agenda': case 'pins': case 'proposals': fields = <p className="ws-settings-hint">Dữ liệu theo quyền tài khoản, tự làm mới mỗi phút.</p>; break;
    case 'calculator': fields = <p className="ws-settings-hint">Hỗ trợ cộng, trừ, nhân, chia, ngoặc và phần trăm. Có thể nhập bằng bàn phím và nhấn Enter để tính.</p>; break;
  }
  return <div className="ws-widget-settings">{fields}</div>;
}
