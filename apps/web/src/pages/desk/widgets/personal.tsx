import {
  BellOutlined,
  CaretRightOutlined,
  CheckCircleFilled,
  CheckOutlined,
  CheckSquareOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  FireOutlined,
  FlagOutlined,
  HourglassOutlined,
  LeftOutlined,
  PauseOutlined,
  PlusOutlined,
  RedoOutlined,
  RightOutlined,
  SettingOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { App, Button, DatePicker, Input, Popover, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMe } from '@/app/session';
import { Markdown } from '@/components/Markdown';
import { useApi } from '@/hooks/useApi';
import { date, dateTime, num, vn } from '@/lib/format';
import { holidaysOn } from '@/lib/holidays';
import { lunarLabel, solarToLunar, vietnamDateParts } from '@/lib/lunar';
import { toggleCheck } from '@/lib/markdown';
import type { MyWork } from '@/types/domain';
import { timezoneLabel } from '../fields/editors';
import { useDesk } from '../useDesk';
import { WidgetSkeleton } from '../WidgetFrame';
import { useSettings, useWidget } from './context';
import { Note } from './parts';
import {
  countdownParts,
  dateLine,
  dueReminders,
  FOCUS_IDLE,
  focusPause,
  focusStart,
  focusTick,
  greetingFor,
  mergeTodos,
  monthGrid,
  noonOf,
  reminderKey,
  weekdayName,
  type FocusState,
  type TodoItem,
} from './personal-logic';
import { useDepartmentData } from './useDepartmentData';
import { useNow } from './useNow';
import { useWidgetState } from './useWidgetState';

// Widget cá nhân: lời chào, đồng hồ, lịch âm dương, sổ ghi chú, việc riêng, đếm ngược, tập trung. Ghi chú và việc riêng
// lưu ở máy chủ (theo widget), đồng hồ tập trung giữ tiến trình trên máy để tải lại trang không mất.

const pad = (value: number) => String(value).padStart(2, '0');

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // bộ nhớ đầy hoặc bị chặn
  }
}

/* ───────────── Lời chào ───────────── */

function openNotifications() {
  document.querySelector<HTMLButtonElement>('button[aria-label="Thông báo"]')?.click();
}

function HeroStats() {
  const work = useApi<MyWork>('/my-work', { refetchInterval: 120_000 });
  const unread = useApi<{ unreadCount: number }>('/notifications/count', { refetchInterval: 60_000 });
  const department = useDepartmentData();
  const counts = work.data?.counts;
  const pending = counts ? counts.needReport + counts.rejectedReports + counts.toReview + counts.explanations + counts.proposals : 0;
  const alerts = department.data?.alerts ?? [];
  const critical = alerts.filter(alert => alert.severity === 'critical').length;
  const unreadCount = unread.data?.unreadCount ?? 0;
  if (!work.data && !unread.data) return null;
  const chips = [
    pending > 0 && (
      <Link key="work" to="/admin/viec-cua-toi" className="ph-chip">
        <CheckSquareOutlined /> {num(pending)} việc cần xử lý
      </Link>
    ),
    alerts.length > 0 && (
      <Link key="alerts" to="/admin/dieu-hanh" className={`ph-chip${critical ? ' bad' : ''}`}>
        <WarningOutlined /> {critical ? `${num(critical)} cảnh báo nghiêm trọng` : `${num(alerts.length)} cảnh báo`}
      </Link>
    ),
    unreadCount > 0 && (
      <button key="unread" type="button" className="ph-chip" onClick={openNotifications}>
        <BellOutlined /> {num(unreadCount)} thông báo mới
      </button>
    ),
  ].filter(Boolean);
  return (
    <div className="ph-chips">
      {chips.length ? (
        chips
      ) : (
        <span className="ph-chip calm">
          <CheckOutlined /> Không có việc tồn đọng
        </span>
      )}
    </div>
  );
}

