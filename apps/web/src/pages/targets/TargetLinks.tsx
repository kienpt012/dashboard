import { LinkOutlined } from '@ant-design/icons';
import { Button, Card, Drawer, Popconfirm, Space, Table, Tag, Tooltip } from 'antd';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMe } from '@/app/session';
import { NoData, Query } from '@/components/States';
import { useAction, useApi } from '@/hooks/useApi';
import { http } from '@/lib/api';
import { num } from '@/lib/format';
import { can, SUPERVISORS } from '@/lib/roles';
import '../forecast/forecast.css';

type LinkedTarget = { id: string; title: string; documentNumber: string; issuingLevel: string; targetValue: number; currentValue: number; unit: string; achieved: boolean; progress: number; departmentId: string };
type Links = { linkGroupId: string | null; canManage: boolean; items: LinkedTarget[] };
type Suggestion = { target: LinkedTarget; candidate: LinkedTarget; similarity: number; reason: string; canManage: boolean };
const LEVEL: Record<string, string> = { CENTRAL: 'Trung ương', PROVINCE: 'Thành phố', LOCAL: 'Địa phương' };

export function LinkedIcon({ linked }: { linked?: string | null }) { return linked ? <Tooltip title="Có ở nhiều văn bản"><LinkOutlined aria-label="Có ở nhiều văn bản" style={{ marginLeft: 6 }} /></Tooltip> : null; }

export function TargetLinksCard({ targetId }: { targetId: string }) {
  const list = useApi<Links>(`/target-links/targets/${targetId}`);
  const unlink = useAction(() => http.delete(`/target-links/targets/${targetId}`), { success: 'Đã bỏ liên kết', refresh: ['/target-links', '/targets', '/forecast'] });
  if (list.data && list.data.items.length < 2) return null;
  return <Card title="Mức giao theo văn bản" extra={list.data?.canManage && list.data.linkGroupId ? <Popconfirm title="Bỏ liên kết chỉ tiêu này?" description="Các báo cáo đã đồng bộ được giữ lại." onConfirm={() => unlink.mutate()}><Button size="small" loading={unlink.isPending}>Bỏ liên kết</Button></Popconfirm> : undefined}>
    <Query query={list}>{data => <Table rowKey="id" size="small" pagination={false} dataSource={data.items} scroll={{ x: 650 }} columns={[
      { title: 'Văn bản giao', key: 'document', render: (_, item) => <div className="cell-title"><Link to={`/admin/targets/${item.id}`}>{item.documentNumber || item.title}</Link><span>{LEVEL[item.issuingLevel] || item.issuingLevel}</span></div> },
      { title: 'Mức giao', dataIndex: 'targetValue', align: 'right', render: (value, item) => `${num(value)} ${item.unit}` },
      { title: 'Thực hiện', dataIndex: 'currentValue', align: 'right', render: (value, item) => `${num(value)} ${item.unit}` },
      { title: 'Kết quả', key: 'result', width: 115, render: (_, item) => <Tag color={item.achieved ? 'green' : 'gold'}>{item.achieved ? 'Đạt' : 'Chưa đạt'}</Tag> },
    ]} />}</Query>
  </Card>;
}

export function TargetLinkSuggestions({ year }: { year: number }) {
  const user = useMe();
  const [open, setOpen] = useState(false);
  const allowed = can(user, SUPERVISORS);
  const list = useApi<{ items: Suggestion[] }>(open && allowed ? `/target-links/suggestions?year=${year}` : null);
  const action = useAction(({ item, ignore }: { item: Suggestion; ignore: boolean }) => http.post(`/target-links/${ignore ? 'ignore' : 'link'}`, { targetId: item.target.id, otherTargetId: item.candidate.id }), { success: 'Đã cập nhật liên kết', refresh: ['/target-links', '/targets', '/forecast'] });
  if (!allowed) return null;
  return <><Button icon={<LinkOutlined />} onClick={() => setOpen(true)}>Gợi ý liên kết</Button><Drawer title="Gợi ý liên kết chỉ tiêu" open={open} onClose={() => setOpen(false)} size={640}>
    <Query query={list}>{data => data.items.length ? data.items.map(item => <div key={`${item.target.id}:${item.candidate.id}`} className="linked-suggestion">
      <Link to={`/admin/targets/${item.target.id}`}>{item.target.title}</Link>
      <p>{item.target.documentNumber} · {LEVEL[item.target.issuingLevel]} · {num(item.target.targetValue)} {item.target.unit}</p>
      <Link to={`/admin/targets/${item.candidate.id}`}>{item.candidate.title}</Link>
      <p>{item.candidate.documentNumber} · {LEVEL[item.candidate.issuingLevel]} · {num(item.candidate.targetValue)} {item.candidate.unit}</p>
      <p className="muted">{item.reason}</p>
      {item.canManage && <Space wrap><Button type="primary" loading={action.isPending} onClick={() => action.mutate({ item, ignore: false })}>Liên kết</Button><Button disabled={action.isPending} onClick={() => action.mutate({ item, ignore: true })}>Bỏ qua gợi ý</Button></Space>}
    </div>) : <NoData text="Không còn gợi ý liên kết" />}</Query>
  </Drawer></>;
}
