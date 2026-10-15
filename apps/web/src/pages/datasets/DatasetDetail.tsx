import { DeleteOutlined, DownloadOutlined, EditOutlined, FileExcelOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, Card, Checkbox, DatePicker, Descriptions, Form, Input, InputNumber, Modal, Popconfirm, Result, Select, Space, Table, Tabs, Tag, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMe } from '@/app/session';
import { Page } from '@/components/Page';
import { LoadError, PageSkeleton } from '@/components/States';
import { useAction, useApi } from '@/hooks/useApi';
import { http } from '@/lib/api';
import { dateTime, fromNow, num } from '@/lib/format';
import { can, DATASET_ADMINS } from '@/lib/roles';
import type { DatasetColumn } from '@/types/domain';
import { cellText, DatasetForm, downloadTemplate, ImportModal, TYPE_LABEL, useRecomputedNotice, type DatasetDetail as Detail, type Recomputed } from './shared';

type Row = { id: string; data: Record<string, unknown>; version: number; createdAt?: string; updatedAt?: string; createdBy?: string | null; updatedBy?: string | null; readOnly?: boolean };
const PAGE = 50;

function fieldFor(column: DatasetColumn) {
  switch (column.type) {
    case 'number':
      return <InputNumber style={{ width: '100%' }} decimalSeparator="," />;
    case 'date':
      return <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />;
    case 'boolean':
      return <Checkbox>Có</Checkbox>;
    case 'enum':
      return <Select allowClear options={(column.options ?? []).map(option => ({ value: option, label: option }))} />;
    default:
      return <Input />;
  }
}

function RowModal({ dataset, row, open, onClose }: { dataset: Detail; row: Row | null; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm();
  const notify = useRecomputedNotice();
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (row) {
      const values: Record<string, unknown> = {};
      for (const column of dataset.columns) {
        const value = row.data[column.key];
        values[column.key] = column.type === 'date' && typeof value === 'string' ? dayjs(value) : value;
      }
      form.setFieldsValue(values);
    }
  }, [open, row, dataset, form]);

  const save = useAction(
    (values: Record<string, unknown>) => {
      const data: Record<string, unknown> = {};
      for (const column of dataset.columns) {
        const value = values[column.key];
        data[column.key] = column.type === 'boolean' ? Boolean(value) : dayjs.isDayjs(value) ? value.format('YYYY-MM-DD') : value === undefined || value === '' ? null : value;
      }
      const path = `/datasets/${encodeURIComponent(dataset.code)}/rows${row ? `/${row.id}` : ''}`;
      return row ? http.patch<{ recomputed?: Recomputed[] }>(path, { data, expectedVersion: row.version }) : http.post<{ recomputed?: Recomputed[] }>(path, { data });
    },
    {
      success: row ? 'Đã cập nhật dòng' : 'Đã thêm dòng',
      refresh: ['/datasets', '/targets', '/ioc'],
      onDone: result => {
        notify(result?.recomputed);
        onClose();
      },
    },
  );

  return (
    <Modal title={row ? 'Sửa dòng dữ liệu' : 'Thêm dòng dữ liệu'} open={open} onCancel={onClose} onOk={() => form.submit()} okText="Lưu" confirmLoading={save.isPending} width={dataset.columns.length > 6 ? 760 : 560} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={values => save.mutate(values)} className={dataset.columns.length > 6 ? 'form-grid' : undefined}>
        {dataset.columns.map(column => (
          <Form.Item
            key={column.key}
            name={column.key}
            label={column.label}
            valuePropName={column.type === 'boolean' ? 'checked' : 'value'}
            initialValue={column.type === 'boolean' ? false : undefined}
            rules={column.required && column.type !== 'boolean' ? [{ required: true, message: 'Bắt buộc' }] : []}
          >
            {fieldFor(column)}
          </Form.Item>
        ))}
      </Form>
    </Modal>
  );
}

