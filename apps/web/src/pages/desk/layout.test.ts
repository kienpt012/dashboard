import assert from 'node:assert/strict';
import test from 'node:test';
import { breakpointOf, normalizeLayouts, placeWidget, type DeskLayouts, type WidgetSizes } from './layout';

const sizeOf = (w: number, h: number, minW: number, minH: number): WidgetSizes => ({
  desktop: { w, h, minW, minH },
  tablet: { w: Math.min(w, 8), h, minW: Math.min(minW, 8), minH },
  mobile: { w: 4, h, minW: Math.min(minW, 4), minH },
});
const half = sizeOf(6, 4, 3, 2);
const full = sizeOf(12, 3, 6, 2);
const empty = (): DeskLayouts => ({ desktop: [], tablet: [], mobile: [] });

test('bố cục web: widget đầu tiên ở góc trên trái, thứ hai nằm cạnh', () => {
  let layouts = placeWidget(empty(), 'a', half);
  layouts = placeWidget(layouts, 'b', half);
  assert.deepEqual(layouts.desktop, [{ i: 'a', x: 0, y: 0, w: 6, h: 4 }, { i: 'b', x: 6, y: 0, w: 6, h: 4 }]);
  assert.deepEqual(layouts.mobile[1], { i: 'b', x: 0, y: 4, w: 4, h: 4 });
});

test('bố cục web: widget cả bề ngang xuống dưới đáy, lấp chỗ trống bên phải trước', () => {
  const layouts: DeskLayouts = { desktop: [{ i: 'a', x: 0, y: 0, w: 4, h: 6 }, { i: 'b', x: 0, y: 6, w: 12, h: 2 }], tablet: [], mobile: [] };
  assert.deepEqual(placeWidget(layouts, 'c', sizeOf(8, 6, 4, 3)).desktop[2], { i: 'c', x: 4, y: 0, w: 8, h: 6 });
  assert.deepEqual(placeWidget(placeWidget(placeWidget(empty(), 'a', half), 'b', half), 'c', full).desktop[2], { i: 'c', x: 0, y: 4, w: 12, h: 3 });
});

test('bố cục web: chuẩn hoá kẹp vào biên, bỏ mục mồ côi và trùng, sinh cỡ còn thiếu', () => {
  const widgets = [{ id: 'a', size: half }];
  const result = normalizeLayouts({ desktop: [{ i: 'a', x: 3, y: 0, w: 20, h: 0 }, { i: 'a', x: 0, y: 9, w: 6, h: 4 }, { i: 'ghost', x: 0, y: 0, w: 2, h: 2 }] }, widgets);
  assert.deepEqual(result.desktop, [{ i: 'a', x: 0, y: 0, w: 12, h: 2 }]);
  assert.deepEqual(result.mobile, [{ i: 'a', x: 0, y: 0, w: 4, h: 4 }]);
});

test('cỡ màn hình theo bề rộng khung', () => {
  assert.equal(breakpointOf(1200), 'desktop');
  assert.equal(breakpointOf(1199), 'tablet');
  assert.equal(breakpointOf(768), 'tablet');
  assert.equal(breakpointOf(767), 'mobile');
});
