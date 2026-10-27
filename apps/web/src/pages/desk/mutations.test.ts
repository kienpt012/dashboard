import assert from 'node:assert/strict';
import test from 'node:test';
import { addWidget, canAddWidget, defaultSettings, duplicateWidget, moveWidget, newWidgetId, removeWidget, setLayout, updateWidget } from './mutations';
import type { DeskSpaceConfig, WidgetDefinition } from './types';

const size = { w: 6, h: 4, minW: 3, minH: 2 };
const def = (type: string, extra: Partial<WidgetDefinition> = {}): WidgetDefinition => ({
  type, category: 'personal', title: type, description: '', icon: 'edit', data: false, multiple: true,
  size: { desktop: size, tablet: { ...size }, mobile: { ...size, w: 4 } },
  fields: [
    { key: 'label', label: 'Tên', type: 'text', max: 60, default: 'Mốc' },
    { key: 'days', label: 'Ngày', type: 'number', min: 1, max: 30, default: 7 },
    { key: 'kinds', label: 'Loại', type: 'multiselect', options: [], default: [] },
    { key: 'targetId', label: 'Chỉ tiêu', type: 'target' },
    { key: 'items', label: 'Lối tắt', type: 'links', max: 5 },
  ],
  ...extra,
});
const empty = (): DeskSpaceConfig => ({ schemaVersion: 1, background: null, focusDepartmentId: null, widgets: [], layouts: { desktop: [], tablet: [], mobile: [] }, schedule: null });

test('cài đặt mặc định lấy từ khai báo trường', () => {
  assert.deepEqual(defaultSettings(def('countdown')), { label: 'Mốc', days: 7, kinds: [], targetId: null, items: [] });
});

test('thêm widget: có mã mới, cài đặt mặc định, đủ bố cục 3 cỡ; đặt đúng ô khi thả', () => {
  const first = addWidget(empty(), def('note'));
  assert.match(first.id, /^w_[A-Za-z0-9]{12}$/);
  assert.equal(first.config.widgets[0].settings.label, 'Mốc');
  assert.deepEqual(first.config.layouts.desktop, [{ i: first.id, x: 0, y: 0, w: 6, h: 4 }]);
  assert.equal(first.config.layouts.mobile.length, 1);
  const dropped = addWidget(first.config, def('note'), { breakpoint: 'desktop', x: 6, y: 10 });
  assert.deepEqual(dropped.config.layouts.desktop.find(item => item.i === dropped.id), { i: dropped.id, x: 6, y: 10, w: 6, h: 4 });
  assert.equal(dropped.config.layouts.tablet.some(item => item.i === dropped.id), true);
});

test('không thêm được lời chào thứ hai hoặc quá 40 widget', () => {
  const hero = def('hero', { multiple: false });
  const once = addWidget(empty(), hero).config;
  assert.equal(canAddWidget(once, hero), false);
  assert.equal(canAddWidget(once, def('note')), true);
  let full = empty();
  for (let index = 0; index < 40; index += 1) full = addWidget(full, def('note')).config;
  assert.equal(canAddWidget(full, def('note')), false);
});

test('xoá, nhân bản, sửa widget', () => {
  const added = addWidget(empty(), def('note'));
  const copy = duplicateWidget(updateWidget(added.config, added.id, widget => ({ ...widget, title: 'Ghi chú' })), added.id, def('note'));
  assert.equal(copy.config.widgets.length, 2);
  assert.notEqual(copy.id, added.id);
  assert.equal(copy.config.widgets[1].title, 'Ghi chú');
  const removed = removeWidget(copy.config, added.id);
  assert.deepEqual(removed.widgets.map(widget => widget.id), [copy.id]);
  assert.ok(removed.layouts.desktop.every(item => item.i === copy.id));
});

test('chuyển widget sang không gian khác giữ nguyên cài đặt', () => {
  const source = addWidget(empty(), def('note'));
  const withTitle = updateWidget(source.config, source.id, widget => ({ ...widget, title: 'Chuyển đi' }));
  const result = moveWidget(withTitle, empty(), source.id, def('note'));
  assert.equal(result.from.widgets.length, 0);
  assert.equal(result.to.widgets[0].title, 'Chuyển đi');
  assert.equal(result.to.layouts.desktop[0].i, source.id);
});

test('cập nhật bố cục một cỡ màn hình không đụng cỡ khác', () => {
  const added = addWidget(empty(), def('note'));
  const moved = setLayout(added.config, 'desktop', [{ i: added.id, x: 3, y: 2, w: 6, h: 5 }]);
  assert.deepEqual(moved.layouts.desktop, [{ i: added.id, x: 3, y: 2, w: 6, h: 5 }]);
  assert.deepEqual(moved.layouts.mobile, added.config.layouts.mobile);
});

test('mã widget không lặp', () => {
  assert.equal(new Set(Array.from({ length: 300 }, () => newWidgetId())).size, 300);
});