export function Hero() {
  const user = useMe();
  const desk = useDesk();
  const { showStats = true } = useSettings<{ showStats: boolean }>();
  const now = useNow(true);
  const greeting = desk.profile?.config.greeting;
  const name = greeting?.name || user.fullName;
  const holidays = greeting?.holidays === false ? [] : holidaysOn(now);
  return (
    <div className="ph-hero">
      <div className="ph-hero-text">
        <h2>
          {greetingFor(now)}, {name}
        </h2>
        <p>
          <span>{dateLine(now, greeting?.lunar !== false)}</span>
          {holidays.map(holiday => (
            <span key={holiday.name} className={`ph-holiday${holiday.official ? ' official' : ''}`}>
              <FlagOutlined /> {holiday.name}
            </span>
          ))}
        </p>
      </div>
      {showStats && <HeroStats />}
    </div>
  );
}

/* ───────────── Đồng hồ ───────────── */

function vnClock(now: Date) {
  const shifted = new Date(now.getTime() + 7 * 3_600_000);
  return { hours: shifted.getUTCHours(), minutes: shifted.getUTCMinutes(), seconds: shifted.getUTCSeconds() };
}

/** Giờ ở múi khác và chênh lệch so với giờ Việt Nam. */
function zoneTime(zone: string, now: Date) {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
        .formatToParts(now)
        .map(part => [part.type, part.value]),
    );
    const local = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    const offset = Math.round(((local - now.getTime()) / 3_600_000 - 7) * 4) / 4;
    return { text: `${pad(Number(parts.hour))}:${parts.minute}`, offset };
  } catch {
    return null;
  }
}

function AnalogFace({ hours, minutes, seconds, showSeconds }: { hours: number; minutes: number; seconds: number; showSeconds: boolean }) {
  const hourAngle = ((hours % 12) + minutes / 60) * 30;
  const minuteAngle = (minutes + seconds / 60) * 6;
  return (
    <svg viewBox="0 0 100 100" className="ph-face" role="img" aria-label={`${pad(hours)} giờ ${pad(minutes)} phút`}>
      <circle cx="50" cy="50" r="48" className="ph-face-bg" />
      {Array.from({ length: 60 }, (_, index) => (
        <line key={index} x1="50" y1={index % 5 ? 6.5 : 5} x2="50" y2={index % 5 ? 8.5 : 11} className={index % 5 ? 'minor' : 'major'} transform={`rotate(${index * 6} 50 50)`} />
      ))}
      <line x1="50" y1="54" x2="50" y2="27" className="hand hour" transform={`rotate(${hourAngle} 50 50)`} />
      <line x1="50" y1="56" x2="50" y2="15" className="hand minute" transform={`rotate(${minuteAngle} 50 50)`} />
      {showSeconds && (
        <g transform={`rotate(${seconds * 6} 50 50)`} className="second">
          <line x1="50" y1="61" x2="50" y2="12" />
          <circle cx="50" cy="61" r="1.6" />
        </g>
      )}
      <circle cx="50" cy="50" r="2.6" className="pin" />
    </svg>
  );
}

