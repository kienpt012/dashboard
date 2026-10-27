import { AppstoreAddOutlined } from '@ant-design/icons';
import { App, Button } from 'antd';
import { useEffect, useMemo, type CSSProperties } from 'react';
import { GridLayout, useContainerWidth, type Layout, type LayoutItem as GridItem } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import { useMe } from '@/app/session';
import { currentYear } from '@/lib/format';
import { isGlobal } from '@/lib/roles';
import { widgetDrag, WIDGET_MIME } from './dnd';
import { breakpointOf, GAP, MAX_ROWS_PER_WIDGET, ROW_HEIGHT } from './layout';
import { addWidget, canAddWidget, duplicateWidget, moveWidget, removeWidget, setLayout, updateWidget } from './mutations';
import { DESK_COLUMNS, type DeskSpace, type LayoutItem, type WidgetDefinition, type WidgetInstance } from './types';
import { useDesk } from './useDesk';
import { WidgetFrame } from './WidgetFrame';

// Lưới widget của một không gian: kéo thả, đổi cỡ, thả widget từ kho, xem trước theo cỡ máy tính bảng/điện thoại.

/** Ngữ cảnh cho thành phần vẽ widget: phòng đã giải, năm, chu kỳ làm mới, hàm đổi cài đặt. */
export function useWidgetContextFactory(space: DeskSpace) {
  const desk = useDesk();
  const user = useMe();
  const globalRole = isGlobal(user);
  const year = currentYear();
  return (widget: WidgetInstance, def: WidgetDefinition | undefined, maximized = false) => ({
    spaceId: space.id,
    departmentId: (globalRole && typeof widget.settings.departmentId === 'string' ? widget.settings.departmentId : null) ?? space.config.focusDepartmentId ?? user.departmentId ?? null,
    year,
    refreshMs: Math.max(30, Number(widget.settings.refreshSeconds ?? def?.refresh ?? 60)) * 1000,
    maximized,
    editing: desk.editing,
    setSettings: (patch: Record<string, unknown>, coalesce?: string) =>
      desk.store.updateSpace(space.id, config => updateWidget(config, widget.id, item => ({ ...item, settings: { ...item.settings, ...patch } })), { coalesce }),
  });
}

const PREVIEW_WIDTH = { tablet: 820, mobile: 390 } as const;

