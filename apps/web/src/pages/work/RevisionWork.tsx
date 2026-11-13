import { Button, Table } from 'antd';
import { Link } from 'react-router-dom';
import { dateTime } from '@/lib/format';
import type { MyWork } from '@/types/domain';

export function RevisionWork({ items }: { items: NonNullable<MyWork['revisionRequests']> }) {
  return <Table rowKey="id" dataSource={items} pagination={false} scroll={{ x: 760 }} locale={{ emptyText: 'Không có yêu cầu cập nhật lại' }} columns={[
    { title: 'Chỉ tiêu', key: 'target', render: (_, item) => <div className="cell-title"><Link to={`/admin/targets/${item.target.id}`}>{item.target.title}</Link><span>Cập nhật lại số liệu kỳ {item.periodLabel || item.periodKey}</span></div> },
    { title: 'Lý do', dataIndex: 'reason' },
    { title: 'Yêu cầu lúc', dataIndex: 'requestedAt', width: 160, render: value => dateTime(value) },
    { key: 'action', width: 120, fixed: 'right', render: (_, item) => <Link to={`/admin/targets/${item.target.id}?bao-cao=${encodeURIComponent(item.periodKey || '1')}`}><Button type="primary" size="small">Cập nhật lại</Button></Link> },
  ]} />;
}
