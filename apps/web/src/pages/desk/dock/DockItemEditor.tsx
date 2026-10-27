import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Form, Input, Modal, Segmented, Select } from 'antd';
import { useEffect, useState } from 'react';
import { useMe } from '@/app/session';
import { navItems } from '@/app/nav';
import { can } from '@/lib/roles';
import { DeskIcon, hashColor, ICON_NAMES, SCREEN_ICONS } from '../icons';
import type { DockItem } from '../types';
import { MAX_FOLDER_ITEMS } from '../types';
import { hostOf, isInternalPath, isSafeUrl } from '../urls';

// Hộp sửa một lối tắt: chức năng hệ thống, trang đã lọc (đường dẫn nội bộ có bộ lọc), trang web ngoài, thư mục.

type Kind = 'screen' | 'view' | 'link' | 'folder';
type Values = { kind: Kind; path?: string; url?: string; label: string; icon: string; color: string | null };

const COLORS: (string | null)[] = [null, '#2563eb', '#0891b2', '#059669', '#65a30d', '#d97706', '#dc2626', '#db2777', '#7c3aed', '#475569'];

export const newItemId = () => `i-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function IconPicker({ value, onChange }: { value?: string; onChange?: (value: string) => void }) {
  return (
    <Select
      value={value}
      onChange={onChange}
      showSearch
      options={ICON_NAMES.map(name => ({ value: name, label: <span className="icon-option"><DeskIcon name={name} /> {name}</span> }))}
    />
  );
}

function ColorPick({ value, onChange }: { value?: string | null; onChange?: (value: string | null) => void }) {
  return (
    <div className="bgp-colors">
      {COLORS.map(color => (
        <button
          key={color ?? 'auto'}
          type="button"
          className={`bgp-swatch${color === null ? ' auto' : ''}${(value ?? null) === color ? ' selected' : ''}`}
          style={color ? { background: color } : undefined}
          onClick={() => onChange?.(color)}
          aria-label={color ? `Màu ${color}` : 'Màu tự động'}
        >
          {color === null ? 'Tự động' : null}
        </button>
      ))}
    </div>
  );
}

/** Danh sách lối tắt sửa được (dùng cho thư mục, widget Lối tắt). */
export function LinksEditor({ value = [], onChange, max, allowFolder }: { value?: DockItem[]; onChange?: (items: DockItem[]) => void; max: number; allowFolder: boolean }) {
  const [editing, setEditing] = useState<DockItem | 'new' | null>(null);
  const move = (index: number, delta: number) => {
    const next = [...value];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    onChange?.(next);
  };
  return (
    <div className="links-editor">
      {value.map((item, index) => (
        <div className="links-row" key={item.id}>
          <span className="links-icon" style={{ color: ('color' in item && item.color) || hashColor(item.label) }}>
            <DeskIcon name={item.icon} />
          </span>
          <button type="button" className="links-label" onClick={() => setEditing(item)}>
            <strong>{item.label || (item.kind === 'link' ? hostOf(item.url) : '')}</strong>
            <span>{item.kind === 'link' ? hostOf(item.url) : item.kind === 'folder' ? `${item.items.length} lối tắt` : 'path' in item ? item.path : ''}</span>
          </button>
          <Button size="small" type="text" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Lên">
            ↑
          </Button>
          <Button size="small" type="text" disabled={index === value.length - 1} onClick={() => move(index, 1)} aria-label="Xuống">
            ↓
          </Button>
          <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => onChange?.(value.filter(entry => entry.id !== item.id))} aria-label="Xoá lối tắt" />
        </div>
      ))}
      <Button icon={<PlusOutlined />} block disabled={value.length >= max} onClick={() => setEditing('new')}>
        Thêm lối tắt {value.length >= max ? `(tối đa ${max})` : ''}
      </Button>
      <DockItemEditor
        open={editing !== null}
        value={editing === 'new' ? null : editing}
        allowFolder={allowFolder}
        onCancel={() => setEditing(null)}
        onSave={item => {
          onChange?.(editing === 'new' ? [...value, item] : value.map(entry => (entry.id === item.id ? item : entry)));
          setEditing(null);
        }}
      />
    </div>
  );
}

export function DockItemEditor({
  open,
  value,
  allowFolder,
  onSave,
  onCancel,
}: {
  open: boolean;
  value: DockItem | null;
  allowFolder: boolean;
  onSave: (item: DockItem) => void;
  onCancel: () => void;
}) {
  const user = useMe();
  const [form] = Form.useForm<Values>();
  const [children, setChildren] = useState<DockItem[]>([]);
  const kind = Form.useWatch('kind', form) as Kind | undefined;
  const screens = navItems.filter(item => can(user, item.roles));

  useEffect(() => {
    if (!open) return;
    if (value) {
      form.setFieldsValue({
        kind: value.kind === 'action' ? 'screen' : value.kind,
        path: 'path' in value ? value.path : undefined,
        url: value.kind === 'link' ? value.url : undefined,
        label: value.label,
        icon: value.icon,
        color: 'color' in value ? value.color : null,
      });
      setChildren(value.kind === 'folder' ? value.items : []);
    } else {
      form.resetFields();
      form.setFieldsValue({ kind: 'link', label: '', icon: 'global', color: null });
      setChildren([]);
    }
  }, [open, value, form]);

  const submit = (values: Values) => {
    const id = value?.id ?? newItemId();
    const label = values.label.trim();
    switch (values.kind) {
      case 'screen':
        return onSave({ id, kind: 'screen', path: values.path!, label, icon: values.icon });
      case 'view':
        return onSave({ id, kind: 'view', path: values.path!.trim(), label, icon: values.icon, color: values.color });
      case 'link':
        return onSave({ id, kind: 'link', url: values.url!.trim(), label: label || hostOf(values.url!), icon: values.icon, color: values.color });
      case 'folder':
        return onSave({ id, kind: 'folder', label, icon: values.icon, color: values.color, items: children });
    }
  };

  return (
    <Modal title={value ? 'Sửa lối tắt' : 'Thêm lối tắt'} open={open} onCancel={onCancel} onOk={() => form.submit()} okText="Lưu" cancelText="Huỷ" destroyOnHidden width={520}>
      <Form form={form} layout="vertical" requiredMark={false} onFinish={submit}>
        <Form.Item name="kind">
          <Segmented
            block
            options={[
              { value: 'link', label: 'Trang web ngoài' },
              { value: 'screen', label: 'Chức năng' },
              { value: 'view', label: 'Trang đã lọc' },
              ...(allowFolder ? [{ value: 'folder', label: 'Thư mục' }] : []),
            ]}
          />
        </Form.Item>
        {kind === 'screen' && (
          <Form.Item name="path" label="Chức năng" rules={[{ required: true, message: 'Chọn chức năng' }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={screens.map(item => ({ value: item.path, label: item.label }))}
              onChange={path => {
                const item = screens.find(entry => entry.path === path);
                form.setFieldsValue({ label: item?.label ?? '', icon: SCREEN_ICONS[path] ?? 'link' });
              }}
            />
          </Form.Item>
        )}
        {kind === 'view' && (
          <Form.Item
            name="path"
            label="Đường dẫn trong hệ thống"
            extra="Mở trang, đặt bộ lọc, rồi chép phần đường dẫn từ /admin… — hoặc bấm biểu tượng ghim cạnh tiêu đề trang."
            rules={[{ required: true, message: 'Nhập đường dẫn' }, { validator: (_, path) => (!path || isInternalPath(path.trim()) ? Promise.resolve() : Promise.reject(new Error('Đường dẫn phải bắt đầu bằng /admin, /trinh-chieu hoặc /phan-anh'))) }]}
          >
            <Input placeholder="/admin/targets?status=OVERDUE" />
          </Form.Item>
        )}
        {kind === 'link' && (
          <Form.Item
            name="url"
            label="Địa chỉ trang web"
            rules={[{ required: true, message: 'Nhập địa chỉ' }, { validator: (_, url) => (!url || isSafeUrl(url.trim()) ? Promise.resolve() : Promise.reject(new Error('Địa chỉ phải bắt đầu bằng https:// hoặc http://'))) }]}
          >
            <Input placeholder="https://dichvucong.gov.vn" onBlur={event => !form.getFieldValue('label') && form.setFieldsValue({ label: hostOf(event.target.value) })} />
          </Form.Item>
        )}
        <Form.Item name="label" label="Tên hiển thị" rules={[{ required: kind !== 'link', whitespace: true, message: 'Nhập tên' }, { max: 40, message: 'Tối đa 40 ký tự' }]}>
          <Input maxLength={40} />
        </Form.Item>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Form.Item name="icon" label="Biểu tượng">
            <IconPicker />
          </Form.Item>
          {kind !== 'screen' && (
            <Form.Item name="color" label="Màu">
              <ColorPick />
            </Form.Item>
          )}
        </div>
        {kind === 'folder' && (
          <Form.Item label="Lối tắt trong thư mục">
            <LinksEditor value={children} onChange={setChildren} max={MAX_FOLDER_ITEMS} allowFolder={false} />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}
