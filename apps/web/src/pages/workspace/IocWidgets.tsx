import { DocRef } from '@/components/DocRef';
import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Empty, Progress, Select, Tag } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useMe } from '@/app/session';
import { Chart } from '@/components/Chart';
import { DocumentViewer } from '@/components/DocumentViewer';
import { StatusTag } from '@/components/Tags';
import { errorText, http } from '@/lib/api';
import { date, dateTime, num } from '@/lib/format';
import { periodLabel } from '@/lib/periods';
import type { Dossier, MyWork, Overview, TargetBrief } from '@/types/domain';
import type { WorkspaceWidget } from './model';
import type { DeskBriefingData } from './desk-api';
import './ioc-widgets.css';

type Props = { widget: WorkspaceWidget; onChange: (settings: Record<string, unknown>) => void };
export type WorkspacePin = { kind: 'target' | 'document'; id: string; title: string };
type DocumentRow = { id: string; title: string; docNumber?: string | null; createdAt?: string };
function useData<T>(path: string | null) {
  const user = useMe();
  return useQuery({ queryKey: ['desk-widget', user.id, path], queryFn: ({ signal }) => http.get<T>(path!, signal), enabled: !!path, refetchInterval: 60_000 });
}
function Frame({ query, children }: { query: { isPending: boolean; error: unknown; refetch: () => unknown }; children: ReactNode }) {
  if (query.isPending) return <div className="ws-widget-state">Đang tải…</div>;
  if (query.error) return <div className="ws-widget-state" role="alert">{errorText(query.error)}<Button onClick={() => query.refetch()}>Thử lại</Button></div>;
  return <div className="ws-ioc-list">{children}</div>;
}
const noWork = <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có việc" />;

export function DepartmentWorkWidget() {
  const query = useData<DeskBriefingData>('/workspace/briefing');
  return <Frame query={query}>{query.data?.systemNotes.length ? query.data.systemNotes.map(item => <Link className="ws-ioc-row" key={item.id} to={item.href ?? '/admin/viec-cua-toi'}><strong>{item.title}</strong><span>{item.status}</span><small>{item.assignee ? `${item.assignee.fullName} · ${item.assignee.username}` : 'Chưa giao người phụ trách'}</small></Link>) : noWork}</Frame>;
}

function TargetFigures({ item }: { item: TargetBrief }) {
  const reported = !!(item.lastReportedAt || item.hasReport);
  return <><span>{item.kind !== 'STAT' && <StatusTag status={item.status} />}{reported ? `${num(item.currentValue)}${item.kind === 'STAT' ? '' : ` / ${num(item.targetValue)}`} ${item.unit}` : 'Chưa có số liệu'}</span>{item.kind !== 'STAT' && reported && <Progress size="small" percent={Math.min(100, Math.max(0, item.progress))} />}</>;
}

export function MyTargetsWidget() {
  const query = useData<TargetBrief[]>('/targets?mine=true');
  return <Frame query={query}>{query.data?.length ? query.data.map(item => <Link className="ws-ioc-row" key={item.id} to={`/admin/targets/${item.id}`}><strong>{item.title}</strong><DocRef value={item} /><TargetFigures item={item} /></Link>) : noWork}</Frame>;
}

