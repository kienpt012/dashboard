import { ArrowDownOutlined, ArrowUpOutlined, EditOutlined, EyeOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { Badge, Button, Card, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Tag, Tooltip } from 'antd';
import { useEffect, useState } from 'react';
import { fold } from '@/app/nav';
import { Page } from '@/components/Page';
import { LoadError } from '@/components/States';
import { useAction, useApi } from '@/hooks/useApi';
import { departmentOptions, useDepartments } from '@/hooks/useRefs';
import { http } from '@/lib/api';
import { roleLabel, ROLES } from '@/lib/roles';
import { APP_ICONS, WorkAppIcon } from '../workspace/DeskApps';
import { safeShortcut } from '../workspace/model';
import type { WorkApp } from '../workspace/desk-api';

function appBody(app: WorkApp) {
  return { name: app.name, url: app.url, icon: app.icon, color: app.color, group: app.group, description: app.description, roles: app.roles, departmentIds: app.departmentIds, sortOrder: app.sortOrder, isActive: app.isActive, badgeUrl: app.badgeUrl || undefined, badgePath: app.badgePath || undefined };
}

function AppEditor({ item, onClose }: { item: WorkApp | null | undefined; onClose: () => void }) {
  const [form] = Form.useForm();
  const departments = useDepartments();
  const values = Form.useWatch([], form) as Partial<WorkApp> | undefined;
  useEffect(() => { if (item !== undefined) { form.resetFields(); form.setFieldsValue(item ? appBody(item) : { icon: 'global', color: '#2563eb', group: 'Công vụ', roles: [], departmentIds: [], sortOrder: 100, isActive: true, description: '' }); } }, [item, form]);
  const save = useAction((data: WorkApp) => item ? http.put(`/workspace/apps/admin/${item.id}`, data) : http.post('/workspace/apps/admin', data), { success: 'Đã lưu ứng dụng', refresh: ['/workspace/apps'], onDone: onClose });
  const options = Object.keys(APP_ICONS).map(key => ({ value: key, label: <Space>{APP_ICONS[key as keyof typeof APP_ICONS]}{({ global: 'Website', mail: 'Thư', bank: 'Cơ quan', document: 'Văn bản', inbox: 'Công việc', approval: 'Duyệt', message: 'Trao đổi', bell: 'Thông báo', team: 'Cán bộ', link: 'Liên kết' } as Record<string, string>)[key]}</Space> }));
  return <Modal title={item ? 'Sửa ứng dụng công vụ' : 'Thêm ứng dụng công vụ'} open={item !== undefined} onCancel={onClose} onOk={() => form.submit()} confirmLoading={save.isPending} okText="Lưu" cancelText="Hủy" width={720} destroyOnHidden>
    <Form layout="vertical" form={form} onFinish={data => save.mutate({ ...data, badgeUrl: data.badgeUrl || undefined, badgePath: data.badgePath || undefined })} className="form-grid">
      <Form.Item name="name" label="Tên ứng dụng" rules={[{ required: true, whitespace: true }, { max: 80 }]}><Input maxLength={80} /></Form.Item><Form.Item name="group" label="Nhóm" rules={[{ required: true, whitespace: true }, { max: 80 }]}><Input maxLength={80} /></Form.Item>
      <Form.Item name="url" label="Địa chỉ" className="span-2" rules={[{ required: true }, { validator: async (_, value) => { if (!/^https?:\/\//.test(value || '') || !safeShortcut(value)) throw new Error('Nhập địa chỉ HTTP hoặc HTTPS hợp lệ'); } }]}><Input maxLength={2048} placeholder="https://" /></Form.Item>
      <Form.Item name="icon" label="Biểu tượng hoặc chữ viết tắt" rules={[{ required: true }, { max: 40 }]}><Select showSearch options={options} popupRender={menu => <>{menu}<div style={{ padding: 8 }}><Input maxLength={3} placeholder="Chữ viết tắt, tối đa 3 ký tự" onChange={e => form.setFieldValue('icon', e.target.value)} /></div></>} /></Form.Item><Form.Item name="color" label="Màu biểu tượng" rules={[{ required: true }, { pattern: /^#[0-9a-f]{6}$/i }]}><Input type="color" /></Form.Item>
      <Form.Item name="description" label="Công dụng" className="span-2" rules={[{ max: 200 }]}><Input.TextArea showCount maxLength={200} autoSize={{ minRows: 2, maxRows: 4 }} /></Form.Item>
      <Form.Item name="roles" label="Vai trò" tooltip="Để trống cùng với phòng ban: mọi người được dùng"><Select mode="multiple" options={ROLES.map(role => ({ value: role, label: roleLabel[role] }))} /></Form.Item><Form.Item name="departmentIds" label="Phòng ban"><Select mode="multiple" options={departmentOptions(departments.data)} /></Form.Item>
      <Form.Item name="sortOrder" label="Thứ tự" rules={[{ required: true }]}><InputNumber min={0} max={10000} /></Form.Item><Form.Item name="isActive" label="Đang dùng" valuePropName="checked"><Switch /></Form.Item>
      <Form.Item name="badgeUrl" label="Nguồn huy hiệu JSON" rules={[{ validator: async (_, value) => { if (value && !/^https:\/\//.test(value)) throw new Error('Nguồn huy hiệu phải dùng HTTPS'); } }]}><Input maxLength={2048} placeholder="https://" /></Form.Item><Form.Item name="badgePath" label="Đường dẫn trường số"><Input maxLength={200} placeholder="Ví dụ: data.pending" /></Form.Item>
      <div className="span-2 desk-app-preview"><strong>Xem trước</strong><Tooltip title={values?.description}><span><WorkAppIcon icon={values?.icon || 'global'} color={values?.color || '#2563eb'} />{values?.name || 'Tên ứng dụng'}</span></Tooltip></div>
    </Form>
  </Modal>;
}

export default function WorkApps() {
  const list = useApi<WorkApp[]>('/workspace/apps/admin');
  const departments = useDepartments();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<WorkApp | null | undefined>(undefined);
  const update = useAction((app: WorkApp) => http.put(`/workspace/apps/admin/${app.id}`, appBody(app)), { success: 'Đã cập nhật ứng dụng', refresh: ['/workspace/apps'] });
  const reorder = useAction(async ({ app, direction }: { app: WorkApp; direction: number }) => { const all = [...(list.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)); const index = all.findIndex(row => row.id === app.id); const next = index + direction; if (next < 0 || next >= all.length) return; [all[index], all[next]] = [all[next], all[index]]; for (let i = 0; i < all.length; i++) { if (all[i].sortOrder !== i * 10) await http.put(`/workspace/apps/admin/${all[i].id}`, { ...appBody(all[i]), sortOrder: i * 10 }); } }, { success: 'Đã sắp thứ tự', refresh: ['/workspace/apps'] });
  const rows = [...(list.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)).filter(app => fold(`${app.name} ${app.group}`).includes(fold(search)));
  return <Page title="Ứng dụng công vụ" meta={`${list.data?.length ?? 0} ứng dụng`} extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing(null)}>Thêm ứng dụng</Button>}><Card className="card-flush"><div className="table-filters"><Input prefix={<SearchOutlined />} placeholder="Tên ứng dụng, nhóm" aria-label="Tìm ứng dụng công vụ" value={search} onChange={e => setSearch(e.target.value)} allowClear style={{ maxWidth: 340 }} /></div>{list.error ? <LoadError error={list.error} retry={() => void list.refetch()} /> : <Table rowKey="id" loading={list.isLoading} dataSource={rows} pagination={false} scroll={{ x: 950 }} columns={[
    { title: 'Ứng dụng', width: 270, render: (_, app) => <div className="desk-app-table-name"><WorkAppIcon icon={app.icon} color={app.color} /><div><strong>{app.name}</strong><small>{app.description}</small></div></div> },
    { title: 'Nhóm', dataIndex: 'group', width: 140 },
    { title: 'Đối tượng', render: (_, app) => !app.roles.length && !app.departmentIds.length ? 'Mọi người' : <div>{app.roles.map(role => <Tag key={role}>{roleLabel[role]}</Tag>)}{app.departmentIds.map(id => <Tag key={id}>{departments.data?.find(d => d.id === id)?.name || 'Phòng ban'}</Tag>)}</div> },
    { title: 'Trạng thái', width: 140, render: (_, app) => <Switch checked={app.isActive} checkedChildren="Đang dùng" unCheckedChildren="Đã ẩn" loading={update.isPending} onChange={isActive => update.mutate({ ...app, isActive })} aria-label={`Trạng thái ${app.name}`} /> },
    { title: 'Huy hiệu', width: 100, render: (_, app) => <Badge status={app.badgeUrl ? 'processing' : 'default'} text={app.badgeUrl ? 'Đã cấu hình' : 'Chưa có'} /> },
    { title: 'Thao tác', width: 180, render: (_, app) => <Space size={0}><Button type="text" icon={<ArrowUpOutlined />} aria-label={`Đưa ${app.name} lên`} disabled={reorder.isPending || list.data?.length === 1} onClick={() => reorder.mutate({ app, direction: -1 })} /><Button type="text" icon={<ArrowDownOutlined />} aria-label={`Đưa ${app.name} xuống`} disabled={reorder.isPending || list.data?.length === 1} onClick={() => reorder.mutate({ app, direction: 1 })} /><Tooltip title="Mở ứng dụng"><Button type="text" icon={<EyeOutlined />} aria-label={`Mở ${app.name}`} href={safeShortcut(app.url) ? app.url : undefined} target="_blank" rel="noopener noreferrer" /></Tooltip><Button type="text" icon={<EditOutlined />} aria-label={`Sửa ${app.name}`} onClick={() => setEditing(app)} /></Space> },
  ]} />}</Card><AppEditor item={editing} onClose={() => setEditing(undefined)} /></Page>;
}