export function Clock() {
  const { style = 'analog', seconds: showSeconds = true, showDate = true, lunar = true, timezones = [] } = useSettings<{
    style: 'analog' | 'digital';
    seconds: boolean;
    showDate: boolean;
    lunar: boolean;
    timezones: string[];
  }>();
  const now = useNow(!showSeconds && style === 'digital');
  const { hours, minutes, seconds } = vnClock(now);
  const day = vietnamDateParts(now);
  return (
    <div className={`ph-clock ${style}`}>
      {style === 'analog' ? (
        <AnalogFace hours={hours} minutes={minutes} seconds={seconds} showSeconds={showSeconds} />
      ) : (
        <span className="ph-digital">
          <b>
            {pad(hours)}:{pad(minutes)}
          </b>
          {showSeconds && <small>:{pad(seconds)}</small>}
        </span>
      )}
      {(showDate || lunar || timezones.length > 0) && (
        <div className="ph-clock-side">
          {showDate && (
            <span className="ph-clock-date">
              {weekdayName(now)}, {pad(day.day)}/{pad(day.month)}
            </span>
          )}
          {lunar && <span className="ph-clock-lunar">Âm lịch {lunarLabel(now)}</span>}
          {timezones.map(zone => {
            const time = zoneTime(zone, now);
            if (!time) return null;
            return (
              <span key={zone} className="ph-zone">
                <span>{timezoneLabel(zone)}</span>
                <b>{time.text}</b>
                <small>{time.offset === 0 ? 'cùng giờ' : `${time.offset > 0 ? '+' : '−'}${num(Math.abs(time.offset))} giờ`}</small>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ───────────── Lịch âm dương ───────────── */

const WEEK_HEAD = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const dayKey = (cell: { year: number; month: number; day: number }) => `${cell.year}-${cell.month}-${cell.day}`;

export function CalendarWidget() {
  const { lunar = true, holidays: showHolidays = true, deadlines: showDeadlines = true } = useSettings<{ lunar: boolean; holidays: boolean; deadlines: boolean }>();
  const now = useNow(true);
  const today = vietnamDateParts(now);
  const [view, setView] = useState({ year: today.year, month: today.month });
  const [selected, setSelected] = useState({ year: today.year, month: today.month, day: today.day });
  const department = useDepartmentData(showDeadlines);

  const byDay = useMemo(() => {
    const map = new Map<string, { title: string; link: string; overdue: boolean }[]>();
    for (const item of department.data?.deadlines ?? []) {
      const parts = vietnamDateParts(new Date(item.at));
      const key = dayKey(parts);
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return map;
  }, [department.data]);

  const cells = useMemo(
    () =>
      monthGrid(view.year, view.month).map(cell => {
        const noon = noonOf(cell);
        const moon = solarToLunar(noon);
        return { ...cell, lunar: moon, holidays: holidaysOn(noon), weekday: (noon.getUTCDay() + 6) % 7 };
      }),
    [view],
  );

  const shift = (step: number) =>
    setView(current => {
      const index = current.year * 12 + current.month - 1 + step;
      return { year: Math.floor(index / 12), month: (index % 12) + 1 };
    });
  const onToday = view.year === today.year && view.month === today.month;
  const chosen = cells.find(cell => cell.inMonth && dayKey(cell) === dayKey(selected)) ?? cells.find(cell => dayKey(cell) === dayKey(selected));
  const chosenDeadlines = byDay.get(dayKey(selected)) ?? [];

  return (
    <div className="ph-cal">
      <div className="ph-cal-head">
        <button type="button" className="ph-icon-btn" onClick={() => shift(-1)} aria-label="Tháng trước">
          <LeftOutlined />
        </button>
        <span className="ph-cal-title">
          Tháng {view.month}/{view.year}
        </span>
        <button type="button" className="ph-icon-btn" onClick={() => shift(1)} aria-label="Tháng sau">
          <RightOutlined />
        </button>
        {!onToday && (
          <button
            type="button"
            className="ph-link-btn"
            onClick={() => {
              setView({ year: today.year, month: today.month });
              setSelected({ year: today.year, month: today.month, day: today.day });
            }}
          >
            Hôm nay
          </button>
        )}
      </div>
      <div className="ph-cal-grid" role="grid" aria-label={`Lịch tháng ${view.month}/${view.year}`}>
        {WEEK_HEAD.map(label => (
          <span key={label} className={`ph-cal-wd${label === 'CN' ? ' sun' : ''}`} role="columnheader">
            {label}
          </span>
        ))}
        {cells.map(cell => {
          const key = dayKey(cell);
          const isToday = cell.year === today.year && cell.month === today.month && cell.day === today.day;
          const holiday = showHolidays ? cell.holidays : [];
          const due = showDeadlines ? byDay.get(key) : undefined;
          const lunarText = cell.lunar.day === 1 ? `${cell.lunar.day}/${cell.lunar.month}${cell.lunar.leap ? 'N' : ''}` : String(cell.lunar.day);
          return (
            <button
              key={key}
              type="button"
              role="gridcell"
              className={[
                'ph-cal-day',
                cell.inMonth ? '' : 'out',
                isToday ? 'today' : '',
                key === dayKey(selected) ? 'selected' : '',
                cell.weekday === 6 ? 'sun' : '',
                holiday.some(item => item.official) ? 'off' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => setSelected({ year: cell.year, month: cell.month, day: cell.day })}
              aria-label={`${cell.day}/${cell.month}/${cell.year}${holiday.length ? `, ${holiday.map(item => item.name).join(', ')}` : ''}${due?.length ? `, ${due.length} hạn` : ''}`}
            >
              <span className="d">{cell.day}</span>
              {lunar && <span className={`l${cell.lunar.day === 1 || cell.lunar.day === 15 ? ' strong' : ''}`}>{lunarText}</span>}
              {(holiday.length > 0 || (due?.length ?? 0) > 0) && (
                <span className="dots">
                  {holiday.length > 0 && <i className={`h${holiday.some(item => item.official) ? ' off' : ''}`} />}
                  {(due?.length ?? 0) > 0 && <i className={`t${due!.some(item => item.overdue) ? ' late' : ''}`} />}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {chosen && (
        <div className="ph-cal-detail">
          <span className="ph-cal-detail-date">
            {weekdayName(noonOf(chosen))} {pad(chosen.day)}/{pad(chosen.month)} · âm lịch {lunarLabel(noonOf(chosen))}
          </span>
          {(showHolidays ? chosen.holidays : []).map(holiday => (
            <span key={holiday.name} className={`ph-cal-tag${holiday.official ? ' off' : ''}`}>
              {holiday.name}
              {holiday.official ? ' (nghỉ lễ)' : ''}
            </span>
          ))}
          {showDeadlines &&
            chosenDeadlines.slice(0, 3).map((item, index) => (
              <Link key={index} to={item.link} className={`ph-cal-tag due${item.overdue ? ' late' : ''}`} title={item.title}>
                {item.title}
              </Link>
            ))}
          {showDeadlines && chosenDeadlines.length > 3 && <span className="ph-cal-tag">+{chosenDeadlines.length - 3} hạn khác</span>}
        </div>
      )}
    </div>
  );
}

/* ───────────── Sổ ghi chú ───────────── */

const NOTE_MAX = 16_000;
const keepTyping = <T,>(local: T) => local;

export function Notepad() {
  const { widget } = useWidget();
  const { state, setState, status, error } = useWidgetState<{ text: string }>(widget.id, { text: '' }, keepTyping);
  const [editing, setEditing] = useState(false);
  const text = state.text ?? '';
  if (status === 'loading') return <WidgetSkeleton />;

  const startEditing = (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('a, button')) return;
    setEditing(true);
  };
  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape' || (event.key === 'Enter' && (event.ctrlKey || event.metaKey))) (event.target as HTMLTextAreaElement).blur();
  };

  return (
    <div className={`ph-note${editing || !text ? ' editing' : ''}`}>
      {editing || !text ? (
        <Input.TextArea
          className="ph-note-input"
          variant="borderless"
          autoFocus={editing}
          value={text}
          maxLength={NOTE_MAX}
          placeholder={'Ghi nhanh… \n**đậm**, *nghiêng*, - [ ] việc cần làm, [liên kết](https://…)'}
          onChange={event => setState({ text: event.target.value })}
          onFocus={() => setEditing(true)}
          onBlur={() => setEditing(false)}
          onKeyDown={onKey}
          aria-label="Nội dung ghi chú"
        />
      ) : (
        <div
          className="ph-note-view"
          role="button"
          tabIndex={0}
          aria-label="Bấm để sửa ghi chú"
          onClick={startEditing}
          onKeyDown={event => {
            if (event.key === 'Enter' && event.target === event.currentTarget) setEditing(true);
          }}
        >
          <Markdown text={text} onToggle={index => setState(previous => ({ text: toggleCheck(previous.text ?? '', index) }))} />
        </div>
      )}
      <span className={`ph-note-status${status === 'error' ? ' error' : ''}`} aria-live="polite">
        {status === 'saving' ? 'Đang lưu…' : status === 'error' ? error : text ? 'Đã lưu' : ''}
      </span>
    </div>
  );
}

/* ───────────── Việc riêng ───────────── */

const TODO_MAX = 200;
const newTodoId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function TodoMenu({ item, onChange, onRemove }: { item: TodoItem; onChange: (patch: Partial<TodoItem>) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="bottomRight"
      content={
        <div className="ph-todo-menu">
          <label>
            <span>Hạn</span>
            <DatePicker size="small" format="DD/MM/YYYY" value={item.dueAt ? dayjs(item.dueAt) : null} onChange={value => onChange({ dueAt: value ? value.endOf('day').toISOString() : null })} />
          </label>
          <label>
            <span>Nhắc lúc</span>
            <DatePicker
              size="small"
              showTime={{ format: 'HH:mm' }}
              format="DD/MM HH:mm"
              value={item.remindAt ? dayjs(item.remindAt) : null}
              onChange={value => onChange({ remindAt: value ? value.second(0).toISOString() : null })}
            />
          </label>
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => {
              setOpen(false);
              onRemove();
            }}
          >
            Xoá việc
          </Button>
        </div>
      }
    >
      <button type="button" className="ph-icon-btn ph-todo-more" aria-label="Hạn, nhắc giờ, xoá">
        <SettingOutlined />
      </button>
    </Popover>
  );
}

function TodoRow({ item, onChange, onRemove }: { item: TodoItem; onChange: (patch: Partial<TodoItem>) => void; onRemove: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);
  const overdue = !item.done && item.dueAt && new Date(item.dueAt).getTime() < Date.now();
  const commit = () => {
    setEditing(false);
    const value = draft.trim();
    if (value && value !== item.text) onChange({ text: value.slice(0, 300) });
    else setDraft(item.text);
  };
  return (
    <div className={`ph-todo-row${item.done ? ' done' : ''}`}>
      <button type="button" className="ph-check" aria-pressed={item.done} aria-label={item.done ? 'Bỏ đánh dấu xong' : 'Đánh dấu xong'} onClick={() => onChange({ done: !item.done })}>
        {item.done && <CheckOutlined />}
      </button>
      <div className="ph-todo-main">
        {editing ? (
          <Input
            size="small"
            autoFocus
            value={draft}
            maxLength={300}
            onChange={event => setDraft(event.target.value)}
            onBlur={commit}
            onPressEnter={commit}
            onKeyDown={event => {
              if (event.key === 'Escape') {
                setDraft(item.text);
                setEditing(false);
              }
            }}
          />
        ) : (
          <span
            className="ph-todo-text"
            role="button"
            tabIndex={0}
            onClick={() => {
              setDraft(item.text);
              setEditing(true);
            }}
            onKeyDown={event => event.key === 'Enter' && setEditing(true)}
          >
            {item.text}
          </span>
        )}
        {(item.dueAt || item.remindAt) && (
          <span className="ph-todo-meta">
            {item.dueAt && <span className={overdue ? 'late' : undefined}>Hạn {date(item.dueAt)}</span>}
            {item.remindAt && !item.done && (
              <Tooltip title={`Nhắc lúc ${dateTime(item.remindAt)}`}>
                <span>
                  <BellOutlined /> {vn(item.remindAt).format('HH:mm DD/MM')}
                </span>
              </Tooltip>
            )}
          </span>
        )}
      </div>
      <TodoMenu item={item} onChange={onChange} onRemove={onRemove} />
    </div>
  );
}

/** Nhắc việc khi bàn làm việc đang mở; mỗi lần nhắc chỉ báo một lần (ghi nhớ trên máy). */
function useTodoReminders(widgetId: string, items: TodoItem[], markDone: (id: string) => void) {
  const { notification } = App.useApp();
  const now = useNow(true);
  const markRef = useRef(markDone);
  markRef.current = markDone;
  useEffect(() => {
    const key = `ioc_todo_notified_v1:${widgetId}`;
    const notified = new Set(readLocal<string[]>(key, []));
    const due = dueReminders(items, now, notified);
    if (!due.length) return;
    for (const entry of due) {
      const id = reminderKey(entry);
      notified.add(id);
      notification.info({
        key: id,
        title: 'Nhắc việc',
        description: entry.text,
        icon: <BellOutlined />,
        duration: false,
        actions: (
          <Button
            size="small"
            type="primary"
            onClick={() => {
              markRef.current(entry.id);
              notification.destroy(id);
            }}
          >
            Đã xong
          </Button>
        ),
      });
    }
    writeLocal(key, [...notified].slice(-200));
  }, [widgetId, items, now, notification]);
}

export function Todo() {
  const { widget } = useWidget();
  const { message } = App.useApp();
  const { showDone = true } = useSettings<{ showDone: boolean }>();
  const removed = useRef(new Set<string>());
  const merge = useCallback((local: { items: TodoItem[] }, remote: { items: TodoItem[] }) => ({ items: mergeTodos(local.items ?? [], remote.items ?? [], removed.current) }), []);
  const { state, setState, status } = useWidgetState<{ items: TodoItem[] }>(widget.id, { items: [] }, merge);
  const items = state.items ?? [];
  const [text, setText] = useState('');

  const change = useCallback((id: string, patch: Partial<TodoItem>) => setState(previous => ({ items: previous.items.map(entry => (entry.id === id ? { ...entry, ...patch } : entry)) })), [setState]);
  const remove = (id: string) => {
    removed.current.add(id);
    setState(previous => ({ items: previous.items.filter(entry => entry.id !== id) }));
  };
  useTodoReminders(widget.id, items, id => change(id, { done: true }));

  if (status === 'loading') return <WidgetSkeleton />;

  const add = () => {
    const value = text.trim();
    if (!value) return;
    if (items.length >= TODO_MAX) return void message.warning(`Tối đa ${TODO_MAX} việc — xoá bớt việc đã xong`);
    setState(previous => ({ items: [{ id: newTodoId(), text: value.slice(0, 300), done: false, createdAt: new Date().toISOString() }, ...(previous.items ?? [])] }));
    setText('');
  };
  const open = items.filter(entry => !entry.done);
  const done = items.filter(entry => entry.done);

  return (
    <div className="ph-todo">
      <Input
        className="ph-todo-add"
        size="small"
        variant="filled"
        prefix={<PlusOutlined />}
        placeholder="Thêm việc rồi nhấn Enter"
        value={text}
        maxLength={300}
        onChange={event => setText(event.target.value)}
        onPressEnter={add}
        aria-label="Thêm việc"
      />
      {items.length ? (
        <div className="ph-todo-list">
          {open.map(entry => (
            <TodoRow key={entry.id} item={entry} onChange={patch => change(entry.id, patch)} onRemove={() => remove(entry.id)} />
          ))}
          {!open.length && <span className="ph-todo-empty">Đã xong hết việc</span>}
          {showDone && done.length > 0 && (
            <>
              <div className="ph-todo-sep">
                <span>Đã xong {num(done.length)}</span>
                <button
                  type="button"
                  className="ph-link-btn"
                  onClick={() => {
                    done.forEach(entry => removed.current.add(entry.id));
                    setState(previous => ({ items: previous.items.filter(entry => !entry.done) }));
                  }}
                >
                  Xoá việc đã xong
                </button>
              </div>
              {done.map(entry => (
                <TodoRow key={entry.id} item={entry} onChange={patch => change(entry.id, patch)} onRemove={() => remove(entry.id)} />
              ))}
            </>
          )}
        </div>
      ) : (
        <Note icon={<CheckSquareOutlined />}>Chưa có việc nào — gõ việc cần làm ở ô trên</Note>
      )}
    </div>
  );
}

/* ───────────── Đếm ngược ───────────── */

export function Countdown() {
  const { label = 'Hạn nộp báo cáo', at = null, doneText = 'Đã tới hạn' } = useSettings<{ label: string; at: string | null; doneText: string }>();
  const { openSettings } = useWidget();
  const now = useNow();
  const parts = countdownParts(at, now);
  if (!parts || !at) {
    return (
      <Note
        icon={<HourglassOutlined />}
        action={
          <Button size="small" icon={<SettingOutlined />} onClick={openSettings}>
            Chọn thời điểm
          </Button>
        }
      >
        Đếm ngược tới một mốc quan trọng
      </Note>
    );
  }
  const urgent = !parts.done && parts.days === 0;
  return (
    <div className={`ph-count${parts.done ? ' done' : urgent ? ' urgent' : ''}`}>
      <span className="ph-count-label" title={label}>
        {label}
      </span>
      {parts.done ? (
        <strong className="ph-count-done">
          <CheckCircleFilled /> {doneText}
        </strong>
      ) : (
        <span className="ph-count-main" aria-label={`Còn ${parts.days} ngày ${parts.hours} giờ ${parts.minutes} phút`}>
          {parts.days > 0 && (
            <span className="ph-count-days">
              <b>{num(parts.days)}</b>
              <small>ngày</small>
            </span>
          )}
          <span className="ph-count-clock">
            {pad(parts.hours)}:{pad(parts.minutes)}
            <small>:{pad(parts.seconds)}</small>
          </span>
        </span>
      )}
      <span className="ph-count-at">
        {dateLine(new Date(at), false)} · {vn(at).format('HH:mm')}
      </span>
    </div>
  );
}

/* ───────────── Tập trung ───────────── */

let audio: AudioContext | null = null;

function unlockAudio() {
  try {
    audio ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    audio = null;
  }
}

/** Ba nốt ngắn tổng hợp bằng Web Audio: đi lên khi hết phiên làm việc, đi xuống khi hết giờ nghỉ. */
function chime(rising: boolean) {
  if (!audio) return;
  const notes = rising ? [659.25, 880, 1174.66] : [1174.66, 880, 659.25];
  notes.forEach((frequency, index) => {
    const oscillator = audio!.createOscillator();
    const gain = audio!.createGain();
    const start = audio!.currentTime + index * 0.16;
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.55);
    oscillator.connect(gain).connect(audio!.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.6);
  });
}

type StoredFocus = FocusState & { day: string };

function todayKey() {
  return vn(new Date()).format('YYYY-MM-DD');
}

function readFocus(key: string): FocusState {
  const stored = readLocal<StoredFocus | null>(key, null);
  if (!stored) return FOCUS_IDLE;
  if (stored.day !== todayKey()) return { ...FOCUS_IDLE, ...(stored.endsAt && stored.endsAt > Date.now() ? { phase: stored.phase, endsAt: stored.endsAt } : {}) };
  return { phase: stored.phase, endsAt: stored.endsAt, pausedLeft: stored.pausedLeft, rounds: stored.rounds };
}

export function Focus() {
  const { widget } = useWidget();
  const { workMin = 25, breakMin = 5, sound = true } = useSettings<{ workMin: number; breakMin: number; sound: boolean }>();
  const { notification } = App.useApp();
  const key = `ioc_focus_v1:${widget.id}`;
  const [state, setState] = useState<FocusState>(() => readFocus(key));
  const running = state.endsAt !== null;
  const now = useNow(false, running);

  useEffect(() => writeLocal(key, { ...state, day: todayKey() }), [key, state]);

  useEffect(() => {
    if (!running) return;
    const step = focusTick(state, now.getTime(), workMin, breakMin);
    if (!step.event) return;
    setState(step.state);
    if (sound) chime(step.event === 'work-done');
    notification.info({
      key: `focus-${widget.id}`,
      title: step.event === 'work-done' ? 'Hết phiên làm việc' : 'Hết giờ nghỉ',
      description: step.event === 'work-done' ? `Nghỉ ${breakMin} phút cho mắt và vai nhé.` : 'Sẵn sàng cho phiên tiếp theo.',
      icon: <FireOutlined />,
    });
  }, [now, running, state, workMin, breakMin, sound, notification, widget.id]);

  const total = (state.phase === 'break' ? breakMin : workMin) * 60_000;
  // Đọc giờ thật lúc vẽ: nhịp giây chỉ chạy khi đồng hồ đang chạy, nên `now` có thể cũ ngay sau khi bấm Bắt đầu.
  const left = state.endsAt !== null ? Math.max(0, state.endsAt - Math.max(now.getTime(), Date.now())) : (state.pausedLeft ?? workMin * 60_000);
  const progress = state.phase === 'idle' ? 0 : Math.min(1, Math.max(0, 1 - left / total));
  const seconds = Math.ceil(left / 1000);
  const radius = 44;
  const length = 2 * Math.PI * radius;
  const phaseLabel = state.phase === 'work' ? (running ? 'Đang tập trung' : 'Tạm dừng') : state.phase === 'break' ? (running ? 'Nghỉ ngơi' : 'Tạm dừng nghỉ') : 'Sẵn sàng';

  return (
    <div className={`ph-focus ${state.phase}${running ? ' running' : ''}`}>
      <div className="ph-focus-ring">
        <svg viewBox="0 0 100 100" aria-hidden>
          <circle cx="50" cy="50" r={radius} className="track" />
          <circle cx="50" cy="50" r={radius} className="bar" strokeDasharray={length} strokeDashoffset={length * (1 - progress)} transform="rotate(-90 50 50)" />
        </svg>
        <div className="ph-focus-center" aria-live="off">
          <strong>
            {pad(Math.floor(seconds / 60))}:{pad(seconds % 60)}
          </strong>
          <span>{phaseLabel}</span>
        </div>
      </div>
      <div className="ph-focus-side">
        <div className="ph-focus-controls">
          <Button
            type="primary"
            shape="round"
            size="small"
            icon={running ? <PauseOutlined /> : <CaretRightOutlined />}
            onClick={() => {
              unlockAudio();
              setState(current => (current.endsAt !== null ? focusPause(current, Date.now()) : focusStart(current, Date.now(), workMin, breakMin)));
            }}
          >
            {running ? 'Tạm dừng' : state.pausedLeft !== null ? 'Tiếp tục' : 'Bắt đầu'}
          </Button>
          <Tooltip title="Đặt lại">
            <Button shape="circle" size="small" icon={<RedoOutlined />} aria-label="Đặt lại" disabled={state.phase === 'idle' && !state.rounds} onClick={() => setState({ ...FOCUS_IDLE })} />
          </Tooltip>
        </div>
        <span className="ph-focus-rounds">
          {state.rounds ? (
            <>
              <FireOutlined /> {num(state.rounds)} phiên hôm nay
            </>
          ) : (
            <>
              <ClockCircleOutlined /> {num(workMin)} phút làm · {num(breakMin)} phút nghỉ
            </>
          )}
        </span>
      </div>
    </div>
  );
}
