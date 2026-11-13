import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Card, Checkbox, Input, Select, Table, Tabs, Tag, Tooltip } from 'antd';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { YearSelect } from '@/components/Data';
import { FilterBar, Page } from '@/components/Page';
import { Query } from '@/components/States';
import { useApi } from '@/hooks/useApi';
import { query } from '@/lib/api';
import { currentYear, date, num } from '@/lib/format';
import { DirectiveForm } from './DirectiveForms';
import { DirectiveStatistics } from './DirectiveStatistics';
import { MonthlyWorkPanel } from './MonthlyWork';
import { DirectiveMetrics, STATUS_OPTIONS, StatusProgress, TaskLegend } from './shared';
import type { DirectiveFilters, DirectiveList, DirectiveOptions } from './types';
import './directives.css';

export default function Directives() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const year = Number(params.get('year')) || currentYear();
  const tab = ['list', 'month', 'statistics'].includes(params.get('tab') ?? '') ? params.get('tab')! : 'list';
  const filters: DirectiveFilters = { year, kind: params.get('kind') || undefined, departmentId: params.get('departmentId') || undefined, status: params.get('status') || undefined, q: params.get('q') || undefined, includeArchived: params.get('includeArchived') === 'true' || undefined };
  const options = useApi<DirectiveOptions>('/directives/options');
  const list = useApi<DirectiveList>(`/directives${query(filters)}`, { keepPrevious: true });
  function update(key: string, value?: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  }
  const kinds = options.data?.kinds ?? [];
  return <div className="directive-page"><Page title="Văn bản chỉ đạo" wide extra={<>
    {options.data?.permissions.canCreate && <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>Thêm văn bản</Button>}
    <Tooltip title="Tải lại"><Button icon={<ReloadOutlined spin={list.isFetching} />} aria-label="Tải lại" onClick={() => void list.refetch()} /></Tooltip>
  </>}>
    {tab !== 'month' && <Card className="card-flush" style={{ marginBottom: 16 }}>
      <div className="table-filters"><FilterBar active={[filters.kind, filters.departmentId, filters.status, filters.includeArchived].filter(Boolean).length} search={<Input.Search prefix={<SearchOutlined />} allowClear defaultValue={filters.q} placeholder="Số ký hiệu, trích yếu" aria-label="Tìm văn bản chỉ đạo" onSearch={value => update('q', value.trim())} style={{ width: 300, maxWidth: '100%' }} />} filters={<>
        <YearSelect value={year} onChange={value => update('year', String(value))} />
        <Select allowClear placeholder="Loại văn bản" aria-label="Loại văn bản" value={filters.kind} onChange={value => update('kind', value)} options={kinds} style={{ width: 220 }} />
        <Select allowClear showSearch={{ optionFilterProp: 'label' }} placeholder="Phòng chủ trì" aria-label="Phòng chủ trì" value={filters.departmentId} onChange={value => update('departmentId', value)} options={options.data?.departments.map(item => ({ value: item.id, label: item.name }))} style={{ width: 230 }} />
        <Select allowClear placeholder="Trạng thái nhiệm vụ" aria-label="Trạng thái nhiệm vụ" value={filters.status} onChange={value => update('status', value)} options={STATUS_OPTIONS} style={{ width: 200 }} />
        <Checkbox checked={Boolean(filters.includeArchived)} onChange={event => update('includeArchived', event.target.checked ? 'true' : undefined)}>Cả văn bản lưu trữ</Checkbox>
      </>} /></div>
      {list.data && <DirectiveMetrics summary={list.data.summary} />}
    </Card>}
    <Tabs activeKey={tab} onChange={value => update('tab', value)} destroyOnHidden items={[
      { key: 'list', label: 'Danh sách văn bản', children: <Query query={list}>{data => <Card className="card-flush">
        <TaskLegend />
        <Table rowKey="id" dataSource={data.items} sticky scroll={{ x: 1080 }} pagination={{ defaultPageSize: 20, showSizeChanger: true, showTotal: total => `${num(total)} văn bản` }} columns={[
          { title: 'Số ký hiệu · Trích yếu', key: 'name', width: 400, sorter: (a, b) => a.name.localeCompare(b.name, 'vi'), render: (_, item) => <div className="directive-name"><Link to={`/admin/van-ban-chi-dao/${item.id}`}>{item.docNumber || 'Chưa có số ký hiệu'}</Link><Link to={`/admin/van-ban-chi-dao/${item.id}`}>{item.name}</Link>{!item.isActive && <span><Tag>Đã lưu trữ</Tag></span>}</div> },
          { title: 'Loại', dataIndex: 'directiveKind', width: 170, render: value => kinds.find(item => item.value === value)?.label || 'Nhiệm vụ' },
          { title: 'Ngày ban hành', dataIndex: 'issuedDate', width: 130, sorter: (a, b) => (a.issuedDate || '').localeCompare(b.issuedDate || ''), render: value => date(value) },
          { title: 'Nhiệm vụ', key: 'total', width: 100, align: 'center', sorter: (a, b) => a.summary.total - b.summary.total, render: (_, item) => num(item.summary.total) },
          { title: 'Tiến độ thực hiện', key: 'progress', width: 190, render: (_, item) => <div className="directive-name"><StatusProgress summary={item.summary} /><span className="directive-cell-meta">Hoàn thành {num(item.summary.completed)}/{num(item.summary.total)}</span></div> },
          { title: 'Quá hạn', key: 'overdue', width: 90, align: 'center', sorter: (a, b) => a.summary.overdue - b.summary.overdue, render: (_, item) => <span className={item.summary.overdue ? 'tone-bad' : 'muted'}>{num(item.summary.overdue)}</span> },
        ]} />
      </Card>}</Query> },
      { key: 'month', label: 'Việc theo tháng', children: <Query query={options}>{data => <MonthlyWorkPanel options={data} />}</Query> },
      { key: 'statistics', label: 'Thống kê', children: <DirectiveStatistics filters={filters} /> },
    ]} />
    {options.data && <DirectiveForm open={creating} options={options.data} onClose={() => setCreating(false)} onCreated={id => navigate(`/admin/van-ban-chi-dao/${id}`)} />}
  </Page></div>;
}
