import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Card, Input, Popover, Segmented, Table, Tag } from 'antd';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMe } from '@/app/session';
import { TitleCell } from '@/components/Data';
import { FilterBar, Page } from '@/components/Page';
import { LoadError } from '@/components/States';
import { useApi } from '@/hooks/useApi';
import { dateTime, fromNow, num } from '@/lib/format';
import { can, DATASET_ADMINS } from '@/lib/roles';
import { DatasetForm, type DatasetDetail } from './shared';

export default function Datasets() {
  const user = useMe();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [kind, setKind] = useState<'all' | 'builtin' | 'custom'>('all');
  const [creating, setCreating] = useState(false);
  const list = useApi<DatasetDetail[]>('/datasets');

  const rows = useMemo(() => {
    const needle = text.trim().toLocaleLowerCase('vi');
    return (list.data ?? []).filter(item => {
      if (kind === 'builtin' && !item.builtin) return false;
      if (kind === 'custom' && item.builtin) return false;
      return !needle || `${item.code} ${item.name} ${item.ownerDepartment?.name ?? ''}`.toLocaleLowerCase('vi').includes(needle);
    });
  }, [list.data, text, kind]);

  return (
    <Page
      title="Kho dữ liệu"
      meta={list.data && <span>{num(list.data.length)} bảng dữ liệu</span>}
      extra={
        can(user, DATASET_ADMINS) && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
            Tạo bảng dữ liệu
          </Button>
        )
      }
    >
      <Card className="card-flush">
        <div className="table-filters">
          <FilterBar
            active={kind === 'all' ? 0 : 1}
            search={<Input allowClear prefix={<SearchOutlined />} placeholder="Tên, mã bảng, phòng quản lý" value={text} onChange={event => setText(event.target.value)} style={{ width: '100%', maxWidth: 300 }} />}
            filters={
              <Segmented
                value={kind}
                onChange={value => setKind(value as typeof kind)}
                options={[
                  { value: 'all', label: 'Tất cả' },
                  { value: 'builtin', label: 'Dữ liệu hệ thống' },
                  { value: 'custom', label: 'Tự khai báo' },
                ]}
              />
            }
          />
        </div>
        {list.error && !list.data ? (
          <LoadError error={list.error} retry={() => void list.refetch()} />
        ) : (
          <Table
            rowKey="code"
            loading={list.isLoading}
            dataSource={rows}
            scroll={{ x: 980 }}
            pagination={false}
            onRow={item => ({ onClick: () => navigate(`/admin/kho-du-lieu/${item.code}`), className: 'link-row' })}
            columns={[
              { title: 'Bảng dữ liệu', key: 'name', sorter: (a, b) => a.name.localeCompare(b.name, 'vi'), defaultSortOrder: 'ascend', render: (_, item) => <TitleCell title={item.name} sub={item.code} to={`/admin/kho-du-lieu/${item.code}`} /> },
              { title: 'Phòng quản lý', key: 'owner', width: 220, sorter: (a, b) => (a.ownerDepartment?.name ?? '').localeCompare(b.ownerDepartment?.name ?? '', 'vi'), render: (_, item) => item.ownerDepartment?.name ?? <span className="muted">—</span> },
              { title: 'Số dòng', dataIndex: 'rowCount', width: 112, align: 'center', sorter: (a, b) => (a.rowCount ?? -1) - (b.rowCount ?? -1), sortDirections: ['descend', 'ascend'], render: value => (value === null ? <span className="muted">—</span> : <span className="num">{num(value)}</span>) },
              {
                title: 'Dữ liệu mới nhất',
                dataIndex: 'lastDataAt',
                width: 176,
                sorter: (a, b) => (a.lastDataAt ?? '').localeCompare(b.lastDataAt ?? ''),
                render: value => (value ? <span title={dateTime(value)}>{fromNow(value)}</span> : <span className="muted">Chưa có</span>),
              },
              { title: 'Chu kỳ', dataIndex: 'updateCycle', width: 130, sorter: (a, b) => (a.updateCycle ?? '').localeCompare(b.updateCycle ?? '', 'vi'), render: value => value || <span className="muted">—</span> },
              {
                title: 'Chỉ tiêu dùng',
                key: 'used',
                width: 150,
                align: 'center',
                sorter: (a, b) => a.usedBy.length - b.usedBy.length,
                sortDirections: ['descend', 'ascend'],
                render: (_, item) =>
                  item.usedBy.length ? (
                    <Popover
                      title="Chỉ tiêu tự tính từ bảng này"
                      content={
                        <ul className="plain-list" style={{ maxWidth: 420 }}>
                          {item.usedBy.map(target => (
                            <li key={target.id}>
                              <Link to={`/admin/targets/${target.id}`} onClick={event => event.stopPropagation()}>
                                {target.code}
                              </Link>{' '}
                              {target.title}
                            </li>
                          ))}
                        </ul>
                      }
                    >
                      <Tag color="cyan" onClick={event => event.stopPropagation()}>
                        {item.usedBy.length} chỉ tiêu
                      </Tag>
                    </Popover>
                  ) : (
                    <span className="muted">—</span>
                  ),
              },
              { title: 'Loại', key: 'kind', width: 110, sorter: (a, b) => (a.builtin ? 'Hệ thống' : 'Tự khai báo').localeCompare(b.builtin ? 'Hệ thống' : 'Tự khai báo', 'vi'), render: (_, item) => (item.builtin ? <Tag>Hệ thống</Tag> : <Tag color="blue">Tự khai báo</Tag>) },
            ]}
          />
        )}
      </Card>
      <DatasetForm open={creating} onClose={() => setCreating(false)} onSaved={code => navigate(`/admin/kho-du-lieu/${code}`)} />
    </Page>
  );
}
