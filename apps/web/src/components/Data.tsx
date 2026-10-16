import { Progress, Select, Tooltip, Typography } from 'antd';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { currentYear, num, pct } from '@/lib/format';
import type { TargetStatusKey } from '@/types/domain';
import { STATUS, STATUS_ORDER } from './Tags';

/** Thanh phân bố tình trạng; rê chuột xem số từng loại. */
export function DistBar({ counts, total, width }: { counts: Partial<Record<TargetStatusKey, number>>; total: number; width?: number | string }) {
  const keys = STATUS_ORDER.filter(key => (counts[key] ?? 0) > 0);
  const tip = (
    <div className="tip-rows">
      {STATUS_ORDER.map(key => (
        <div key={key}>
          <span>
            <i style={{ background: STATUS[key].hex }} />
            {STATUS[key].label}
          </span>
          <b>{num(counts[key] ?? 0)}</b>
        </div>
      ))}
    </div>
  );
  return (
    <Tooltip title={tip} placement="top">
      <div className="dist-bar" style={{ width }} role="img" aria-label={keys.map(key => `${STATUS[key].label} ${counts[key]}`).join(', ')}>
        {keys.map(key => (
          <i key={key} style={{ width: `${((counts[key] ?? 0) / Math.max(total, 1)) * 100}%`, background: STATUS[key].hex }} />
        ))}
      </div>
    </Tooltip>
  );
}

export function StatusLegend() {
  return (
    <div className="legend">
      {STATUS_ORDER.map(key => (
        <span key={key}>
          <i style={{ background: STATUS[key].hex }} />
          {STATUS[key].label}
        </span>
      ))}
    </div>
  );
}

/** Thanh tiến độ gọn có số phần trăm. */
export function ProgressCell({ value, status }: { value: number | null | undefined; status?: TargetStatusKey | string }) {
  if (value === null || value === undefined) return <span className="muted">—</span>;
  const color = status ? STATUS[status as TargetStatusKey]?.hex : undefined;
  return (
    <div className="progress-cell">
      <Progress percent={Math.min(100, Math.max(0, value))} showInfo={false} size="small" strokeColor={color} />
      <span className="num">{pct(value)}</span>
    </div>
  );
}

/** Ô số liệu: nhãn, giá trị, dòng phụ; bấm được khi có đường dẫn. */
export function Metric({ label, value, foot, to, tone, icon }: { label: ReactNode; value: ReactNode; foot?: ReactNode; to?: string; tone?: 'warn' | 'bad' | 'ok' | 'info'; icon?: ReactNode }) {
  const body = (
    <>
      <span className="metric-label">
        {icon}
        {label}
      </span>
      <span className={`metric-value${tone ? ` tone-${tone}` : ''}`}>{value}</span>
      {foot && <span className="metric-foot">{foot}</span>}
    </>
  );
  return to ? (
    <Link to={to} className="metric clickable">
      {body}
    </Link>
  ) : (
    <div className="metric">{body}</div>
  );
}

export function YearSelect({ value, onChange }: { value: number; onChange: (year: number) => void }) {
  const now = currentYear();
  const years = [now + 1, now, now - 1, now - 2];
  if (!years.includes(value)) years.push(value);
  return <Select value={value} onChange={onChange} style={{ width: 116 }} options={years.sort((a, b) => b - a).map(year => ({ value: year, label: `Năm ${year}` }))} />;
}

/** Tiêu đề hai dòng trong ô bảng: tên chính và dòng phụ. */
export function TitleCell({ title, sub, to }: { title: ReactNode; sub?: ReactNode; to?: string }) {
  return (
    <div className="cell-title">
      {to ? <Link to={to}>{title}</Link> : <strong>{title}</strong>}
      {sub && <span>{sub}</span>}
    </div>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return <Typography.Text type="secondary">{children}</Typography.Text>;
}