export default function DatasetDetail() {
  const { code = '' } = useParams();
  const user = useMe();
  const { message } = App.useApp();
  const notify = useRecomputedNotice();
  const list = useApi<Detail[]>('/datasets');
  const dataset = list.data?.find(item => item.code === code);
  const [page, setPage] = useState(1);
  const rows = useApi<{ total: number; rows: Row[] }>(dataset ? `/datasets/${encodeURIComponent(code)}/rows?take=${PAGE}&skip=${(page - 1) * PAGE}` : null, { keepPrevious: true });
  const [editing, setEditing] = useState<Row | null | undefined>(undefined);
  const [importing, setImporting] = useState(false);
  const [editingDataset, setEditingDataset] = useState(false);
  const remove = useAction((row: Row) => http.delete<{ recomputed?: Recomputed[] }>(`/datasets/${encodeURIComponent(code)}/rows/${row.id}`), {
    success: 'Đã xoá dòng',
    refresh: ['/datasets', '/targets', '/ioc'],
    onDone: result => notify(result?.recomputed),
  });

  if (list.error && !list.data) return <LoadError error={list.error} retry={() => void list.refetch()} />;
  if (!list.data) return <PageSkeleton />;
  if (!dataset)
    return (
      <Result
        status="404"
        title="Không tìm thấy bảng dữ liệu"
        extra={
          <Link to="/admin/kho-du-lieu">
            <Button>Về kho dữ liệu</Button>
          </Link>
        }
      />
    );

  const editable = dataset.canEdit && !dataset.builtin;
  const columns = [
    ...dataset.columns.map(column => ({
      title: column.label,
      key: column.key,
      width: column.type === 'text' ? 200 : 130,
      align: column.type === 'number' ? ('right' as const) : undefined,
      render: (_: unknown, row: Row) => <span className={column.type === 'number' ? 'num' : undefined}>{cellText(column, row.data[column.key])}</span>,
    })),
    {
      title: 'Cập nhật',
      key: 'updated',
      width: 170,
      render: (_: unknown, row: Row) =>
        row.updatedAt || row.createdAt ? (
          <Tooltip title={dateTime(row.updatedAt ?? row.createdAt)}>
            <div className="cell-title">
              <span style={{ color: 'var(--ioc-color-text)', fontSize: 13 }}>{row.updatedBy ?? row.createdBy ?? '—'}</span>
              <span>{fromNow(row.updatedAt ?? row.createdAt)}</span>
            </div>
          </Tooltip>
        ) : null,
    },
    ...(editable
      ? [
          {
            key: 'actions',
            width: 90,
            fixed: 'right' as const,
            render: (_: unknown, row: Row) =>
              !row.readOnly && (
                <Space size={0}>
                  <Button type="text" size="small" icon={<EditOutlined />} onClick={() => setEditing(row)} aria-label="Sửa" />
                  <Popconfirm title="Xoá dòng này?" okText="Xoá" okButtonProps={{ danger: true }} onConfirm={() => remove.mutateAsync(row)}>
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label="Xoá" />
                  </Popconfirm>
                </Space>
              ),
          },
        ]
      : []),
  ];

  return (
    <Page
      breadcrumb={[{ label: 'Kho dữ liệu', to: '/admin/kho-du-lieu' }, { label: dataset.name }]}
      title={dataset.name}
      tags={dataset.builtin ? <Tag>Dữ liệu hệ thống</Tag> : <Tag color="blue">Tự khai báo</Tag>}
      meta={
        <>
          <span>{dataset.code}</span>
          {dataset.ownerDepartment && <span>{dataset.ownerDepartment.name}</span>}
          <span>{num(dataset.rowCount ?? rows.data?.total ?? 0)} dòng</span>
          {dataset.lastDataAt && <span>Dữ liệu mới nhất {fromNow(dataset.lastDataAt)}</span>}
        </>
      }
      extra={
        (editable || !dataset.builtin) && (
          <>
            {editable && can(user, DATASET_ADMINS) && (
              <Button icon={<EditOutlined />} onClick={() => setEditingDataset(true)}>
                Sửa cấu trúc
              </Button>
            )}
            <Button icon={<DownloadOutlined />} onClick={() => void downloadTemplate(dataset.code, dataset.name, text => message.error(text))}>
              Tải mẫu Excel
            </Button>
            {editable && (
              <Button icon={<FileExcelOutlined />} onClick={() => setImporting(true)}>
                Nhập Excel
              </Button>
            )}
            {editable && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing(null)}>
                Thêm dòng
              </Button>
            )}
          </>
        )
      }
      wide
    >
      <Card className="card-flush card-tabs">
        <Tabs
          items={[
            {
              key: 'rows',
              label: 'Dữ liệu',
              children: rows.error && !rows.data ? (
                <LoadError error={rows.error} retry={() => void rows.refetch()} />
              ) : (
                <Table
                  rowKey="id"
                  size="middle"
                  loading={rows.isLoading || rows.isFetching}
                  dataSource={rows.data?.rows ?? []}
                  columns={columns}
                  scroll={{ x: Math.max(800, dataset.columns.length * 160 + 260) }}
                  pagination={{ current: page, pageSize: PAGE, total: rows.data?.total ?? 0, onChange: setPage, showSizeChanger: false, showTotal: total => `${num(total)} dòng` }}
                  locale={{ emptyText: 'Chưa có dữ liệu' }}
                />
              ),
            },
            {
              key: 'columns',
              label: `Cấu trúc (${dataset.columns.length} cột)`,
              children: (
                <Table
                  rowKey="key"
                  size="middle"
                  pagination={false}
                  dataSource={dataset.columns}
                  columns={[
                    { title: 'Nhãn', dataIndex: 'label' },
                    { title: 'Mã cột', dataIndex: 'key', width: 200, render: value => <code>{value}</code> },
                    { title: 'Kiểu', dataIndex: 'type', width: 140, render: (value: DatasetColumn['type']) => TYPE_LABEL[value] },
                    { title: 'Bắt buộc', dataIndex: 'required', width: 110, render: value => (value ? 'Có' : '—') },
                    { title: 'Giá trị danh mục', dataIndex: 'options', render: (value?: string[]) => value?.join(', ') || '—' },
                  ]}
                />
              ),
            },
            {
              key: 'used',
              label: `Chỉ tiêu dùng (${dataset.usedBy.length})`,
              children: (
                <Table
                  rowKey="id"
                  size="middle"
                  pagination={false}
                  dataSource={dataset.usedBy}
                  locale={{ emptyText: 'Chưa có chỉ tiêu tự tính từ bảng này' }}
                  columns={[
                    { title: 'Chỉ tiêu', key: 'title', render: (_, target) => <Link to={`/admin/targets/${target.id}`}>{target.title}</Link> },
                    { title: 'Mã', dataIndex: 'code', width: 200 },
                    { title: 'Bộ chỉ tiêu', dataIndex: 'framework', width: 360, render: value => value || '—' },
                  ]}
                />
              ),
            },
            {
              key: 'info',
              label: 'Thông tin',
              children: (
                <div className="tab-body">
                  <Descriptions
                    bordered
                    size="small"
                    column={1}
                    items={[
                      { label: 'Mô tả', children: dataset.description || '—' },
                      { label: 'Phòng quản lý', children: dataset.ownerDepartment?.name ?? '—' },
                      { label: 'Chu kỳ cập nhật', children: dataset.updateCycle || '—' },
                      { label: 'Hệ thống nguồn', children: dataset.sourceSystem || '—' },
                      { label: 'Cách thu thập', children: <span className="pre-line">{dataset.collectionGuide || '—'}</span> },
                    ]}
                  />
                </div>
              ),
            },
          ]}
        />
      </Card>
      <RowModal dataset={dataset} row={editing ?? null} open={editing !== undefined} onClose={() => setEditing(undefined)} />
      <ImportModal dataset={dataset} open={importing} onClose={() => setImporting(false)} />
      <DatasetForm open={editingDataset} item={dataset} onClose={() => setEditingDataset(false)} />
    </Page>
  );
}
