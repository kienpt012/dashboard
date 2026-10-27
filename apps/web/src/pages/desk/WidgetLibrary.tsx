import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { App, Button, Drawer, Empty, Input, Tag } from 'antd';
import { useMemo, useState } from 'react';
import { fold } from '@/app/nav';
import { widgetDrag, WIDGET_MIME } from './dnd';
import { DeskIcon } from './icons';
import { addWidget, canAddWidget } from './mutations';
import { WIDGET_CATEGORIES, type DeskSpace, type WidgetCategory } from './types';
import { useDesk } from './useDesk';

// Kho widget: tìm không dấu, lọc theo nhóm, bấm Thêm hoặc kéo thẳng vào lưới (khi đang tùy biến).

export function WidgetLibrary({ open, onClose, space, onAdded }: { open: boolean; onClose: () => void; space: DeskSpace; onAdded?: (widgetId: string) => void }) {
  const desk = useDesk();
  const { message } = App.useApp();
  const [text, setText] = useState('');
  const [category, setCategory] = useState<WidgetCategory | 'all'>('all');

  const list = useMemo(() => {
    const needle = fold(text.trim());
    return desk.catalog.filter(def => (category === 'all' || def.category === category) && (!needle || fold(`${def.title} ${def.description}`).includes(needle)));
  }, [desk.catalog, text, category]);

  const categories = WIDGET_CATEGORIES.filter(item => desk.catalog.some(def => def.category === item.key));

  const add = (type: string) => {
    const def = desk.catalog.find(item => item.type === type);
    if (!def) return;
    if (!canAddWidget(space.config, def)) return void message.warning(def.multiple ? 'Mỗi không gian tối đa 40 widget' : `Không gian này đã có “${def.title}”`);
    let id = '';
    desk.store.updateSpace(space.id, config => {
      const result = addWidget(config, def);
      id = result.id;
      return result.config;
    });
    message.success(`Đã thêm “${def.title}”`);
    if (id) onAdded?.(id);
  };

  return (
    <Drawer title="Thêm widget" open={open} onClose={onClose} size={420} mask={false} className="wl-drawer" destroyOnHidden>
      <Input
        allowClear
        prefix={<SearchOutlined />}
        placeholder="Tìm widget: cảnh báo, lịch, ghi chú…"
        value={text}
        onChange={event => setText(event.target.value)}
        autoFocus
      />
      <Tag.CheckableTagGroup
        className="wl-cats"
        value={category}
        onChange={value => setCategory(value ?? 'all')}
        options={[{ value: 'all' as const, label: 'Tất cả' }, ...categories.map(item => ({ value: item.key, label: item.label }))]}
      />
      <p className="wl-hint">Kéo thẻ thả vào bàn làm việc để đặt đúng chỗ, hoặc bấm Thêm.</p>
      {list.length ? (
        <div className="wl-list">
          {list.map(def => {
            const allowed = canAddWidget(space.config, def);
            return (
              <div
                key={def.type}
                className={`wl-card${allowed ? '' : ' disabled'}`}
                draggable={allowed}
                onDragStart={event => {
                  event.dataTransfer.setData(WIDGET_MIME, def.type);
                  event.dataTransfer.setData('text/plain', '');
                  event.dataTransfer.effectAllowed = 'copy';
                  widgetDrag.start(def.type);
                }}
                onDragEnd={() => widgetDrag.end()}
              >
                <span className="wl-icon">
                  <DeskIcon name={def.icon} size={18} />
                </span>
                <span className="wl-text">
                  <strong>{def.title}</strong>
                  <span>{def.description}</span>
                  {!allowed && <em>Đã có trong không gian này</em>}
                </span>
                <Button size="small" icon={<PlusOutlined />} disabled={!allowed} onClick={() => add(def.type)}>
                  Thêm
                </Button>
              </div>
            );
          })}
        </div>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có widget khớp từ khoá" />
      )}
    </Drawer>
  );
}
