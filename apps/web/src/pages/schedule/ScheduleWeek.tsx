import { EnvironmentOutlined, EyeInvisibleOutlined, TeamOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import type { ReactNode } from 'react';
import { entryTime, groupByDay, shortDate, weekdayName, type ScheduleEntry } from './model';
import './schedule.css';

type Props<T extends ScheduleEntry> = {
  weekStart: string;
  entries: T[];
  today?: string;
  /** Bỏ các ngày không có lịch (trang công khai, khối trên trang chủ). */
  hideEmptyDays?: boolean;
  /** Đánh dấu dòng chỉ nội bộ (màn hình cán bộ). */
  showVisibility?: boolean;
  /** Thao tác ở cuối mỗi dòng và cuối mỗi ngày (màn hình lập lịch). */
  rowExtra?: (entry: T) => ReactNode;
  dayExtra?: (day: string) => ReactNode;
};

/** Lịch một tuần, gom theo ngày. Dùng chung cho màn hình lập lịch, trang công khai và khối trên trang chủ. */
export function ScheduleWeek<T extends ScheduleEntry>({ weekStart, entries, today, hideEmptyDays, showVisibility, rowExtra, dayExtra }: Props<T>) {
  const days = groupByDay(weekStart, entries).filter(group => !hideEmptyDays || group.entries.length > 0);
  return (
    <div className="sched-week">
      {days.map(group => (
        <section key={group.day} className={`sched-day${group.day === today ? ' today' : ''}`}>
          <header className="sched-day-head">
            <span className="sched-day-name">{weekdayName(group.day)}</span>
            <span className="sched-day-date">{shortDate(group.day)}</span>
            {group.day === today && <span className="sched-today">Hôm nay</span>}
            {dayExtra && <span className="sched-day-extra">{dayExtra(group.day)}</span>}
          </header>
          {group.entries.length ? (
            <ul className="sched-list">
              {group.entries.map((entry, index) => (
                <li key={entry.id ?? `${entry.date}-${index}`} className={`sched-row${showVisibility && entry.isPublic === false ? ' internal' : ''}`}>
                  <span className="sched-time">{entryTime(entry)}</span>
                  <span className="sched-body">
                    <span className="sched-content">{entry.content}</span>
                    <span className="sched-meta">
                      <strong>{entry.leader}</strong>
                      {entry.location && (
                        <span>
                          <EnvironmentOutlined /> {entry.location}
                        </span>
                      )}
                      {entry.participants && (
                        <span>
                          <TeamOutlined /> {entry.participants}
                        </span>
                      )}
                      {showVisibility && entry.isPublic === false && (
                        <Tooltip title="Chỉ cán bộ thấy, không hiện trên trang công khai">
                          <span className="sched-internal">
                            <EyeInvisibleOutlined /> Nội bộ
                          </span>
                        </Tooltip>
                      )}
                    </span>
                  </span>
                  {rowExtra && <span className="sched-row-extra">{rowExtra(entry)}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="sched-none">Không có lịch</p>
          )}
        </section>
      ))}
    </div>
  );
}
