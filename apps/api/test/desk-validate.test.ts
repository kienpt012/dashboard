import assert from 'node:assert/strict';
import test from 'node:test';
import { Role } from '@prisma/client';
import {
  DeskConfigError,
  isInternalPath,
  isSafeUrl,
  normalizeBackground,
  normalizeProfileConfig,
  normalizeSpaceConfig,
  normalizeWidgetSettings,
} from '../src/desk/validate';
import { widgetDefinition } from '../src/desk/catalog';

const widget = (id: string, type: string, settings: Record<string, unknown> = {}) => ({ id, type, title: null, settings, style: {} });

test('URL ngoài: chỉ http/https, không kèm thông tin đăng nhập', () => {
  assert.equal(isSafeUrl('javascript:alert(1)'), false);
  assert.equal(isSafeUrl('data:text/html,<b>x</b>'), false);
  assert.equal(isSafeUrl('https://user:pw@a.vn'), false);
  assert.equal(isSafeUrl('https://dichvucong.gov.vn/p/home'), true);
  assert.equal(isSafeUrl('http://10.0.0.5:8080/camera'), true);
  assert.equal(isSafeUrl(`https://a.vn/${'x'.repeat(2001)}`), false);
});

test('đường dẫn nội bộ: chỉ khu quản trị, trình chiếu, phản ánh', () => {
  assert.equal(isInternalPath('/admin/targets?status=OVERDUE'), true);
  assert.equal(isInternalPath('/admin'), true);
  assert.equal(isInternalPath('/trinh-chieu'), true);
  assert.equal(isInternalPath('/phan-anh/cong-khai/PA-1'), true);
  assert.equal(isInternalPath('//evil.com'), false);
  assert.equal(isInternalPath('/api/users'), false);
  assert.equal(isInternalPath('/administrator'), false);
  assert.equal(isInternalPath('/admin/../api/users'), false);
  assert.equal(isInternalPath('https://evil.com/admin'), false);
});

test('cấu hình hồ sơ rỗng được điền đủ mặc định', () => {
  const config = normalizeProfileConfig({});
  assert.equal(config.schemaVersion, 1);
  assert.deepEqual(config.appearance.background, { kind: 'daylight' });
  assert.equal(config.appearance.dim, 25);
  assert.equal(config.appearance.surface, 'glass');
  assert.equal(config.appearance.surfaceOpacity, 82);
  assert.equal(config.startPage, 'desk');
  assert.equal(config.dock.position, 'bottom');
  assert.equal(config.greeting.show, true);
  assert.deepEqual(config.searchProviders.map(provider => provider.name), ['Google', 'Thư viện pháp luật', 'Cổng Dịch vụ công']);
});

test('cấu hình hồ sơ: số ngoài khoảng bị kẹp, giá trị lạ về mặc định', () => {
  const config = normalizeProfileConfig({ appearance: { dim: 500, blur: -3, fontScale: 300, surface: 'neon', accent: 'red', radius: 99 }, startPage: 'bogus' });
  assert.equal(config.appearance.dim, 80);
  assert.equal(config.appearance.blur, 0);
  assert.equal(config.appearance.fontScale, 125);
  assert.equal(config.appearance.surface, 'glass');
  assert.equal(config.appearance.accent, null);
  assert.equal(config.appearance.radius, 20);
  assert.equal(config.startPage, 'desk');
});

test('dock: bỏ mục URL không an toàn, đường dẫn ngoài khu quản trị, thư mục lồng thư mục', () => {
  const config = normalizeProfileConfig({
    dock: {
      items: [
        { id: 'a', kind: 'link', url: 'javascript:alert(1)', label: 'Xấu', icon: 'link' },
        { id: 'b', kind: 'link', url: 'https://dichvucong.gov.vn', label: 'DVC', icon: 'global' },
        { id: 'c', kind: 'view', path: '/api/users', label: 'Xấu', icon: 'link' },
        { id: 'd', kind: 'screen', path: '/admin/targets', label: 'Chỉ tiêu', icon: 'aim' },
        {
          id: 'e', kind: 'folder', label: 'Thư mục', icon: 'folder',
          items: [
            { id: 'f', kind: 'folder', label: 'Lồng', icon: 'folder', items: [] },
            { id: 'g', kind: 'link', url: 'https://thuvienphapluat.vn', label: 'TVPL', icon: 'book' },
          ],
        },
      ],
    },
  });
  assert.deepEqual(config.dock.items.map(item => item.id), ['b', 'd', 'e']);
  const folder = config.dock.items[2];
  assert.ok(folder.kind === 'folder');
  assert.deepEqual(folder.items.map(item => item.id), ['g']);
});

