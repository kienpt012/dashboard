import { FileExcelOutlined } from '@ant-design/icons';
import { App, Button, Flex, Progress, Tag, Tooltip } from 'antd';
import { useState } from 'react';
import { Metric } from '@/components/Data';
import { errorText, http, saveBlob } from '@/lib/api';
import { num } from '@/lib/format';
import type { DirectiveStatus, DirectiveSummary } from './types';

export const TASK_STATUS: Record<DirectiveStatus, { label: string; color: string; hex: string }> = {
  NOT_STARTED: { label: 'Chưa bắt đầu', color: 'default', hex: '#8c96a4' },
  IN_PROGRESS: { label: 'Đang thực hiện', color: 'processing', hex: '#1677ff' },
  COMPLETED: { label: 'Hoàn thành', color: 'success', hex: '#389e0d' },
  OVERDUE: { label: 'Quá hạn', color: 'error', hex: '#cf1322' },
};
export const STATUS_OPTIONS = [...Object.entries(TASK_STATUS).map(([value, item]) => ({ value, label: item.label })), { value: 'DUE_SOON', label: 'Đến hạn trong 7 ngày' }];
export const DIRECTIVE_REFRESH = ['/directives', '/targets', '/frameworks', '/ioc', '/work'];

export function TaskStatus({ status }: { status: string }) {
  const item = TASK_STATUS[status as DirectiveStatus];
  return <Tag color={item?.color}>{item?.label ?? status}</Tag>;
}

export function DirectiveMetrics({ summary }: { summary: DirectiveSummary }) {
  return <div className="directive-metrics">
    <Metric label="Văn bản" value={num(summary.documents)} />
    <Metric label="Nhiệm vụ" value={num(summary.total)} />
    <Metric label="Hoàn thành" value={num(summary.completed)} tone="ok" />
    <Metric label="Đang thực hiện" value={num(summary.inProgress)} />
    <Metric label="Quá hạn" value={num(summary.overdue)} tone={summary.overdue ? 'bad' : undefined} />
    <Metric label="Đến hạn trong 7 ngày" value={num(summary.dueSoon)} tone={summary.dueSoon ? 'warn' : undefined} />
  </div>;
}

export function StatusProgress({ summary }: { summary: DirectiveSummary }) {
  const parts = [
    { key: 'completed', value: summary.completed, status: 'COMPLETED' },
    { key: 'inProgress', value: summary.inProgress, status: 'IN_PROGRESS' },
    { key: 'overdue', value: summary.overdue, status: 'OVERDUE' },
    { key: 'notStarted', value: summary.notStarted, status: 'NOT_STARTED' },
  ] as const;
  const title = parts.map(item => `${TASK_STATUS[item.status].label}: ${item.value}`).join('; ');
  return <Tooltip title={title}>
    <div className="directive-dist" role="img" aria-label={title}>
      {summary.total ? parts.filter(item => item.value > 0).map(item => <span key={item.key} style={{ flex: item.value, background: TASK_STATUS[item.status].hex }} />) : <span className="directive-dist-empty" />}
    </div>
  </Tooltip>;
}

export function TaskProgress({ value }: { value: number }) {
  return <Progress percent={Math.min(100, Math.max(0, Math.round(value)))} size="small" />;
}

export function TaskLegend() {
  return <Flex wrap gap={12} className="legend directive-legend">
    {Object.values(TASK_STATUS).map(item => <span key={item.label}><i style={{ background: item.hex }} />{item.label}</span>)}
  </Flex>;
}

export function ExcelButton({ path, filename }: { path: string; filename: string }) {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  async function download() {
    setLoading(true);
    try { saveBlob(await http.blob(path), filename); }
    catch (error) { message.error(errorText(error, 'Không xuất được tệp Excel')); }
    finally { setLoading(false); }
  }
  return <Button icon={<FileExcelOutlined />} loading={loading} onClick={() => void download()}>Xuất Excel</Button>;
}
