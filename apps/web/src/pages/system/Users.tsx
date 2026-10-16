import { EditOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { Avatar, Badge, Button, Card, Form, Input, Modal, Select, Switch, Table, Tag, Tooltip } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useMe } from '@/app/session';
import { TitleCell } from '@/components/Data';
import { FilterBar, Page } from '@/components/Page';
import { LoadError } from '@/components/States';
import { useAction, useApi } from '@/hooks/useApi';
import { departmentOptions, useDepartments } from '@/hooks/useRefs';
import { http, session } from '@/lib/api';
import { dateTime, fromNow, num } from '@/lib/format';
import { GLOBAL, initials, roleLabel, ROLES } from '@/lib/roles';
import type { Role, User } from '@/types/core';
import { STRONG_PASSWORD, STRONG_PASSWORD_RULE } from '../auth/ForgotPassword';

const ROLE_COLOR: Record<Role, string> = { ADMIN: 'red', LEADER: 'volcano', CLERK: 'purple', MANAGER: 'blue', STAFF: 'default', VIEWER: 'default' };

function UserForm({ open, item, onClose }: { open: boolean; item?: User | null; onClose: () => void }) {
  const [form] = Form.useForm();
  const departments = useDepartments();
  const me = useMe();
  const self = item?.id === me.id;
  const role = Form.useWatch('role', form) as Role | undefined;
  const needsDepartment = role ? !GLOBAL.includes(role) : false;
  const availableDepartments = (departments.data ?? []).filter(department => department.isActive || department.id === item?.departmentId);
  if (item?.department && !availableDepartments.some(department => department.id === item.departmentId)) availableDepartments.push(item.department);

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
        departmentId: values.role === 'ADMIN' ? null : values.departmentId ?? null,
        password: self ? undefined : (values.password as string) || undefined,
      };
      return item ? http.patch<User>(`/users/${item.id}`, { ...body, expectedVersion: item.version }) : http.post<User>('/users', body);
    },
    {
      success: item ? 'Đã cập nhật tài khoản' : 'Đã tạo tài khoản',
      refresh: ['/users', '/departments'],
      onDone: saved => {
        if (saved.id === me.id) session.setUser({ ...saved, departmentId: saved.departmentId ?? null });
        onClose();
      },
    },
  );

  return (
    <Modal title={item ? `Sửa tài khoản ${item.username}` : 'Tạo tài khoản'} open={open} onCancel={onClose} onOk={() => form.submit()} okText="Lưu" confirmLoading={save.isPending} width={680} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={values => save.mutate(values)} className="form-grid" autoComplete="off">
        {!item && (
          <Form.Item name="username" label="Tên đăng nhập" rules={[{ required: true, min: 3, max: 50, pattern: /^[A-Za-z0-9._-]+$/, message: 'Chữ, số, dấu chấm, gạch ngang, gạch dưới' }]}>
            <Input autoComplete="off" />
          </Form.Item>
        )}
        <Form.Item name="fullName" label="Họ và tên" rules={[{ required: true, min: 2, max: 160 }]}>
          <Input />
        </Form.Item>
        <Form.Item name="role" label="Vai trò" rules={[{ required: true }]}>
          <Select disabled={self} options={ROLES.map(value => ({ value, label: roleLabel[value] }))} />
        </Form.Item>
        <Form.Item name="departmentId" label="Phòng ban" rules={[{ required: needsDepartment, message: 'Chọn phòng ban' }]}>
          <Select allowClear disabled={role === 'ADMIN'} showSearch={{ optionFilterProp: 'label' }} options={availableDepartments.map(department => ({ value: department.id, label: `${department.name}${department.isActive ? '' : ' (đã ngừng)'}`, disabled: !department.isActive }))} placeholder={needsDepartment ? undefined : 'Toàn địa phương'} />
        </Form.Item>
        <Form.Item name="position" label="Chức vụ" rules={[{ max: 120, message: 'Chức vụ không quá 120 ký tự' }]}>
          <Input maxLength={120} />
        </Form.Item>
        <Form.Item name="email" label="Email công vụ" rules={[{ type: 'email', message: 'Email không hợp lệ' }]}>
          <Input />
        </Form.Item>
        {!self && <Form.Item
          name="password"
          label={item ? 'Đặt lại mật khẩu' : 'Mật khẩu'}
          extra={STRONG_PASSWORD_RULE}
          rules={[{ required: !item, message: 'Nhập mật khẩu' }, { pattern: STRONG_PASSWORD, message: 'Mật khẩu chưa đủ mạnh' }]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>}
        {item && (
          <Form.Item name="isActive" label="Đang hoạt động" valuePropName="checked">
            <Switch disabled={self} />
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
                sorter: (a, b) => a.fullName.localeCompare(b.fullName, 'vi'),
                defaultSortOrder: 'ascend',
                render: (_, item) => (
                  <span style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
                    <Avatar size={32} className="user-avatar">
                      {initials(item.fullName)}
                    </Avatar>
                    <Tooltip title={item.email || undefined}>
                      <TitleCell title={item.fullName} sub={item.username} />
                    </Tooltip>
                  </span>
                ),
              },
              { title: 'Vai trò', dataIndex: 'role', width: 160, sorter: (a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role), render: (value: Role) => <Tag color={ROLE_COLOR[value]}>{roleLabel[value]}</Tag> },
              { title: 'Chức vụ', dataIndex: 'position', width: 220, sorter: (a, b) => (a.position ?? '').localeCompare(b.position ?? '', 'vi'), render: value => value || <span className="muted">—</span> },
              { title: 'Phòng ban', key: 'dept', width: 220, sorter: (a, b) => (a.department?.name ?? 'Toàn địa phương').localeCompare(b.department?.name ?? 'Toàn địa phương', 'vi'), render: (_, item) => item.department?.name ?? <span className="muted">Toàn địa phương</span> },
              {
                title: 'Đăng nhập gần nhất',
                dataIndex: 'lastLoginAt',
                width: 190,
                sorter: (a, b) => (a.lastLoginAt ?? '').localeCompare(b.lastLoginAt ?? ''),
                render: value => (value ? <Tooltip title={dateTime(value)}>{fromNow(value)}</Tooltip> : <span className="muted">Chưa đăng nhập</span>),
              },
              { title: 'Trạng thái', dataIndex: 'isActive', width: 120, sorter: (a, b) => Number(b.isActive) - Number(a.isActive), render: value => (value ? <Badge status="success" text="Hoạt động" /> : <Badge status="default" text="Đã khoá" />) },
              { key: 'edit', width: 56, fixed: 'right', render: (_, item) => <Button type="text" icon={<EditOutlined />} onClick={() => setEditing(item)} aria-label="Sửa" /> },
            ]}
          />
        )}
      </Card>
      <UserForm open={editing !== undefined} item={editing} onClose={() => setEditing(undefined)} />
    </Page>
  );
}
