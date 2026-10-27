import { DESK_BREAKPOINTS, DESK_COLUMNS, type DeskBreakpoint, type DeskLayouts, type LayoutItem, type WidgetSizes } from './types';

// Bố cục lưới phía trình duyệt — cùng thuật toán với apps/api/src/desk/layout.ts để widget mới hiện ngay đúng chỗ máy
// chủ sẽ lưu.

export type { DeskLayouts, LayoutItem, WidgetSizes } from './types';

export const ROW_HEIGHT = 36;
export const GAP = 14;
export const MAX_ROWS_PER_WIDGET = 40;

export function breakpointOf(width: number): DeskBreakpoint {
  if (width >= 1200) return 'desktop';
  if (width >= 768) return 'tablet';
  return 'mobile';
}

function fits(items: LayoutItem[], x: number, y: number, w: number, h: number) {
  return items.every(item => x + w <= item.x || item.x + item.w <= x || y + h <= item.y || item.y + item.h <= y);
}

function freeSpot(items: LayoutItem[], cols: number, w: number, h: number) {
  const bottom = items.reduce((max, item) => Math.max(max, item.y + item.h), 0);
  for (let y = 0; y <= bottom; y += 1) {
    for (let x = 0; x + w <= cols; x += 1) {
      if (fits(items, x, y, w, h)) return { x, y };
    }
  }
  return { x: 0, y: bottom };
}

export function placeWidget(layouts: DeskLayouts, id: string, size: WidgetSizes): DeskLayouts {
  const next = { ...layouts };
  for (const breakpoint of DESK_BREAKPOINTS) {
    const items = layouts[breakpoint] ?? [];
    if (items.some(item => item.i === id)) {
      next[breakpoint] = items;
      continue;
    }
    const cols = DESK_COLUMNS[breakpoint];
    const w = Math.min(size[breakpoint].w, cols);
    next[breakpoint] = [...items, { i: id, ...freeSpot(items, cols, w, size[breakpoint].h), w, h: size[breakpoint].h }];
  }
  return next;
}

function int(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback;
}

export function normalizeLayouts(raw: unknown, widgets: { id: string; size: WidgetSizes }[]): DeskLayouts {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const sizes = new Map(widgets.map(widget => [widget.id, widget.size]));
  let layouts = {} as DeskLayouts;
  for (const breakpoint of DESK_BREAKPOINTS) {
    const cols = DESK_COLUMNS[breakpoint];
    const list = Array.isArray(source[breakpoint]) ? (source[breakpoint] as unknown[]) : [];
    const seen = new Set<string>();
    const items: LayoutItem[] = [];
    for (const entry of list) {
      if (!entry || typeof entry !== 'object') continue;
      const record = entry as Record<string, unknown>;
      const id = typeof record.i === 'string' ? record.i : '';
      const size = sizes.get(id);
      if (!size || seen.has(id)) continue;
      seen.add(id);
      const limits = size[breakpoint];
      const w = Math.min(cols, Math.max(Math.min(limits.minW, cols), int(record.w, limits.w)));
      const h = Math.min(MAX_ROWS_PER_WIDGET, Math.max(limits.minH, int(record.h, limits.h)));
      items.push({ i: id, x: Math.min(Math.max(0, int(record.x, 0)), cols - w), y: Math.max(0, int(record.y, 0)), w, h });
    }
    layouts[breakpoint] = items;
  }
  for (const widget of widgets) layouts = placeWidget(layouts, widget.id, widget.size);
  return layouts;
}

/** Bỏ mục của một widget khỏi mọi cỡ màn hình. */
export function removeFromLayouts(layouts: DeskLayouts, id: string): DeskLayouts {
  return {
    desktop: layouts.desktop.filter(item => item.i !== id),
    tablet: layouts.tablet.filter(item => item.i !== id),
    mobile: layouts.mobile.filter(item => item.i !== id),
  };
}
