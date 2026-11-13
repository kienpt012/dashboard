import { DocRef } from '@/components/DocRef';
import { PrinterOutlined } from '@ant-design/icons';
import { Button, Card, DatePicker, Flex, Select, Table } from 'antd';
import { Fragment, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { Page } from '@/components/Page';
import { PrintDocument } from '@/components/PrintDocument';
import { NoData, Query } from '@/components/States';
import { ReadScopeSwitch, useReadScope } from '@/components/ReadScope';
import { useApi } from '@/hooks/useApi';
import { query } from '@/lib/api';
import { date, num, vn } from '@/lib/format';
import { ExcelButton, TaskStatus, TASK_STATUS } from './shared';
import type { DirectiveOptions, MonthlyWork as MonthlyData } from './types';
import './directives.css';

export function MonthlyWorkPanel({ options }: { options: DirectiveOptions }) {
  const readScope = useReadScope();
  const [params, setParams] = useSearchParams();
  const rawMonth = params.get('month');
  const month = rawMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(rawMonth) ? rawMonth : vn().format('YYYY-MM');
  const departmentId = readScope.scope === 'mine' ? options.defaultDepartmentId || '' : params.get('monthDepartmentId') || '';
  const suffix = query({ month, departmentId, scope: readScope.scope });
  const data = useApi<MonthlyData>(`/directives/monthly${suffix}`, { keepPrevious: true });
  const [printedAt, setPrintedAt] = useState(() => new Date());
  function update(key: string, value: string) {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
  }
  const scope = data.data?.departmentName || 'Toàn địa phương';
  const count = data.data?.groups.reduce((sum, group) => sum + group.items.length, 0) ?? 0;
  return <div className="directive-page">
    <Flex wrap justify="space-between" gap={12} className="directive-month-tools">
      <Flex wrap gap={8}>
        <ReadScopeSwitch value={readScope} />
        <DatePicker picker="month" allowClear={false} format="MM/YYYY" value={dayjs(`${month}-01`)} aria-label="Tháng công tác" onChange={value => value && update('month', value.format('YYYY-MM'))} />
        <Select value={departmentId} aria-label="Phòng ban" showSearch={{ optionFilterProp: 'label' }} onChange={value => update('monthDepartmentId', value)} options={[
          ...(readScope.scope === 'all' || options.permissions.canDispatch ? [{ value: '', label: 'Toàn địa phương' }] : []),
          ...options.departments.map(item => ({ value: item.id, label: item.name })),
        ]} />
      </Flex>
      <Flex gap={8} wrap>
        <ExcelButton path={`/directives/monthly.xlsx${suffix}`} filename={`viec-theo-thang-${month}.xlsx`} />
        <Button icon={<PrinterOutlined />} disabled={!count} onClick={() => { setPrintedAt(new Date()); window.setTimeout(() => window.print(), 50); }}>In danh sách</Button>
      </Flex>
    </Flex>
    <Query query={data}>{result => <>
      {result.groups.length ? <Flex vertical gap={16}>{result.groups.map(group => <Card key={group.id} title={group.name} extra={<span className="muted">{num(group.items.length)} việc</span>} className="card-flush">
        <Table rowKey={item => `${item.id}-${item.periodLabel ?? ''}`} dataSource={group.items} pagination={false} scroll={{ x: 850 }} sticky columns={[
          { title: 'STT', key: 'index', width: 60, render: (_, __, index) => index + 1 },
          { title: 'Nội dung', key: 'title', render: (_, item) => <div className="directive-name"><Link to={`/admin/targets/${item.targetId || item.id}`}>{item.title}</Link><DocRef value={item} />{item.periodLabel && <span className="directive-cell-meta">{item.periodLabel}</span>}</div> },
          { title: 'Phòng chủ trì', key: 'department', width: 200, render: (_, item) => item.department.name },
          { title: 'Người phụ trách', key: 'assignee', width: 160, render: (_, item) => item.assignee?.fullName || <span className="muted">Chưa giao người</span> },
          { title: 'Hạn', dataIndex: 'dueDate', width: 115, render: value => date(value) },
          { title: 'Trạng thái', dataIndex: 'status', width: 165, render: value => <TaskStatus status={value} /> },
        ]} />
      </Card>)}</Flex> : <Card><NoData text="Không có việc đến hạn trong tháng đã chọn" /></Card>}
      {count > 0 && <PrintDocument kind="DANH SÁCH" title={`Công việc tháng ${dayjs(`${month}-01`).format('MM/YYYY')}`} subtitle={scope} orientation="landscape" at={printedAt}>
        <table>
          <thead><tr><th style={{ width: '5%' }}>STT</th><th style={{ width: '37%' }}>Nội dung công việc</th><th style={{ width: '18%' }}>Phòng chủ trì</th><th style={{ width: '17%' }}>Người phụ trách</th><th style={{ width: '11%' }}>Hạn</th><th style={{ width: '12%' }}>Trạng thái</th></tr></thead>
          <tbody>{result.groups.map(group => <Fragment key={group.id}>
            <tr className="group"><td colSpan={6}>{group.name}</td></tr>
            {group.items.map((item, index) => <tr key={`${item.id}-${item.periodLabel ?? ''}`}>
              <td className="c">{index + 1}</td><td>{item.title}{item.periodLabel ? ` (${item.periodLabel})` : ''}</td><td>{item.department.name}</td><td>{item.assignee?.fullName || 'Chưa giao người'}</td><td className="c">{date(item.dueDate)}</td><td className="c">{TASK_STATUS[item.status]?.label || item.status}</td>
            </tr>)}
          </Fragment>)}</tbody>
        </table>
        <p>Tổng cộng: {num(count)} công việc.</p>
      </PrintDocument>}
    </>}</Query>
  </div>;
}

export default function MonthlyWork() {
  const readScope = useReadScope();
  const options = useApi<DirectiveOptions>(`/directives/options?scope=${readScope.scope}`);
  return <Page title="Việc theo tháng" breadcrumb={[{ label: 'Văn bản chỉ đạo', to: '/admin/van-ban-chi-dao' }, { label: 'Việc theo tháng' }]} wide>
    <Query query={options}>{data => <MonthlyWorkPanel options={data} />}</Query>
  </Page>;
}
