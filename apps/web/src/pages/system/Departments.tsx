import { EditOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { Badge, Button, Card, ColorPicker, Form, Input, InputNumber, Modal, Select, Switch, Table, Tag } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMe } from '@/app/session';
import { TitleCell } from '@/components/Data';
import { FilterBar, Page } from '@/components/Page';
import { LoadError } from '@/components/States';
import { useAction } from '@/hooks/useApi';
import { useDepartments } from '@/hooks/useRefs';
import { http } from '@/lib/api';
import { num } from '@/lib/format';
import { can, ADMINS, isGlobal } from '@/lib/roles';
import type { Department } from '@/types/core';
import { byNumber, byText, NUMBER_FIRST } from '@/lib/sort';

type Kind = 'LEADERSHIP' | 'OFFICE' | 'SPECIALIZED' | 'CENTER' | 'OTHER';
export const DEPARTMENT_KIND: Record<Kind, string> = {
  LEADERSHIP: 'Lãnh đạo UBND',
  OFFICE: 'Văn phòng',
  SPECIALIZED: 'Phòng chuyên môn',
  CENTER: 'Trung tâm, đơn vị sự nghiệp',
  OTHER: 'Cơ quan, tổ chức phối hợp',
};

function DepartmentForm({ open, item, onClose }: { open: boolean; item?: Department | null; onClose: () => void }) {
  const [form] = Form.useForm();
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(
      item
        ? { code: item.code, name: item.name, shortName: item.shortName ?? '', kind: item.kind ?? 'SPECIALIZED', color: item.color, description: item.description ?? '', responsibilities: item.responsibilities ?? '', sortOrder: item.sortOrder ?? 0, isActive: item.isActive }
        : { kind: 'SPECIALIZED', color: '#2563eb', sortOrder: 100, isActive: true },
    );
  }, [open, item, form]);

  const save = useAction(
    (values: Record<string, unknown>) => {
      const color = typeof values.color === 'string' ? values.color : (values.color as { toHexString: () => string }).toHexString();
      const body = { ...values, color };
      return item ? http.patch(`/departments/${item.id}`, { ...body, expectedVersion: item.version }) : http.post('/departments', body);
    },
    { success: item ? 'Đã cập nhật phòng ban' : 'Đã thêm phòng ban', refresh: ['/departments', '/ioc'], onDone: onClose },
  );

  return (
    <Modal title={item ? `Sửa ${item.name}` : 'Thêm phòng ban'} open={open} onCancel={onClose} onOk={() => form.submit()} okText="Lưu" confirmLoading={save.isPending} width={680} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={values => save.mutate(values)} className="form-grid">
        <Form.Item name="code" label="Mã" rules={[{ required: true, max: 30, pattern: /^[A-Za-z0-9_-]+$/, message: 'Chữ, số, gạch ngang, gạch dưới' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="shortName" label="Tên ngắn">
          <Input maxLength={80} />
        </Form.Item>
        <Form.Item name="name" label="Tên đầy đủ" className="span-2" rules={[{ required: true, max: 160 }]}>
          <Input />
        </Form.Item>
        <Form.Item name="kind" label="Loại đơn vị">
          <Select options={Object.entries(DEPARTMENT_KIND).map(([value, label]) => ({ value, label }))} />
        </Form.Item>
        <Form.Item name="sortOrder" label="Thứ tự">
          <InputNumber min={0} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="color" label="Màu nhận diện">
          <ColorPicker showText format="hex" disabledAlpha />
        </Form.Item>
        {item && (
          <Form.Item name="isActive" label="Đang hoạt động" valuePropName="checked">
            <Switch />
          </Form.Item>
        )}
        <Form.Item name="responsibilities" label="Lĩnh vực phụ trách" className="span-2">
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} maxLength={1000} />
        </Form.Item>
        <Form.Item name="description" label="Ghi chú" className="span-2">
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={1000} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default function Departments() {
  const user = useMe();
  const admin = can(user, ADMINS);
  const list = useDepartments();
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<Department | null | undefined>(undefined);
  const rows = useMemo(() => {
    const needle = text.trim().toLocaleLowerCase('vi');
    return (list.data ?? []).filter(item => !needle || `${item.code} ${item.name} ${item.shortName ?? ''} ${item.responsibilities ?? ''}`.toLocaleLowerCase('vi').includes(needle));
  }, [list.data, text]);

  return (
    <Page
      title={isGlobal(user) ? 'Phòng ban' : 'Thông tin phòng'}
      meta={list.data && <span>{num(list.data.length)} đơn vị</span>}
      extra={
        admin && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing(null)}>
            Thêm phòng ban
          </Button>
        )
      }
    >
      <Card className="card-flush">
        {list.data && list.data.length > 5 && (
          <div className="table-filters">
            <FilterBar search={<Input allowClear prefix={<SearchOutlined />} placeholder="Tên, mã, lĩnh vực" value={text} onChange={event => setText(event.target.value)} style={{ width: '100%', maxWidth: 300 }} />} filters={null} />
          </div>
        )}
        {list.error && !list.data ? (
          <LoadError error={list.error} retry={() => void list.refetch()} />
        ) : (
          <Table
            rowKey="id"
            loading={list.isLoading}
            dataSource={rows}
            pagination={false}
            scroll={{ x: 900 }}
            expandable={{
              expandedRowRender: item => <div className="expand-panel pre-line">{item.responsibilities || item.description || '—'}</div>,
              rowExpandable: item => Boolean(item.responsibilities || item.description),
            }}
            columns={[
              {
                title: 'Đơn vị',
                key: 'name',
                sorter: byText(item => item.name),
                render: (_, item) => (
                  <TitleCell
                    title={
                      <span className="dept-tag">
                        <i style={{ background: item.color }} />
                        {item.name}
                      </span>
                    }
                    sub={[item.code, item.shortName].filter(Boolean).join(' · ')}
                  />
                ),
              },
              { title: 'Loại', dataIndex: 'kind', width: 220, sorter: byText(item => (item.kind ? (DEPARTMENT_KIND[item.kind as Kind] ?? item.kind) : '')), render: (value: Kind) => (value ? DEPARTMENT_KIND[value] ?? value : '—') },
              { title: 'Cán bộ', key: 'users', width: 116, align: 'center', sorter: byNumber(item => item._count?.users ?? 0), sortDirections: NUMBER_FIRST, render: (_, item) => num(item._count?.users ?? 0) },
              {
                title: 'Chỉ tiêu',
                key: 'targets',
                width: 116,
                align: 'center',
                sorter: byNumber(item => item._count?.targets ?? 0),
                sortDirections: NUMBER_FIRST,
                render: (_, item) => <Link to={`/admin/targets?departmentId=${item.id}`}>{num(item._count?.targets ?? 0)}</Link>,
              },
              { title: 'Phản ánh', key: 'feedbacks', width: 120, align: 'center', sorter: byNumber(item => item._count?.feedbacks ?? 0), sortDirections: NUMBER_FIRST, render: (_, item) => num(item._count?.feedbacks ?? 0) },
              { title: 'Trạng thái', dataIndex: 'isActive', width: 130, sorter: byNumber(item => (item.isActive ? 0 : 1)), render: value => (value ? <Badge status="success" text="Hoạt động" /> : <Tag>Ngừng</Tag>) },
              ...(admin
                ? [
                    {
                      key: 'edit',
                      width: 60,
                      render: (_: unknown, item: Department) => <Button type="text" icon={<EditOutlined />} onClick={() => setEditing(item)} aria-label="Sửa" />,
                    },
                  ]
                : []),
            ]}
          />
        )}
      </Card>
      <DepartmentForm open={editing !== undefined} item={editing} onClose={() => setEditing(undefined)} />
    </Page>
  );
}
