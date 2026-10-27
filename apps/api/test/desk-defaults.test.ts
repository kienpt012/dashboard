import assert from 'node:assert/strict';
import test from 'node:test';
import { Role } from '@prisma/client';
import { defaultProfileConfig, defaultSpaces, newWidgetId } from '../src/desk/defaults';
import { normalizeProfileConfig, normalizeSpaceConfig } from '../src/desk/validate';

const ROLES = [Role.ADMIN, Role.LEADER, Role.CLERK, Role.MANAGER, Role.STAFF, Role.VIEWER];

test('bàn làm việc dựng sẵn: mọi vai trò qua bộ kiểm tra không mất widget nào, bố cục đủ 3 cỡ', () => {
  for (const role of ROLES) {
    const spaces = defaultSpaces(role, 'dept1');
    assert.ok(spaces.length >= 1, role);
    for (const space of spaces) {
      const normalized = normalizeSpaceConfig(space.config, role);
      assert.equal(normalized.widgets.length, space.config.widgets.length, `${role}/${space.name}`);
      for (const breakpoint of ['desktop', 'tablet', 'mobile'] as const) {
        assert.deepEqual(
          space.config.layouts[breakpoint].map(item => item.i).sort(),
          space.config.widgets.map(widget => widget.id).sort(),
          `${role}/${space.name}/${breakpoint}`,
        );
      }
    }
    const profile = defaultProfileConfig(role);
    assert.deepEqual(normalizeProfileConfig(profile).dock.items.length, profile.dock.items.length, role);
  }
});

test('bàn làm việc dựng sẵn: trưởng phòng có không gian Hằng ngày và Giao ban, theo phòng được truyền vào', () => {
  const spaces = defaultSpaces(Role.MANAGER, 'dept1');
  assert.deepEqual(spaces.map(space => space.name), ['Hằng ngày', 'Giao ban']);
  assert.ok(spaces.every(space => space.config.focusDepartmentId === 'dept1'));
  assert.ok(spaces[0].config.widgets.some(widget => widget.type === 'dept.team'));
});

test('bàn làm việc dựng sẵn: lãnh đạo không thuộc phòng nào thì chưa có phòng đang xem', () => {
  const [daily] = defaultSpaces(Role.LEADER, null);
  assert.equal(daily.config.focusDepartmentId, null);
  assert.ok(daily.config.widgets.some(widget => widget.type === 'dept.status'));
});

test('bàn làm việc dựng sẵn: chuyên viên chỉ có một không gian, không có widget nhân sự', () => {
  const spaces = defaultSpaces(Role.STAFF, 'dept1');
  assert.equal(spaces.length, 1);
  assert.ok(!spaces[0].config.widgets.some(widget => widget.type === 'dept.team'));
  assert.equal(spaces[0].config.widgets.filter(widget => widget.type === 'hero').length, 1);
});

test('dock dựng sẵn: chỉ người có quyền duyệt mới có lối tắt Duyệt báo cáo', () => {
  const paths = (role: Role) => defaultProfileConfig(role).dock.items.flatMap(item => ('path' in item ? [item.path] : []));
  assert.ok(!paths(Role.STAFF).includes('/admin/approvals'));
  assert.ok(!paths(Role.VIEWER).includes('/admin/approvals'));
  assert.ok(paths(Role.MANAGER).includes('/admin/approvals'));
  assert.ok(paths(Role.STAFF).includes('/admin/viec-cua-toi'));
});

test('mã widget mới đúng khuôn và không lặp', () => {
  const ids = new Set(Array.from({ length: 500 }, () => newWidgetId()));
  assert.equal(ids.size, 500);
  for (const value of ids) assert.match(value, /^w_[A-Za-z0-9]{12}$/);
});