export function DeskGrid({ space, onSettings, onMaximize, onOpenLibrary }: { space: DeskSpace; onSettings: (widgetId: string) => void; onMaximize: (widgetId: string) => void; onOpenLibrary: () => void }) {
  const desk = useDesk();
  const { message } = App.useApp();
  const { width, containerRef, mounted } = useContainerWidth({ initialWidth: 1200 });
  const store = desk.store;
  const actual = breakpointOf(width);
  const preview = desk.editing && desk.previewBreakpoint && desk.previewBreakpoint !== 'desktop' ? desk.previewBreakpoint : null;
  const bp = preview ?? actual;
  const canvasWidth = preview ? Math.min(PREVIEW_WIDTH[preview], width) : width;
  const cols = DESK_COLUMNS[bp];
  const defs = useMemo(() => new Map(desk.catalog.map(def => [def.type, def])), [desk.catalog]);

  useEffect(() => {
    if (mounted) store.setBreakpoint(actual);
  }, [actual, mounted, store]);

  const items = space.config.layouts[bp] ?? [];
  const layout: GridItem[] = items.map(item => {
    const def = defs.get(space.config.widgets.find(widget => widget.id === item.i)?.type ?? '');
    return { ...item, minW: Math.min(def?.size[bp].minW ?? 1, cols), minH: def?.size[bp].minH ?? 1, maxH: MAX_ROWS_PER_WIDGET };
  });

  const commit = (next: Layout) =>
    store.updateSpace(space.id, config => setLayout(config, bp, next.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }))));

  const remove = (id: string) => {
    store.updateSpace(space.id, config => removeWidget(config, id));
    message.open({
      type: 'info',
      key: `removed-${id}`,
      content: (
        <span>
          Đã gỡ widget.{' '}
          <a
            onClick={() => {
              store.undo();
              message.destroy(`removed-${id}`);
            }}
          >
            Hoàn tác
          </a>
        </span>
      ),
    });
  };

  const nudge = (id: string, dx: number, dy: number, dw: number, dh: number) => {
    const current = items.find(item => item.i === id);
    const def = defs.get(space.config.widgets.find(widget => widget.id === id)?.type ?? '');
    if (!current || !def) return;
    const w = Math.min(cols, Math.max(Math.min(def.size[bp].minW, cols), current.w + dw));
    const h = Math.min(MAX_ROWS_PER_WIDGET, Math.max(def.size[bp].minH, current.h + dh));
    const next: LayoutItem = { i: id, w, h, x: Math.min(Math.max(0, current.x + dx), cols - w), y: Math.max(0, current.y + dy) };
    store.updateSpace(space.id, config => setLayout(config, bp, items.map(item => (item.i === id ? next : item))), { coalesce: `nudge:${id}` });
  };

  const drop = (_layout: Layout, item: GridItem | undefined, event: Event) => {
    const type = (event as DragEvent).dataTransfer?.getData(WIDGET_MIME) || widgetDrag.type;
    widgetDrag.end();
    const def = type ? defs.get(type) : undefined;
    if (!def || !item) return;
    if (!canAddWidget(space.config, def)) {
      message.warning(def.multiple ? 'Mỗi không gian tối đa 40 widget' : `Không gian này đã có “${def.title}”`);
      return;
    }
    store.updateSpace(space.id, config => addWidget(config, def, { breakpoint: bp, x: item.x, y: item.y }).config);
  };

  const contextFor = useWidgetContextFactory(space);

  const colWidth = (canvasWidth - GAP * (cols - 1)) / cols;
  const gridStyle = { '--dg-col': `${colWidth}px`, '--dg-gap': `${GAP}px`, '--dg-row': `${ROW_HEIGHT}px` } as CSSProperties;

  return (
    <div className={`desk-canvas${preview ? ` preview preview-${preview}` : ''}`}>
      <div className="desk-canvas-frame" style={preview ? { maxWidth: PREVIEW_WIDTH[preview] } : undefined} ref={containerRef}>
        {mounted && (
          <GridLayout
            key={`${space.id}-${bp}`}
            className={`desk-grid${desk.editing ? ' editing' : ''}`}
            style={gridStyle}
            width={canvasWidth}
            layout={layout}
            gridConfig={{ cols, rowHeight: ROW_HEIGHT, margin: [GAP, GAP], containerPadding: [0, 0] }}
            dragConfig={{ enabled: desk.editing, handle: '.dw-handle', threshold: 4 }}
            resizeConfig={{ enabled: desk.editing, handles: ['se', 'e', 's'] }}
            dropConfig={{
              enabled: desk.editing,
              defaultItem: { w: 4, h: 4 },
              onDragOver: () => {
                const def = widgetDrag.type ? defs.get(widgetDrag.type) : undefined;
                return def ? { w: Math.min(def.size[bp].w, cols), h: def.size[bp].h } : false;
              },
            }}
            onDrop={drop}
            onDragStop={next => commit(next)}
            onResizeStop={next => commit(next)}
          >
            {items.map(item => {
              const widget = space.config.widgets.find(entry => entry.id === item.i);
              if (!widget) return <div key={item.i} />;
              const def = defs.get(widget.type);
              return (
                <div key={widget.id} className="dg-item">
                  <WidgetFrame
                    widget={widget}
                    def={def}
                    context={contextFor(widget, def)}
                    spaces={desk.spaces.map(entry => ({ id: entry.id, name: entry.name }))}
                    onSettings={() => onSettings(widget.id)}
                    onRemove={() => remove(widget.id)}
                    onDuplicate={() => def && store.updateSpace(space.id, config => duplicateWidget(config, widget.id, def).config)}
                    onMove={target => {
                      const destination = desk.spaces.find(entry => entry.id === target);
                      if (!def || !destination) return;
                      if (!canAddWidget(destination.config, def)) return void message.warning(`Không gian “${destination.name}” không nhận thêm widget này`);
                      const moved = moveWidget(space.config, destination.config, widget.id, def);
                      store.updateSpace(space.id, () => moved.from);
                      store.updateSpace(target, () => moved.to);
                      message.success(`Đã chuyển sang “${destination.name}”`);
                    }}
                    onMaximize={() => onMaximize(widget.id)}
                    onNudge={(dx, dy, dw, dh) => nudge(widget.id, dx, dy, dw, dh)}
                  />
                </div>
              );
            })}
          </GridLayout>
        )}
        {!space.config.widgets.length && (
          <div className="desk-empty">
            <strong>Không gian này còn trống</strong>
            <span>Thêm widget số liệu, ghi chú, lối tắt… rồi kéo thả sắp xếp theo ý bạn.</span>
            <Button type="primary" icon={<AppstoreAddOutlined />} onClick={onOpenLibrary}>
              Thêm widget
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Một widget phóng to phủ bàn làm việc (Esc để thu nhỏ). */
export function MaximizedWidget({ space, widgetId, onClose, onSettings }: { space: DeskSpace; widgetId: string; onClose: () => void; onSettings: () => void }) {
  const desk = useDesk();
  const contextFor = useWidgetContextFactory(space);
  const widget = space.config.widgets.find(item => item.id === widgetId);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (!widget) return null;
  const def = desk.catalog.find(item => item.type === widget.type);
  return (
    <div className="desk-max" role="dialog" aria-modal="true" aria-label={widget.title || def?.title}>
      <div className="desk-max-backdrop" onClick={onClose} />
      <div className="desk-max-panel">
        <WidgetFrame
          widget={widget}
          def={def}
          context={contextFor(widget, def, true)}
          spaces={[]}
          onSettings={onSettings}
          onRemove={onClose}
          onDuplicate={onClose}
          onMove={onClose}
          onMaximize={onClose}
          onClose={onClose}
          onNudge={() => undefined}
        />
      </div>
    </div>
  );
}
