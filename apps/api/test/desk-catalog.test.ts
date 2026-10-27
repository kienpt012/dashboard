import assert from 'node:assert/strict';
import test from 'node:test';
import { Role } from '@prisma/client';
import { catalogFor, DESK_COLUMNS, fieldsOf, widgetDefinition, WIDGETS } from '../src/desk/catalog';

const SPEC_TYPES = [
  'hero',
  'dept.status', 'dept.workload', 'dept.alerts', 'dept.ticker', 'dept.stalled', 'dept.recent', 'dept.deadlines',
  'dept.frameworks', 'dept.team', 'dept.feedback',
  'target.kpi', 'target.watchlist', 'target.chart',
  'my.work', 'my.notifications', 'docs.recent',
  'clock', 'calendar', 'notepad', 'todo', 'countdown', 'focus',
  'launcher', 'search', 'jarvis',
  'text', 'image',
];

test('sổ widget đủ 28 loại của đặc tả, không trùng type', () => {
  const types = WIDGETS.map(widget => widget.type);
  assert.equal(new Set(types).size, types.length, 'có type trùng');
  assert.deepEqual([...types].sort(), [...SPEC_TYPES].sort());
});

test('kích thước hợp lệ cho cả 3 cỡ màn hình', () => {
  for (const widget of WIDGETS) {
    for (const breakpoint of ['desktop', 'tablet', 'mobile'] as const) {
      const size = widget.size[breakpoint];
      const cols = DESK_COLUMNS[breakpoint];
      assert.ok(size.minW >= 1 && size.minW <= size.w && size.w <= cols, `${widget.type}/${breakpoint}: chiều ngang ${size.minW}..${size.w} vượt ${cols} cột`);
      assert.ok(size.minH >= 1 && size.minH <= size.h, `${widget.type}/${breakpoint}: chiều cao ${size.minH}..${size.h}`);
    }
  }
});

test('khoá trường cài đặt không trùng trong một widget', () => {
  for (const widget of WIDGETS) {
    const keys = fieldsOf(widget).map(field => field.key);
    assert.equal(new Set(keys).size, keys.length, `${widget.type} có khoá trùng: ${keys.join(', ')}`);
  }
});

test('widget nhân sự trong phòng không có cho chuyên viên và người xem', () => {
  assert.ok(!catalogFor(Role.STAFF).some(widget => widget.type === 'dept.team'));
  assert.ok(!catalogFor(Role.VIEWER).some(widget => widget.type === 'dept.team'));
  assert.ok(catalogFor(Role.MANAGER).some(widget => widget.type === 'dept.team'));
  assert.ok(catalogFor(Role.LEADER).some(widget => widget.type === 'dept.team'));
  assert.ok(catalogFor(Role.STAFF).some(widget => widget.type === 'dept.status'));
});

test('widget dữ liệu có thêm trường phòng và chu kỳ làm mới, widget cá nhân thì không', () => {
  const status = fieldsOf(widgetDefinition('dept.status')!);
  const department = status.find(field => field.key === 'departmentId');
  const refresh = status.find(field => field.key === 'refreshSeconds');
  assert.equal(department?.type, 'department');
  assert.equal(refresh?.type, 'number');
  assert.deepEqual(refresh && 'min' in refresh ? [refresh.min, refresh.max, refresh.default] : null, [30, 3600, 60]);
  const clockKeys = fieldsOf(widgetDefinition('clock')!).map(field => field.key);
  assert.ok(!clockKeys.includes('departmentId'));
  assert.ok(!clockKeys.includes('refreshSeconds'));
  assert.equal(widgetDefinition('khong-co'), undefined);
});

test('chỉ có một lời chào trên mỗi không gian', () => {
  assert.equal(widgetDefinition('hero')?.multiple, false);
  assert.equal(widgetDefinition('notepad')?.multiple, true);
});
