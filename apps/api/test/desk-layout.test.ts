import assert from 'node:assert/strict';
import test from 'node:test';
import type { WidgetSize } from '../src/desk/catalog';
import { normalizeLayouts, placeWidget, type DeskLayouts } from '../src/desk/layout';

const half = { w: 6, h: 4, minW: 3, minH: 2 };
const full = { w: 12, h: 3, minW: 6, minH: 2 };
const sizeOf = (desktop: WidgetSize, tablet: WidgetSize = { ...desktop, w: Math.min(desktop.w, 8), minW: Math.min(desktop.minW, 8) }, mobile: WidgetSize = { ...desktop, w: 4, minW: Math.min(desktop.minW, 4) }) => ({ desktop, tablet, mobile });
const empty = (): DeskLayouts => ({ desktop: [], tablet: [], mobile: [] });

test('bố cục: widget đầu tiên đặt ở góc trên trái', () => {
  const layouts = placeWidget(empty(), 'a', sizeOf(half));
  assert.deepEqual(layouts.desktop, [{ i: 'a', x: 0, y: 0, w: 6, h: 4 }]);
  assert.deepEqual(layouts.mobile, [{ i: 'a', x: 0, y: 0, w: 4, h: 4 }]);
});

test('bố cục: widget nửa bề ngang thứ hai nằm cạnh widget đầu', () => {
  let layouts = placeWidget(empty(), 'a', sizeOf(half));
  layouts = placeWidget(layouts, 'b', sizeOf(half));
  assert.deepEqual(layouts.desktop.find(item => item.i === 'b'), { i: 'b', x: 6, y: 0, w: 6, h: 4 });
});

test('bố cục: widget cả bề ngang xuống dưới đáy hàng đã có', () => {
  let layouts = placeWidget(empty(), 'a', sizeOf(half));
  layouts = placeWidget(layouts, 'b', sizeOf(half));
  layouts = placeWidget(layouts, 'c', sizeOf(full));
  assert.deepEqual(layouts.desktop.find(item => item.i === 'c'), { i: 'c', x: 0, y: 4, w: 12, h: 3 });
});

test('bố cục: lấp chỗ trống bên phải trước khi xuống hàng mới', () => {
  const layouts: DeskLayouts = { desktop: [{ i: 'a', x: 0, y: 0, w: 4, h: 6 }, { i: 'b', x: 0, y: 6, w: 12, h: 2 }], tablet: [], mobile: [] };
  const placed = placeWidget(layouts, 'c', sizeOf({ w: 8, h: 6, minW: 4, minH: 3 }));
  assert.deepEqual(placed.desktop.find(item => item.i === 'c'), { i: 'c', x: 4, y: 0, w: 8, h: 6 });
});

test('bố cục: chỉ có cỡ máy tính thì tự sinh cỡ máy tính bảng và điện thoại trong biên số cột', () => {
  const widgets = [
    { id: 'a', size: sizeOf(half) },
    { id: 'b', size: sizeOf(half) },
  ];
  const result = normalizeLayouts({ desktop: [{ i: 'a', x: 0, y: 0, w: 6, h: 4 }, { i: 'b', x: 6, y: 0, w: 6, h: 4 }] }, widgets);
  assert.equal(result.tablet.length, 2);
  assert.equal(result.mobile.length, 2);
  for (const item of result.tablet) assert.ok(item.x + item.w <= 8, JSON.stringify(item));
  for (const item of result.mobile) assert.ok(item.x + item.w <= 4, JSON.stringify(item));
});

test('bố cục: kẹp chiều ngang quá cột, nâng chiều cao dưới mức tối thiểu, bỏ mục mồ côi và mục trùng', () => {
  const widgets = [{ id: 'a', size: sizeOf(half) }];
  const result = normalizeLayouts(
    {
      desktop: [
        { i: 'a', x: 3, y: 0, w: 20, h: 0 },
        { i: 'a', x: 0, y: 9, w: 6, h: 4 },
        { i: 'ghost', x: 0, y: 0, w: 2, h: 2 },
      ],
    },
    widgets,
  );
  assert.deepEqual(result.desktop, [{ i: 'a', x: 0, y: 0, w: 12, h: 2 }]);
});

test('bố cục: dữ liệu rác không làm hỏng, chiều cao tối đa 40 hàng', () => {
  const widgets = [{ id: 'a', size: sizeOf(half) }];
  const result = normalizeLayouts({ desktop: [{ i: 'a', x: 'x', y: -5, w: 6.7, h: 999 }], tablet: 'rác', mobile: null }, widgets);
  assert.deepEqual(result.desktop, [{ i: 'a', x: 0, y: 0, w: 6, h: 40 }]);
  assert.equal(result.tablet.length, 1);
  assert.equal(normalizeLayouts(null, widgets).mobile.length, 1);
});