export function TargetChartWidget({ widget, onChange }: Props) {
  const targets = useData<TargetBrief[]>('/targets');
  const targetId = typeof widget.settings.targetId === 'string' ? widget.settings.targetId : undefined;
  const query = useData<Dossier>(targetId ? `/targets/${encodeURIComponent(targetId)}/dossier` : null);
  // A correction replaces a period's previous approved value; pending/rejected reports never enter the chart.
  const reports = new Map<string, { value: number; at: string }>();
  for (const report of [...(query.data?.reports ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (report.reviewStatus === 'APPROVED' && report.periodKey) reports.set(report.periodKey, { value: report.value, at: report.createdAt });
  }
  const rows = [...reports.entries()].sort(([a], [b]) => a.localeCompare(b));
  return <div className="ws-target-chart"><Select aria-label="Chọn chỉ tiêu để vẽ biểu đồ" placeholder="Chọn chỉ tiêu" showSearch optionFilterProp="label" value={targetId} loading={targets.isPending} options={targets.data?.map(item => ({ value: item.id, label: item.title }))} onChange={value => onChange({ ...widget.settings, targetId: value })} />
    {!targetId ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa cấu hình" /> : <Frame query={query}>{rows.length ? <><Chart height={235} option={{ tooltip: { trigger: 'axis', renderMode: 'richText' }, legend: { data: ['Thực hiện', 'Mức giao'] }, grid: { left: 12, right: 15, top: 42, bottom: 20, containLabel: true }, xAxis: { type: 'category', data: rows.map(([key]) => periodLabel(key)) }, yAxis: { type: 'value' }, series: [{ name: 'Thực hiện', type: 'line', data: rows.map(([, report]) => report.value) }, { name: 'Mức giao', type: 'line', lineStyle: { type: 'dashed' }, data: rows.map(() => query.data?.targetValue ?? 0) }] }} /><small>{query.data?.unit} · Số liệu đã duyệt</small></> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có số liệu theo kỳ" />}</Frame>}
  </div>;
}

const alertLabel: Record<string, string> = { OVERDUE: 'Quá hạn', MISSING_REPORT: 'Thiếu báo cáo', AT_RISK: 'Có nguy cơ', EXPLANATION_OVERDUE: 'Quá hạn giải trình', STALLED: 'Chờ xử lý trách nhiệm', PROPOSAL_PENDING: 'Đề xuất chờ xử lý', UNASSIGNED: 'Chưa giao người' };
const actionColor = (action: string) => /REJECT|RETURN/.test(action) ? 'red' : /APPROV|EVALUAT/.test(action) ? 'green' : /REPORT|SUBMIT/.test(action) ? 'blue' : /ASSIGN|TRANSFER/.test(action) ? 'purple' : /EXPLAN|REMIND/.test(action) ? 'orange' : 'cyan';
export function OverviewWidget({ kind }: { kind: 'alerts' | 'departments' | 'activity' }) {
  const query = useData<Overview>('/ioc/overview');
  const names = useData<TargetBrief[]>(kind === 'alerts' ? '/targets' : null);
  const data = query.data;
  return <Frame query={query}>{kind === 'departments' ? (data?.departments.length ? data.departments.map(item => <Link className="ws-ioc-row" key={item.id} to={`/admin/targets?departmentId=${item.id}`}><strong>{item.name}</strong><span>{item.completed}/{item.total} hoàn thành · {item.overdue} quá hạn</span><Progress size="small" percent={Math.max(0, Math.min(100, item.progress))} strokeColor={item.color} /></Link>) : noWork)
    : kind === 'activity' ? (data?.recent.length ? data.recent.map(item => <div className="ws-ioc-row" key={item.id}><div><Tag color={actionColor(item.action)}>{item.label}</Tag><time dateTime={item.createdAt}>{dateTime(item.createdAt)}</time></div>{item.target ? <Link to={`/admin/targets/${item.target.id}`}><strong>{item.target.title}</strong></Link> : item.candidate ? <Link to="/admin/proposals">{item.candidate.name}</Link> : null}<small>{item.actorName}</small></div>) : noWork)
    : data?.alerts.length ? data.alerts.map((item, index) => <Link className="ws-ioc-row" key={`${item.targetId ?? item.candidateId ?? item.kind}-${index}`} to={item.targetId ? `/admin/targets/${item.targetId}` : item.candidateId ? '/admin/proposals' : '/admin/targets'}><strong>{item.targetId ? names.data?.find(target => target.id === item.targetId)?.title ?? (item.kind === 'EXPLANATION_OVERDUE' ? 'Chỉ tiêu cần giải trình' : item.detail) : item.title.replace(/^Đề xuất chờ duyệt: /, '')}</strong><span><Tag color={item.severity === 'critical' ? 'red' : 'orange'}>{alertLabel[item.kind] ?? 'Cần xử lý'}</Tag>{item.departmentName}</span></Link>) : noWork}</Frame>;
}

export function ApprovalWidget() {
  const user = useMe();
  const allowed = ['ADMIN', 'LEADER', 'MANAGER'].includes(user.role);
  const query = useData<{ id: string; target: { id: string; title: string }; createdAt: string; canReview: boolean; autoApproveAt: string | null }[]>(allowed ? '/targets/pending-updates' : null);
  if (!allowed) return <div className="ws-widget-state">Không có quyền duyệt báo cáo</div>;
  const rows = query.data?.filter(item => item.canReview) ?? [];
  return <Frame query={query}>{rows.length ? rows.map(item => <Link className="ws-ioc-row" key={item.id} to={`/admin/targets/${item.target.id}`}><strong>{item.target.title}</strong><span>Gửi {dateTime(item.createdAt)}</span>{item.autoApproveAt && <small>Tự thông qua {dateTime(item.autoApproveAt)}</small>}</Link>) : noWork}<Link to="/admin/approvals">Duyệt báo cáo</Link></Frame>;
}
export function ProposalsWidget() {
  const query = useData<MyWork>('/my-work');
  return <Frame query={query}>{query.data?.proposals.length ? query.data.proposals.map(item => <Link className="ws-ioc-row" key={item.id} to="/admin/proposals"><strong>{item.name}</strong><small>{item.responsibleDepartment?.name} · {dateTime(item.createdAt)}</small></Link>) : noWork}</Frame>;
}
export function FeedbackWidget() {
  const query = useData<{ received: number; inProgress: number; pendingReview: number; overdue: number; dueSoon: number }>('/feedbacks/stats');
  return <Frame query={query}><Link className="ws-ioc-row" to="/admin/feedback"><strong>{(query.data?.received ?? 0) + (query.data?.inProgress ?? 0) + (query.data?.pendingReview ?? 0)} phản ánh đang mở</strong><span>{query.data?.overdue ?? 0} quá hạn · {query.data?.dueSoon ?? 0} sắp đến hạn</span></Link></Frame>;
}
export function DocumentsWidget() {
  const query = useData<DocumentRow[]>('/documents');
  const [opened, setOpened] = useState<string | null>(null);
  return <><Frame query={query}>{query.data?.length ? query.data.slice(0, 12).map(item => <button className="ws-ioc-row" type="button" key={item.id} onClick={() => setOpened(item.id)}><strong>{item.title}</strong><small>{item.docNumber}{item.createdAt && ` · ${date(item.createdAt)}`}</small></button>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có văn bản" />}</Frame><DocumentViewer id={opened} onClose={() => setOpened(null)} /></>;
}
export function PinsWidget({ widget, onChange }: Props) {
  const pins = (Array.isArray(widget.settings.items) ? widget.settings.items : []) as WorkspacePin[];
  const params = new URLSearchParams({ targetIds: pins.filter(item => item.kind === 'target').map(item => item.id).join(','), documentIds: pins.filter(item => item.kind === 'document').map(item => item.id).join(',') });
  const query = useData<{ targets: TargetBrief[]; documents: DocumentRow[] }>(`/workspace/pins?${params}`);
  const [opened, setOpened] = useState<string | null>(null);
  const remove = (kind: string, id: string) => onChange({ ...widget.settings, items: pins.filter(item => item.kind !== kind || item.id !== id) });
  const unpin = (kind: string, id: string, title: string) => <Button type="text" size="small" icon={<DeleteOutlined />} aria-label={`Bỏ ghim ${title}`} onClick={() => remove(kind, id)} />;
  return <><Frame query={query}>{query.data?.targets.map(item => <div className="ws-ioc-pin" key={item.id}><Link className="ws-ioc-row" to={`/admin/targets/${item.id}`}><strong>{item.title}</strong><DocRef value={item} /><TargetFigures item={item} /></Link>{unpin('target', item.id, item.title)}</div>)}{query.data?.documents.map(item => <div className="ws-ioc-pin" key={item.id}><button type="button" className="ws-ioc-row" onClick={() => setOpened(item.id)}><strong>{item.title}</strong><small>{item.docNumber}</small></button>{unpin('document', item.id, item.title)}</div>)}{!query.data?.targets.length && !query.data?.documents.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có mục ghim" />}</Frame><DocumentViewer id={opened} onClose={() => setOpened(null)} /></>;
}
