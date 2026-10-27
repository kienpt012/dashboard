import { DeleteOutlined } from '@ant-design/icons';
import { Button, ColorPicker, Drawer, Input, Segmented, Switch, Tabs } from 'antd';
import { useMe } from '@/app/session';
import { SettingsForm } from './fields/SettingsForm';
import { DeskIcon } from './icons';
import { removeWidget, updateWidget } from './mutations';
import type { DeskSpace, WidgetInstance, WidgetStyle } from './types';
import { useDesk } from './useDesk';

// Cài đặt một widget: thẻ Nội dung sinh từ khai báo trường, thẻ Giao diện (tên, màu nhấn, kiểu thẻ, ẩn đầu widget).
// Thay đổi áp dụng ngay và tự lưu; gõ liên tiếp vào một ô chỉ thành một bước hoàn tác.

const STYLE_OPTIONS = [
  { value: 'inherit', label: 'Theo bàn' },
  { value: 'glass', label: 'Kính' },
  { value: 'solid', label: 'Đặc' },
  { value: 'outline', label: 'Viền' },
  { value: 'plain', label: 'Trong suốt' },
];

const ACCENTS = ['#1d4ed8', '#0f766e', '#15803d', '#b45309', '#b42318', '#be185d', '#7c3aed', '#334155'];

export function WidgetSettings({ space, widgetId, placement, onClose }: { space: DeskSpace; widgetId: string | null; placement: 'left' | 'right'; onClose: () => void }) {
  const desk = useDesk();
  const user = useMe();
  const widget = widgetId ? space.config.widgets.find(item => item.id === widgetId) : undefined;
  const def = widget ? desk.catalog.find(item => item.type === widget.type) : undefined;
  const open = Boolean(widget && def);

  const patch = (recipe: (widget: WidgetInstance) => WidgetInstance, coalesce?: string) =>
    widget && desk.store.updateSpace(space.id, config => updateWidget(config, widget.id, recipe), { coalesce });
  const setStyle = (style: Partial<WidgetStyle>, coalesce?: string) => patch(item => ({ ...item, style: { ...item.style, ...style } }), coalesce);

  const departmentId = (typeof widget?.settings.departmentId === 'string' ? widget.settings.departmentId : null) ?? space.config.focusDepartmentId ?? user.departmentId ?? null;

  return (
    <Drawer
      title={
        widget && def ? (
          <span className="ws-title">
            <DeskIcon name={def.icon} /> {widget.title || def.title}
          </span>
        ) : (
          'Cài đặt widget'
        )
      }
      open={open}
      onClose={onClose}
      placement={placement}
      size={420}
      mask={false}
      destroyOnHidden
      footer={
        widget && (
          <div className="ws-footer">
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={() => {
                desk.store.updateSpace(space.id, config => removeWidget(config, widget.id));
                onClose();
              }}
            >
              Gỡ widget
            </Button>
            <Button type="primary" onClick={onClose}>
              Xong
            </Button>
          </div>
        )
      }
    >
      {widget && def && (
        <Tabs
          items={[
            {
              key: 'content',
              label: 'Nội dung',
              children: (
                <SettingsForm
                  fields={def.fields}
                  values={widget.settings}
                  departmentId={departmentId}
                  onChange={(key, value, coalesce) => patch(item => ({ ...item, settings: { ...item.settings, [key]: value } }), coalesce ? `setting:${widget.id}:${key}` : undefined)}
                />
              ),
            },
            {
              key: 'look',
              label: 'Giao diện',
              children: (
                <div className="settings-form">
                  <div className="bgp-row">
                    <div className="bgp-row-label">Tên widget</div>
                    <Input
                      value={widget.title ?? ''}
                      placeholder={def.title}
                      maxLength={60}
                      onChange={event => patch(item => ({ ...item, title: event.target.value || null }), `title:${widget.id}`)}
                    />
                  </div>
                  <div className="bgp-row">
                    <div className="bgp-row-label">Kiểu thẻ</div>
                    <Segmented block value={widget.style.appearance} onChange={value => setStyle({ appearance: value as WidgetStyle['appearance'] })} options={STYLE_OPTIONS} />
                  </div>
                  <div className="bgp-row">
                    <div className="bgp-row-label">Màu nhấn</div>
                    <div className="bgp-colors">
                      <button type="button" className={`bgp-swatch auto${widget.style.accent ? '' : ' selected'}`} onClick={() => setStyle({ accent: null })}>
                        Theo bàn
                      </button>
                      {ACCENTS.map(color => (
                        <button key={color} type="button" className={`bgp-swatch${widget.style.accent === color ? ' selected' : ''}`} style={{ background: color }} onClick={() => setStyle({ accent: color })} aria-label={`Màu ${color}`} />
                      ))}
                      <ColorPicker
                        value={widget.style.accent ?? '#1d4ed8'}
                        disabledAlpha
                        size="small"
                        onChangeComplete={value => setStyle({ accent: (value as { toHexString: () => string }).toHexString() })}
                      />
                    </div>
                  </div>
                  <div className="bgp-row">
                    <div className="bgp-row-label">Đầu widget</div>
                    <span>
                      <Switch checked={!widget.style.hideHeader} onChange={checked => setStyle({ hideHeader: !checked })} /> Hiện tên và nút thao tác
                    </span>
                  </div>
                </div>
              ),
            },
          ]}
        />
      )}
    </Drawer>
  );
}
