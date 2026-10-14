import { Badge, Tag, Tooltip } from 'antd';
import type { ReactNode } from 'react';
import { periodLabel } from '@/lib/periods';
import type { EvaluationResult, FrameworkKind, TargetStatusKey } from '@/types/domain';

export const STATUS: Record<TargetStatusKey, { label: string; color: string; badge: 'default' | 'processing' | 'warning' | 'error' | 'success'; hex: string }> = {
  NOT_STARTED: { label: 'Chưa bắt đầu', color: 'default', badge: 'default', hex: '#9aa3b2' },
  ON_TRACK: { label: 'Đúng tiến độ', color: 'blue', badge: 'processing', hex: '#2f6fed' },
  AT_RISK: { label: 'Có nguy cơ', color: 'orange', badge: 'warning', hex: '#e08a00' },
  OVERDUE: { label: 'Quá hạn', color: 'red', badge: 'error', hex: '#dc2626' },
  COMPLETED: { label: 'Hoàn thành', color: 'green', badge: 'success', hex: '#16a34a' },
};

export const STATUS_ORDER: TargetStatusKey[] = ['COMPLETED', 'ON_TRACK', 'AT_RISK', 'OVERDUE', 'NOT_STARTED'];

export function StatusTag({ status }: { status: TargetStatusKey | string }) {
  const meta = STATUS[status as TargetStatusKey] ?? STATUS.NOT_STARTED;
  return (
    <Tag color={meta.color} variant="filled" style={{ marginInlineEnd: 0 }}>
      {meta.label}
    </Tag>
  );
}

export function StatusDot({ status, text }: { status: TargetStatusKey | string; text?: ReactNode }) {
  const meta = STATUS[status as TargetStatusKey] ?? STATUS.NOT_STARTED;
  return <Badge status={meta.badge} text={text ?? meta.label} />;
}

const KIND: Record<FrameworkKind, { label: string; color: string }> = {
  PLAN: { label: 'Kế hoạch', color: 'geekblue' },
  SCORE: { label: 'Chấm điểm', color: 'purple' },
  TASK: { label: 'Nhiệm vụ', color: 'cyan' },
  STAT: { label: 'Thống kê', color: 'gold' },
};

export function KindTag({ kind }: { kind: FrameworkKind }) {
  const meta = KIND[kind] ?? KIND.PLAN;
  return (
    <Tag color={meta.color} variant="outlined" style={{ marginInlineEnd: 0 }}>
      {meta.label}
    </Tag>
  );
}

export function PeriodTag({ periodKey }: { periodKey?: string | null }) {
  if (!periodKey) return null;
  return <Tag style={{ marginInlineEnd: 0 }}>{periodLabel(periodKey)}</Tag>;
}

const EVALUATION: Record<EvaluationResult, { label: string; color: string }> = {
  EXCEEDED: { label: 'Vượt', color: 'green' },
  ACHIEVED: { label: 'Đạt', color: 'blue' },
  PARTIAL: { label: 'Đạt một phần', color: 'orange' },
  NOT_ACHIEVED: { label: 'Không đạt', color: 'red' },
};

export function EvaluationTag({ result }: { result: EvaluationResult }) {
  const meta = EVALUATION[result];
  return (
    <Tag color={meta.color} variant="filled" style={{ marginInlineEnd: 0 }}>
      {meta.label}
    </Tag>
  );
}

const REVIEW: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Chờ duyệt', color: 'gold' },
  APPROVED: { label: 'Đã duyệt', color: 'green' },
  REJECTED: { label: 'Trả lại', color: 'red' },
};

export function ReviewTag({ status, auto }: { status: string; auto?: boolean }) {
  const meta = REVIEW[status] ?? { label: status, color: 'default' };
  const tag = (
    <Tag color={meta.color} variant="filled" style={{ marginInlineEnd: 0 }}>
      {auto && status === 'APPROVED' ? 'Tự thông qua' : meta.label}
    </Tag>
  );
  return auto ? <Tooltip title="Quá thời hạn duyệt, hệ thống tự thông qua">{tag}</Tooltip> : tag;
}

export function DeptTag({ name, color }: { name: string; color?: string | null }) {
  return (
    <span className="dept-tag" title={name}>
      <i style={{ background: color || '#9aa3b2' }} />
      <span className="dept-name">{name}</span>
    </span>
  );
}
