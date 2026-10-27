import { PushpinOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { App, Button, Form, Input, Modal, Radio, Select, Tooltip } from 'antd';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { navItems } from '@/app/nav';
import { invalidate } from '@/hooks/useApi';
import { errorText } from '@/lib/api';
import { deskApi } from './api';
import { DeskIcon, ICON_NAMES } from './icons';
import { addWidget } from './mutations';
import type { DeskPayload, DockItem } from './types';
import { MAX_DOCK_ITEMS } from './types';

// "Ghim trang này": ghim đường dẫn hiện tại (kèm bộ lọc) vào dock hoặc vào widget Lối tắt của bàn làm việc.

const NEW_LAUNCHER = '__new__';
const LAUNCHER_MAX = 24;

type Values = { label: string; icon: string; where: 'dock' | 'launcher'; launcher: string };

function launchersOf(desk: DeskPayload) {
  return desk.spaces.flatMap(space =>
    space.config.widgets
      .filter(widget => widget.type === 'launcher')
      .map(widget => ({ value: `${space.id}:${widget.id}`, label: `${space.name} · ${widget.title || 'Lối tắt'}` })),
  );
}

export function PinPage({ title }: { title?: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const { message } = App.useApp();
  const [form] = Form.useForm<Values>();
  const [open, setOpen] = useState(false);
  const [desk, setDesk] = useState<DeskPayload | null>(null);
  const [saving, setSaving] = useState(false);
  const path = location.pathname + location.search;

  if (location.pathname === '/admin') return null;

  async function start() {
    setOpen(true);
    try {
      const loaded = await deskApi.load();
      setDesk(loaded);
      const launchers = launchersOf(loaded);
      form.setFieldsValue({
        label: (title || document.title.split(' · ')[0] || 'Trang đã ghim').slice(0, 40),
        icon: 'pushpin',
        where: 'dock',
        launcher: launchers[0]?.value ?? NEW_LAUNCHER,
      });
    } catch (error) {
      message.error(errorText(error, 'Không tải được bàn làm việc'));
      setOpen(false);
    }
  }

  async function save(values: Values) {
    if (!desk) return;
    const screen = !location.search && navItems.some(item => item.path === location.pathname);
    const item: DockItem = screen
      ? { id: `p-${Date.now().toString(36)}`, kind: 'screen', path, label: values.label.trim(), icon: values.icon }
      : { id: `p-${Date.now().toString(36)}`, kind: 'view', path, label: values.label.trim(), icon: values.icon, color: null };
    setSaving(true);
    try {
      if (values.where === 'dock') {
        const dock = desk.profile.config.dock;
        if (dock.items.length >= MAX_DOCK_ITEMS) throw new Error(`Dock đã đủ ${MAX_DOCK_ITEMS} lối tắt, hãy gỡ bớt`);
        await deskApi.saveProfile({ ...desk.profile.config, dock: { ...dock, items: [...dock.items, item] } }, desk.profile.version);
      } else if (values.launcher === NEW_LAUNCHER) {
        const [catalog, space] = [await deskApi.catalog(), desk.spaces[0]];
        const def = catalog.find(entry => entry.type === 'launcher');
        if (!def || !space) throw new Error('Không tạo được widget Lối tắt');
        const { config } = addWidget(space.config, def, undefined, { items: [item] });
        await deskApi.saveSpace(space.id, { config, expectedVersion: space.version });
      } else {
        const [spaceId, widgetId] = values.launcher.split(':');
        const space = desk.spaces.find(entry => entry.id === spaceId);
        const widget = space?.config.widgets.find(entry => entry.id === widgetId);
        if (!space || !widget) throw new Error('Không tìm thấy widget Lối tắt');
        const items = (widget.settings.items as DockItem[] | undefined) ?? [];
        if (items.length >= LAUNCHER_MAX) throw new Error(`Widget này đã đủ ${LAUNCHER_MAX} lối tắt`);
        const config = { ...space.config, widgets: space.config.widgets.map(entry => (entry.id === widgetId ? { ...entry, settings: { ...entry.settings, items: [...items, item] } } : entry)) };
        await deskApi.saveSpace(space.id, { config, expectedVersion: space.version });
      }
      await invalidate(client, ['/desk']);
      setOpen(false);
      message.success({ content: <span>Đã ghim “{item.label}” — <a onClick={() => navigate('/admin')}>mở bàn làm việc</a></span> });
    } catch (error) {
      message.error(errorText(error, 'Không ghim được trang này'));
    } finally {
      setSaving(false);
    }
  }

  const launchers = desk ? launchersOf(desk) : [];
  return (
    <>
      <Tooltip title="Ghim trang này vào bàn làm việc">
        <Button type="text" size="small" className="pin-page" icon={<PushpinOutlined />} onClick={() => void start()} aria-label="Ghim trang này vào bàn làm việc" />
      </Tooltip>
      <Modal title="Ghim trang này" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} okText="Ghim" cancelText="Huỷ" confirmLoading={saving} destroyOnHidden>
        <Form form={form} layout="vertical" onFinish={values => void save(values)} requiredMark={false} disabled={!desk}>
          <Form.Item label="Đường dẫn">
            <Input value={path} readOnly />
          </Form.Item>
          <Form.Item name="label" label="Tên lối tắt" rules={[{ required: true, whitespace: true, message: 'Nhập tên lối tắt' }, { max: 40, message: 'Tối đa 40 ký tự' }]}>
            <Input maxLength={40} />
          </Form.Item>
          <Form.Item name="icon" label="Biểu tượng">
            <Select
              showSearch
              options={ICON_NAMES.map(name => ({ value: name, label: <span className="icon-option"><DeskIcon name={name} /> {name}</span> }))}
            />
          </Form.Item>
          <Form.Item name="where" label="Ghim vào">
            <Radio.Group options={[{ value: 'dock', label: 'Thanh dock' }, { value: 'launcher', label: 'Widget Lối tắt' }]} optionType="button" />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, next) => prev.where !== next.where}>
            {() =>
              form.getFieldValue('where') === 'launcher' && (
                <Form.Item name="launcher" label="Widget">
                  <Select options={[...launchers, { value: NEW_LAUNCHER, label: `Tạo widget Lối tắt mới ở “${desk?.spaces[0]?.name ?? 'Hằng ngày'}”` }]} />
                </Form.Item>
              )
            }
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
