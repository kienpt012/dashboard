import { placeWidget, removeFromLayouts } from './layout';
import { DESK_COLUMNS, MAX_WIDGETS, type DeskBreakpoint, type DeskSpaceConfig, type LayoutItem, type WidgetDefinition, type WidgetInstance } from './types';

// Phép biến đổi cấu hình không gian (thuần, không gọi API): thêm, xoá, nhân bản, chuyển widget, đổi bố cục.

const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function newWidgetId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let id = 'w_';
  for (const byte of bytes) id += BASE62[byte % 62];
  return id;
}

export function defaultSettings(def: WidgetDefinition): Record<string, unknown> {
  const settings: Record<string, unknown> = {};
  for (const field of def.fields) {
    switch (field.type) {
      case 'text':
      case 'textarea':
        settings[field.key] = field.default ?? '';
        break;
      case 'number':
      case 'boolean':
      case 'select':
        settings[field.key] = field.default;
        break;
      case 'multiselect':
        settings[field.key] = [...field.default];
        break;
      case 'color':
        settings[field.key] = field.default;
        break;
      case 'list':
        settings[field.key] = [...(field.default ?? [])];
        break;
      case 'targets':
      case 'links':
      case 'timezones':
      case 'searchProviders':
        settings[field.key] = [];
        break;
      default:
        settings[field.key] = null;
    }
  }
  return settings;
}

export function canAddWidget(config: DeskSpaceConfig, def: WidgetDefinition): boolean {
  if (config.widgets.length >= MAX_WIDGETS) return false;
  return def.multiple || !config.widgets.some(widget => widget.type === def.type);
}

function withLayout(config: DeskSpaceConfig, widget: WidgetInstance, def: WidgetDefinition, at?: { breakpoint: DeskBreakpoint; x: number; y: number }) {
  let layouts = config.layouts;
  if (at) {
    const size = def.size[at.breakpoint];
    const cols = DESK_COLUMNS[at.breakpoint];
    const w = Math.min(size.w, cols);
    layouts = { ...layouts, [at.breakpoint]: [...layouts[at.breakpoint], { i: widget.id, x: Math.min(Math.max(0, at.x), cols - w), y: Math.max(0, at.y), w, h: size.h }] };
  }
  return { ...config, widgets: [...config.widgets, widget], layouts: placeWidget(layouts, widget.id, def.size) };
}

export function addWidget(
  config: DeskSpaceConfig,
  def: WidgetDefinition,
  at?: { breakpoint: DeskBreakpoint; x: number; y: number },
  settings?: Record<string, unknown>,
): { config: DeskSpaceConfig; id: string } {
  const widget: WidgetInstance = {
    id: newWidgetId(),
    type: def.type,
    title: null,
    settings: { ...defaultSettings(def), ...settings },
    style: { accent: null, appearance: 'inherit', hideHeader: false },
  };
  return { config: withLayout(config, widget, def, at), id: widget.id };
}

export function removeWidget(config: DeskSpaceConfig, id: string): DeskSpaceConfig {
  return { ...config, widgets: config.widgets.filter(widget => widget.id !== id), layouts: removeFromLayouts(config.layouts, id) };
}

export function updateWidget(config: DeskSpaceConfig, id: string, recipe: (widget: WidgetInstance) => WidgetInstance): DeskSpaceConfig {
  return { ...config, widgets: config.widgets.map(widget => (widget.id === id ? recipe(widget) : widget)) };
}

export function duplicateWidget(config: DeskSpaceConfig, id: string, def: WidgetDefinition): { config: DeskSpaceConfig; id: string } {
  const source = config.widgets.find(widget => widget.id === id);
  if (!source) return { config, id };
  const copy: WidgetInstance = { ...structuredClone(source), id: newWidgetId() };
  delete copy.templateKey;
  delete copy.locked;
  return { config: withLayout(config, copy, def), id: copy.id };
}

/** Chuyển widget giữa hai không gian, giữ nguyên mã và cài đặt (trạng thái widget theo mã nên đi theo). */
export function moveWidget(from: DeskSpaceConfig, to: DeskSpaceConfig, id: string, def: WidgetDefinition) {
  const widget = from.widgets.find(item => item.id === id);
  if (!widget) return { from, to };
  return { from: removeWidget(from, id), to: withLayout(to, widget, def) };
}

export function setLayout(config: DeskSpaceConfig, breakpoint: DeskBreakpoint, items: LayoutItem[]): DeskSpaceConfig {
  const known = new Set(config.widgets.map(widget => widget.id));
  const clean = items.filter(item => known.has(item.i)).map(({ i, x, y, w, h }) => ({ i, x, y, w, h }));
  return { ...config, layouts: { ...config.layouts, [breakpoint]: clean } };
}