test('hình nền: trình chiếu không lồng trình chiếu, nền lạ về theo giờ trong ngày', () => {
  const slideshow = normalizeBackground({
    kind: 'slideshow', minutes: 999, shuffle: true,
    items: [
      { kind: 'preset', id: 'bien' },
      { kind: 'slideshow', items: [], minutes: 5 },
      { kind: 'color', color: '#112233' },
    ],
  });
  assert.deepEqual(slideshow, { kind: 'slideshow', minutes: 240, shuffle: true, items: [{ kind: 'preset', id: 'bien' }, { kind: 'color', color: '#112233' }] });
  assert.deepEqual(normalizeBackground({ kind: 'preset', id: 'khong-co' }), { kind: 'daylight' });
  assert.deepEqual(normalizeBackground({ kind: 'image', assetId: 'x y' }), { kind: 'daylight' });
  assert.deepEqual(normalizeBackground({ kind: 'gradient', stops: ['#000000'], angle: 30 }), { kind: 'daylight' });
});

test('cài đặt widget: số bị kẹp, liên kết không an toàn thành rỗng, trường lạ bị bỏ', () => {
  const alerts = normalizeWidgetSettings(widgetDefinition('dept.alerts')!, { maxItems: 999, minSeverity: 'xyz', kinds: ['OVERDUE', 'BOGUS', 'OVERDUE'], hacker: true });
  assert.equal(alerts.maxItems, 40);
  assert.equal(alerts.minSeverity, 'info');
  assert.deepEqual(alerts.kinds, ['OVERDUE']);
  assert.equal('hacker' in alerts, false);
  assert.equal(alerts.refreshSeconds, 60);
  assert.equal(alerts.departmentId, null);
  const image = normalizeWidgetSettings(widgetDefinition('image')!, { link: 'javascript:x', caption: 'a'.repeat(500) });
  assert.equal(image.link, null);
  assert.equal((image.caption as string).length, 120);
  const clock = normalizeWidgetSettings(widgetDefinition('clock')!, { timezones: ['Asia/Tokyo', 'Mars/Base', 'Europe/London', 'Asia/Tokyo', 'America/New_York'] });
  assert.deepEqual(clock.timezones, ['Asia/Tokyo', 'Europe/London', 'America/New_York']);
});

test('không gian: bỏ widget vai trò không được dùng, loại lạ, lời chào thứ hai; bố cục đủ mục', () => {
  const config = normalizeSpaceConfig(
    {
      widgets: [
        widget('w_team00001', 'dept.team'),
        widget('w_stat00001', 'dept.status'),
        widget('w_none00001', 'khong-co'),
        widget('w_hero00001', 'hero'),
        widget('w_hero00002', 'hero'),
        widget('bad id', 'clock'),
      ],
      layouts: { desktop: [] },
    },
    Role.STAFF,
  );
  assert.deepEqual(config.widgets.map(item => item.id), ['w_stat00001', 'w_hero00001']);
  assert.deepEqual(config.layouts.mobile.map(item => item.i).sort(), ['w_hero00001', 'w_stat00001']);
  const manager = normalizeSpaceConfig({ widgets: [widget('w_team00001', 'dept.team')] }, Role.MANAGER);
  assert.deepEqual(manager.widgets.map(item => item.type), ['dept.team']);
});

test('không gian: quá 40 widget bị cắt, JSON quá 256 KB bị từ chối', () => {
  const many = Array.from({ length: 45 }, (_, index) => widget(`w_note${String(index).padStart(5, '0')}`, 'notepad'));
  assert.equal(normalizeSpaceConfig({ widgets: many }, Role.STAFF).widgets.length, 40);
  const huge = { widgets: [widget('w_text00001', 'text', { body: 'x'.repeat(300 * 1024) })] };
  assert.throws(() => normalizeSpaceConfig(huge, Role.STAFF), DeskConfigError);
  assert.throws(() => normalizeProfileConfig({ greeting: { name: 'x'.repeat(70 * 1024) } }), DeskConfigError);
  assert.throws(() => normalizeProfileConfig(null), DeskConfigError);
});
