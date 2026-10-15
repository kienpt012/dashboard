import { EditOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { Avatar, Badge, Button, Card, Form, Input, Modal, Select, Switch, Table, Tag, Tooltip } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { TitleCell } from '@/components/Data';
import { FilterBar, Page } from '@/components/Page';
import { LoadError } from '@/components/States';
import { useAction, useApi } from '@/hooks/useApi';
import { departmentOptions, useDepartments } from '@/hooks/useRefs';
import { http } from '@/lib/api';
import { dateTime, fromNow, num } from '@/lib/format';
import { GLOBAL, initials, roleLabel, ROLES } from '@/lib/roles';
import type { Role, User } from '@/types/core';
import { STRONG_PASSWORD, STRONG_PASSWORD_RULE } from '../auth/ForgotPassword';

const ROLE_COLOR: Record<Role, string> = { ADMIN: 'red', LEADER: 'volcano', CLERK: 'purple', MANAGER: 'blue', STAFF: 'default', VIEWER: 'default' };

function UserForm({ open, item, onClose }: { open: boolean; item?: User | null; onClose: () => void }) {
  const [form] = Form.useForm();
  const departments = useDepartments();
  const role = Form.useWatch('role', form) as Role | undefined;
  const needsDepartment = role ? !GLOBAL.includes(role) : false;

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(
      item
        ? { fullName: item.fullName, email: item.email ?? '', role: item.role, position: item.position ?? '', departmentId: item.departmentId ?? undefined, isActive: item.isActive }
        : { role: 'STAFF' },
    );
  }, [open, item, form]);

  const save = useAction(
    (values: Record<string, unknown>) => {
      const body = {
        ...values,
        email: (values.email as string)?.trim() || (item ? null : undefined),
        position: (values.position as string)?.trim() || (item ? null : undefined),
        departmentId: needsDepartment ? values.departmentId : item ? null : undefined,
        password: (values.password as string) || undefined,
      };
      return item ? http.patch(`/users/${item.id}`, { ...body, expectedVersion: item.version }) : http.post('/users', body);
    },
    { success: item ? 'Đã cập nhật tài khoản' : 'Đã tạo tài khoản', refresh: ['/users', '/departments'], onDone: onClose },
  );

  return (
    <Modal title={item ? `Sửa tài khoản ${item.username}` : 'Tạo tài khoản'} open={open} onCancel={onClose} onOk={() => form.submit()} okText="Lưu" confirmLoading={save.isPending} width={680} destroyOnHidden>
      <Form form={form} layout="vertical" requiredMark="optional" onFinish={values => save.mutate(values)} className="form-grid" autoComplete="off">
        {!item && (
          <Form.Item name="username" label="Tên đăng nhập" rules={[{ required: true, min: 3, max: 50, pattern: /^[A-Za-z0-9._-]+$/, message: 'Chữ, số, dấu chấm, gạch ngang, gạch dưới' }]}>
            <Input autoComplete="off" />
          </Form.Item>
        )}
        <Form.Item name="fullName" label="Họ và tên" rules={[{ required: true, min: 2, max: 160 }]}>
          <Input />
        </Form.Item>
        <Form.Item name="role" label="Vai trò" rules={[{ required: true }]}>
          <Select options={ROLES.map(value => ({ value, label: roleLabel[value] }))} />
        </Form.Item>
        <Form.Item name="departmentId" label="Phòng ban" rules={[{ required: needsDepartment, message: 'Chọn phòng ban' }]}>
          <Select allowClear disabled={!needsDepartment} options={departmentOptions(departments.data)} placeholder={needsDepartment ? undefined : 'Toàn địa phương'} />
        </Form.Item>
        <Form.Item name="position" label="Chức vụ">
          <Input maxLength={160} />
        </Form.Item>
        <Form.Item name="email" label="Email công vụ" rules={[{ type: 'email', message: 'Email không hợp lệ' }]}>
          <Input />
        </Form.Item>
        <Form.Item
          name="password"
          label={item ? 'Đặt lại mật khẩu' : 'Mật khẩu'}
          extra={STRONG_PASSWORD_RULE}
          rules={[{ required: !item, message: 'Nhập mật khẩu' }, { pattern: STRONG_PASSWORD, message: 'Mật khẩu chưa đủ mạnh' }]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        {item && (
          <Form.Item name="isActive" label="Đang hoạt động" valuePropName="checked">
            <Switch />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}

export default function Users() {
  const list = useApi<User[]>('/users');
  const departments = useDepartments();
  const [text, setText] = useState('');
  const [role, setRole] = useState<Role>();
  const [departmentId, setDepartmentId] = useState<string>();
  const [editing, setEditing] = useState<User | null | undefined>(undefined);

  const rows = useMemo(() => {
    const needle = text.trim().toLocaleLowerCase('vi');
    return (list.data ?? []).filter(
      item =>
        (!role || item.role === role) &&
        (!departmentId || item.departmentId === departmentId) &&
        (!needle || `${item.username} ${item.fullName} ${item.email ?? ''} ${item.position ?? ''}`.toLocaleLowerCase('vi').includes(needle)),
    );
  }, [list.data, text, role, departmentId]);

  return (
    <Page
      title="Tài khoản"
      meta={list.data && <span>{num(list.data.length)} tài khoản · {num(list.data.filter(item => item.isActive).length)} đang hoạt động</span>}
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing(null)}>
          Tạo tài khoản
        </Button>
      }
      wide
    >
      <Card className="card-flush">
        <div className="table-filters">
          <FilterBar
            active={[role, departmentId].filter(Boolean).length}
            search={<Input allowClear prefix={<SearchOutlined />} placeholder="Tên, tên đăng nhập, email" value={text} onChange={event => setText(event.target.value)} style={{ width: '100%', maxWidth: 280 }} />}
            filters={
              <>
                <Select allowClear placeholder="Vai trò" value={role} onChange={setRole} options={ROLES.map(value => ({ value, label: roleLabel[value] }))} style={{ width: 180 }} />
                <Select allowClear placeholder="Phòng ban" value={departmentId} onChange={setDepartmentId} options={departmentOptions(departments.data, false)} style={{ width: 220 }} popupMatchSelectWidth={false} />
              </>
            }
          />
        </div>
        {list.error && !list.data ? (
          <LoadError error={list.error} retry={() => void list.refetch()} />
        ) : (
          <Table
            rowKey="id"
            loading={list.isLoading}
            dataSource={rows}
            scroll={{ x: 1000 }}
            pagination={{ defaultPageSize: 20, showSizeChanger: true, showTotal: total => `${num(total)} tài khoản` }}
            columns={[
              {
                title: 'Cán bộ',
                key: 'name',
                width: 260,
                render: (_, item) => (
                  <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <Avatar size={32} className="user-avatar">
                      {initials(item.fullName)}
                    </Avatar>
                    <Tooltip title={item.email || undefined}>
                      <TitleCell title={item.fullName} sub={item.username} />
                    </Tooltip>
                  </span>
                ),
              },
              { title: 'Vai trò', dataIndex: 'role', width: 160, render: (value: Role) => <Tag color={ROLE_COLOR[value]}>{roleLabel[value]}</Tag> },
              { title: 'Chức vụ', dataIndex: 'position', width: 220, render: value => value || <span className="muted">—</span> },
              { title: 'Phòng ban', key: 'dept', width: 220, render: (_, item) => item.department?.name ?? <span className="muted">Toàn địa phương</span> },
              {
                title: 'Đăng nhập gần nhất',
                dataIndex: 'lastLoginAt',
                width: 160,
                render: value => (value ? <Tooltip title={dateTime(value)}>{fromNow(value)}</Tooltip> : <span className="muted">Chưa đăng nhập</span>),
              },
              { title: 'Trạng thái', dataIndex: 'isActive', width: 120, render: value => (value ? <Badge status="success" text="Hoạt động" /> : <Badge status="default" text="Đã khoá" />) },
              { key: 'edit', width: 56, fixed: 'right', render: (_, item) => <Button type="text" icon={<EditOutlined />} onClick={() => setEditing(item)} aria-label="Sửa" /> },
            ]}
          />
        )}
      </Card>
      <UserForm open={editing !== undefined} item={editing} onClose={() => setEditing(undefined)} />
    </Page>
  );
}
