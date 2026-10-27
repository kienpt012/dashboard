import { DESK_BREAKPOINTS, DESK_COLUMNS, type DeskBreakpoint, type WidgetDefinition } from './catalog';

// Bố cục lưới của một không gian: mỗi cỡ màn hình một danh sách ô. Máy chủ chỉ chuẩn hoá (kẹp vào biên, đủ cỡ tối
// thiểu, đủ mục cho mọi widget); việc dồn ô cho khít do lưới phía trình duyệt làm khi vẽ.

export interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type DeskLayouts = Record<DeskBreakpoint, LayoutItem[]>;

/** Chiều cao tối đa của một widget (số hàng). */
export const MAX_ROWS_PER_WIDGET = 40;

type Size = WidgetDefinition['size'];

function fits(items: LayoutItem[], x: number, y: number, w: number, h: number) {
  return items.every(item => x + w <= item.x || item.x + item.w <= x || y + h <= item.y || item.y + item.h <= y);
}

/** Ô trống đầu tiên đủ chỗ, quét từ trên xuống, trái sang phải; hết chỗ thì xuống dưới đáy. */
function freeSpot(items: LayoutItem[], cols: number, w: number, h: number) {
  const bottom = items.reduce((max, item) => Math.max(max, item.y + item.h), 0);
  for (let y = 0; y <= bottom; y += 1) {
    for (let x = 0; x + w <= cols; x += 1) {
      if (fits(items, x, y, w, h)) return { x, y };
    }
  }
  return { x: 0, y: bottom };
}

export function placeWidget(layouts: DeskLayouts, id: string, size: Size): DeskLayouts {
  const next = { ...layouts };
  for (const breakpoint of DESK_BREAKPOINTS) {
    const items = layouts[breakpoint] ?? [];
    if (items.some(item => item.i === id)) {
      next[breakpoint] = items;
      continue;
    }
    const cols = DESK_COLUMNS[breakpoint];
    const w = Math.min(size[breakpoint].w, cols);
    const h = size[breakpoint].h;
    next[breakpoint] = [...items, { i: id, ...freeSpot(items, cols, w, h), w, h }];
  }
  return next;
}

function int(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback;
}

/** Ép mọi mục về số nguyên trong biên lưới, đủ cỡ tối thiểu; bỏ mục không có widget hoặc trùng; sinh mục còn thiếu. */
export function normalizeLayouts(raw: unknown, widgets: { id: string; size: Size }[]): DeskLayouts {
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
      const x = Math.min(Math.max(0, int(record.x, 0)), cols - w);
      const y = Math.max(0, int(record.y, 0));
      items.push({ i: id, x, y, w, h });
    }
    layouts[breakpoint] = items;
  }
  for (const widget of widgets) layouts = placeWidget(layouts, widget.id, widget.size);
  return layouts;
}
